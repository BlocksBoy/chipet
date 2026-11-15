/**
 * 留言入口安全加固：输入清洗、禁链、限流、反刷。
 * 展示侧用 React 文本节点（已转义）；这里再挡链接 / 控制字符 / 洪水。
 */
import { tr } from '../i18n.ts';
import { assertCleanNote } from './sensitive.ts';

export const NOTE_MAX_LEN = 60;
const NOTE_MIN_LEN = 1;
/** 同一宠物最短间隔 */
const COOLDOWN_MS = 8_000;
/** 滑动窗口内全局上限 */
const WINDOW_MS = 60_000;
const WINDOW_MAX = 5;
/** 同一宠物 5 分钟内上限 */
const PET_WINDOW_MS = 5 * 60_000;
const PET_WINDOW_MAX = 3;

const RATE_KEY = 'chipet.note.rate.v1';

type RateState = {
  /** 全局时间戳 */
  at: number[];
  /** petKey -> 时间戳 */
  byPet: Record<string, number[]>;
  /** petKey -> 上一条正文（防连刷同一句） */
  last: Record<string, string>;
};

function loadRate(): RateState {
  try {
    const raw = JSON.parse(sessionStorage.getItem(RATE_KEY) || 'null') as RateState | null;
    if (raw && Array.isArray(raw.at) && raw.byPet && raw.last) return raw;
  } catch { /* ignore */ }
  return { at: [], byPet: {}, last: {} };
}

function saveRate(s: RateState) {
  try {
    sessionStorage.setItem(RATE_KEY, JSON.stringify(s));
  } catch { /* 隐私模式等写失败时仍靠内存；本页刷新前有效 */ }
}

/** 去掉控制符、零宽、双向覆盖等，压成单行纯文本 */
export function scrubNoteText(input: unknown): string {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFKC');
  // C0 / C1 控制符、DEL
  s = s.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  // 零宽 / BOM / 词连接符 / bidi 隔离与覆盖（可藏链接或搅乱展示）
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g, '');
  // 换行、制表 → 空格，留言保持单行
  s = s.replace(/[\s\u00A0\u2028\u2029]+/g, ' ').trim();
  return s.slice(0, NOTE_MAX_LEN);
}

/**
 * 检测外链 / 伪协议 / 常见短链形态。
 * 先去掉空白再匹配，防止 `h t t p : / /` 或 `ex ample .com` 绕过。
 */
export function hasBlockedLink(text: string): boolean {
  const compact = text.replace(/[\s\-_.•·‧∙⋅]+/g, '').toLowerCase();
  const spaced = text.toLowerCase();

  if (/(?:https?|ftp|mailto|data|javascript|vbscript|file|blob):/i.test(spaced)) return true;
  if (/(?:https?|ftp|mailto|data|javascript|vbscript|file|blob):/i.test(compact)) return true;
  // 协议相对 //example.com
  if (/\/\\?\/[a-z0-9.-]+\.[a-z]{2,}/i.test(compact)) return true;
  if (/\bwww\./i.test(spaced) || /www\./i.test(compact)) return true;
  // markdown / html 链
  if (/\[[^\]]{0,80}\]\(\s*(?:https?:|\/\/|www\.)/i.test(spaced)) return true;
  if (/<\s*a\b/i.test(spaced) || /href\s*=/i.test(spaced)) return true;
  // 常见域名 / 短链（留言里不该出现）
  if (/(?:^|[^a-z0-9])(?:t\.me|bit\.ly|tinyurl\.com|t\.cn|dwz\.cn|url\.cn|jq\.qq\.com|discord\.gg)(?:\/|$|[^a-z0-9])/i.test(spaced)) return true;
  if (/\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\.(?:com|cn|net|org|io|xyz|top|cc|tv|me|co|info|app|dev|link|click|tk|ml|ga|cf|gq|ru|uk|jp|edu|gov|shop|vip|site|online|club)(?:\/|:|\b)/i.test(spaced)) return true;
  if (/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:\/|\b)/.test(spaced)) return true;
  // 中文「点」拆域名：例 微信点com / 例子.com
  if (/(?:[a-z0-9]|[\u4e00-\u9fff]){2,}(?:点|\.|。|．)(?:com|cn|net|org|xyz|top|vip|cc)\b/i.test(spaced)) return true;
  return false;
}

