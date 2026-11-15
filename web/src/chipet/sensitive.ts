/**
 * 留言敏感词过滤。
 * 词库来源：
 * - npm `sensitive-word-tool` 内置默认词（广告 / 政治 / 色情 / 暴恐，DFA）
 * - 额外合并开源库 fwwdn/sensitive-stop-words（色情类、广告、涉枪涉爆）精选词条
 *   https://github.com/fwwdn/sensitive-stop-words （Apache-2.0）
 */
import SensitiveWordTool from 'sensitive-word-tool';
import { tr } from '../i18n.ts';
import extraWords from './sensitive-words.json';

/** Chipet 玩法里常见、容易被误伤的词，检测前先占位保护 */
const SAFE_PHRASES = [
  '芯喵', '芯宠', '小鱼干', '鱼干', '摸摸', '摸头', '敲蛋', '破壳', '通电', '牵线',
  '对战', '训练场', '广场', '图鉴', '心脏电路', 'TapeOut', 'Chipet', 'BEM',
] as const;

const tool = new SensitiveWordTool({ useDefaultWords: true });
tool.addWords(extraWords as string[]);

function withSafeMasked(text: string): { masked: string; restore: (s: string) => string } {
  const slots: string[] = [];
  let masked = text;
  for (const phrase of SAFE_PHRASES) {
    if (!phrase) continue;
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    masked = masked.replace(re, () => {
      const i = slots.length;
      slots.push(phrase);
      return `\u0000${i}\u0000`;
    });
  }
  return {
    masked,
    restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[Number(i)] ?? ''),
  };
}

/** 是否含敏感词（已避开玩法白名单） */
export function hasSensitive(text: string): boolean {
  const { masked } = withSafeMasked(text);
  return tool.verify(masked);
}

/** 命中的敏感词（调试 / 提示用，不展示具体脏词给用户） */
export function matchSensitive(text: string): string[] {
  const { masked } = withSafeMasked(text);
  return tool.match(masked);
}

/** 把敏感词替换成 ＊ */
export function maskSensitive(text: string, ch = '＊'): string {
  const { masked, restore } = withSafeMasked(text);
  return restore(tool.filter(masked, ch));
}

/**
 * 留言提交前校验：含敏感词则拒绝发送（短留言用拦截比打码更清晰）。
 */
export function assertCleanNote(text: string): void {
  if (!hasSensitive(text)) return;
  throw new Error(tr('留言含有敏感词，请修改后再发送', 'Your note contains blocked words. Please edit and try again'));
}