/** 明显刷屏：同一字符占比过高 */
function isRepetitiveSpam(text: string): boolean {
  if (text.length < 8) return false;
  const counts = new Map<string, number>();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let max = 0;
  for (const n of counts.values()) max = Math.max(max, n);
  return max / text.length >= 0.7;
}

function assertRate(petKey: string, text: string) {
  const now = Date.now();
  const s = loadRate();
  s.at = s.at.filter((t) => now - t < WINDOW_MS);
  const petAt = (s.byPet[petKey] ?? []).filter((t) => now - t < PET_WINDOW_MS);
  s.byPet[petKey] = petAt;

  const lastAt = petAt[petAt.length - 1];
  if (lastAt != null && now - lastAt < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastAt)) / 1000);
    throw new Error(tr(`留言太快了，请 ${wait} 秒后再试`, `Too fast — wait ${wait}s and try again`));
  }
  if (s.at.length >= WINDOW_MAX) {
    throw new Error(tr('留言过于频繁，请稍后再试', 'Too many notes. Please try again later'));
  }
  if (petAt.length >= PET_WINDOW_MAX) {
    throw new Error(tr('这只芯喵门口留言太多了，过几分钟再来', 'Too many notes on this kitty. Come back in a few minutes'));
  }
  if (s.last[petKey] === text) {
    throw new Error(tr('请不要重复发送同一条留言', "Don't post the same note twice"));
  }

  s.at.push(now);
  petAt.push(now);
  s.byPet[petKey] = petAt;
  s.last[petKey] = text;
  // 修剪存储，避免 sessionStorage 膨胀
  if (s.at.length > 20) s.at = s.at.slice(-20);
  for (const k of Object.keys(s.byPet)) {
    if (s.byPet[k]!.length === 0 && k !== petKey) delete s.byPet[k];
  }
  saveRate(s);
}

/**
 * 留言提交统一入口：清洗 → 结构校验 → 禁链 → 敏感词 → 限流。
 * 返回可安全入库的纯文本。
 */
export function prepareNote(petKey: string, raw: unknown): string {
  if (typeof petKey !== 'string' || !petKey || petKey.length > 128) {
    throw new Error(tr('无效的留言目标', 'Invalid note target'));
  }
  if (typeof raw !== 'string') {
    throw new Error(tr('留言格式无效', 'Invalid note format'));
  }
  // 原始过长直接拒，防在 scrub 前占用过多内存
  if (raw.length > NOTE_MAX_LEN * 4) {
    throw new Error(tr('留言过长', 'Note is too long'));
  }

  const text = scrubNoteText(raw);
  if (text.length < NOTE_MIN_LEN) {
    throw new Error(tr('写点什么再发送吧', 'Write something before sending'));
  }
  if (text.length > NOTE_MAX_LEN) {
    throw new Error(tr(`留言最多 ${NOTE_MAX_LEN} 字`, `Notes are limited to ${NOTE_MAX_LEN} characters`));
  }
  if (hasBlockedLink(text)) {
    throw new Error(tr('留言不能包含网络链接或网址', 'Notes can’t include links or URLs'));
  }
  if (isRepetitiveSpam(text)) {
    throw new Error(tr('留言内容无效，请换一句再说', 'That note looks invalid. Please write something else'));
  }
  // 拒绝明显的标签/实体注入尝试（React 已转义，仍作拒绝信号）
  if (/<\s*\/?\s*(?:script|iframe|object|embed|img|svg|link|meta|style|form)\b/i.test(text)) {
    throw new Error(tr('留言包含不允许的内容', 'Note contains disallowed content'));
  }
  if (/&#\{?x?[0-9a-f]+\}?;?/i.test(text) || /&(?:lt|gt|quot|apos|nbsp)\s*;/i.test(text)) {
    throw new Error(tr('留言包含不允许的内容', 'Note contains disallowed content'));
  }

  assertCleanNote(text);
  assertRate(petKey, text);
  return text;
}
