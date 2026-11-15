/** 由电路身份派生外形指纹（CryptoKitties 式 Cattributes）。同 cpu+circuitId 永远同一张脸。 */
import { both, tr, txt, type Txt } from '../i18n.ts';

export type Rarity = 0 | 1 | 2;

export interface Phenotype {
  speciesId: number;
  species: string;
  body: string;
  belly: string;
  accent: string;
  /** 描边色：毛色加深，不用纯黑 */
  outline: string;
  /** 这只猫专属的粉彩底卡色 */
  bg: string;
  eye: string;
  eyeName: string;
  cheek: string;
  pattern: number;
  patternName: string;
  ear: number;
  /** 0 卷钩 · 1 蓬松 · 2 翘尾 */
  tail: number;
  /** 0 w 嘴 · 1 吐舌 · 2 张嘴笑 · 3 小虎牙 */
  mouth: number;
  /** 0 圆眼 · 1 睫毛 · 2 慵懒半睁 */
  eyeShape: number;
  rarity: Rarity;
  typeName: string;
  vibe: string;
  blurb: string;
  coat: string;
}

/** 对齐加密猫 Kitty Types：Normal / Fancy / Exclusive（Special Edition 并入 Fancy） */
const TYPE_NAME: Txt[] = [both('普通 Normal', 'Normal'), both('珍奇 Fancy', 'Fancy'), both('限定 Exclusive', 'Exclusive')];
const RARITY_NAME: Txt[] = [both('普通', 'Normal'), both('珍奇', 'Fancy'), both('限定', 'Exclusive')];

/** 英文 blurb 接在 "It …" 后面读。 */
const SPECIES: { name: Txt; vibe: Txt; blurb: Txt }[] = [
  { name: both('芯喵', 'Chip Cat'), vibe: both('机灵', 'clever'), blurb: both('尾巴尖上藏着一枚小芯片', 'hides a tiny chip in the tip of its tail') },
  { name: both('龙喵', 'Dragon Cat'), vibe: both('好胜', 'feisty'), blurb: both('毛色纹理像电路走线', 'has fur patterned like circuit traces') },
  { name: both('软喵', 'Jelly Cat'), vibe: both('软萌', 'cuddly'), blurb: both('身体里漂着发光的逻辑门', 'has glowing logic gates drifting inside its body') },
  { name: both('雀喵', 'Sparrow Cat'), vibe: both('轻快', 'breezy'), blurb: both('呼噜是高低电平的节拍', 'purrs in a beat of highs and lows') },
  { name: both('核喵', 'Core Cat'), vibe: both('慵懒', 'lazy'), blurb: both('午睡时仍在跑时钟信号', 'keeps its clock ticking even while napping') },
  { name: both('兔喵', 'Bunny Cat'), vibe: both('敏捷', 'agile'), blurb: both('耳朵是两根灵敏的天线', 'has two sensitive antennas for ears') },
  { name: both('甲喵', 'Armor Cat'), vibe: both('稳重', 'steady'), blurb: both('背纹印着对称的版图', 'wears a symmetric chip layout on its back') },
  { name: both('水喵', 'Aqua Cat'), vibe: both('飘逸', 'graceful'), blurb: both('毛尖随比特起伏', 'has fur tips that ripple with every bit') },
];

export const SPECIES_COUNT = SPECIES.length;
/** 全部物种（图鉴用）。文字是 getter，跟着当前语言走。 */
export const speciesList = () => SPECIES.map((sp, id) => ({
  id,
  get name() { return txt(sp.name); },
  get vibe() { return txt(sp.vibe); },
  get blurb() { return txt(sp.blurb); },
}));

/** 底卡色取自加密猫白皮书封面：桃 / 天蓝 / 粉 / 丁香 / 薄荷 / 奶黄 / 青柠 / 米。 */
const COATS: { name: string; body: string; belly: string; accent: string; bg: string }[] = [
  { name: 'nachocheez', body: '#f7a13c', belly: '#fff1dc', accent: '#d9701f', bg: '#ffe8d1' },
  { name: 'cottoncandy', body: '#f8a9cc', belly: '#fff0f6', accent: '#e0629e', bg: '#f9dcf5' },
  { name: 'martian', body: '#7ed957', belly: '#effbe2', accent: '#3f9a2b', bg: '#e6f5c9' },
  { name: 'glacier', body: '#8fd0f4', belly: '#f0faff', accent: '#3d8fc4', bg: '#fef6cf' },
  { name: 'bananacream', body: '#fbe07a', belly: '#fffbe2', accent: '#d9a520', bg: '#fef6cf' },
  { name: 'shadowgrey', body: '#8b93a1', belly: '#f1f3f6', accent: '#525a68', bg: '#cdf5d8' },
  { name: 'cloudwhite', body: '#f7f3ec', belly: '#ffffff', accent: '#d8b9a0', bg: '#fbdcee' },
  { name: 'onyx', body: '#4b4b57', belly: '#b9b9c6', accent: '#2a2a32', bg: '#d6f0ee' },
  { name: 'dragonfruit', body: '#d070e0', belly: '#f9e3fc', accent: '#8f3ba3', bg: '#c9eefb' },
  { name: 'redvelvet', body: '#f26b6b', belly: '#fff0ee', accent: '#c23a3a', bg: '#fddcdc' },
  { name: 'cinderella', body: '#6fb0f7', belly: '#eaf4ff', accent: '#2d6fc0', bg: '#c9eefb' },
  { name: 'brownies', body: '#a2714e', belly: '#f6e6d4', accent: '#6b4128', bg: '#efe9de' },
  { name: 'tundra', body: '#d2bd9c', belly: '#fbf5ea', accent: '#94795a', bg: '#f3e6b8' },
  { name: 'hotcocoa', body: '#7a4e3a', belly: '#ecd4bf', accent: '#4a2a1e', bg: '#ffe8d1' },
  { name: 'cornflower', body: '#7f8ff0', belly: '#eaedff', accent: '#4553c4', bg: '#fef6cf' },
  { name: 'icicle', body: '#d6eefb', belly: '#ffffff', accent: '#7fb6d6', bg: '#cfe6fb' },
  { name: 'seafoam', body: '#62d6c2', belly: '#e6fbf6', accent: '#249682', bg: '#fddcdc' },
  { name: 'lavender', body: '#b99cf5', belly: '#f4eeff', accent: '#7a52cc', bg: '#fef6cf' },
  { name: 'apricot', body: '#f8a871', belly: '#fff0e2', accent: '#d5703a', bg: '#d6f0ee' },
  { name: 'mintchip', body: '#86dcb2', belly: '#ecfbf2', accent: '#3a9c6c', bg: '#e6f5c9' },
  { name: 'grapejelly', body: '#8b62cc', belly: '#eee2fb', accent: '#553493', bg: '#f9dcf5' },
  { name: 'salmon', body: '#f98b7a', belly: '#fff0ea', accent: '#c94f43', bg: '#ffe8d1' },
  { name: 'inkblue', body: '#4a5cb0', belly: '#dfe6fb', accent: '#28357a', bg: '#c9eefb' },
  { name: 'honeydew', body: '#d0ef8a', belly: '#f8fde6', accent: '#84ad2e', bg: '#cdf5d8' },
];

const EYES: { name: string; color: string }[] = [
  { name: 'gold', color: '#f5b93c' },
  { name: 'mint', color: '#4fd1b0' },
  { name: 'bubblegum', color: '#ff6fa3' },
  { name: 'sky', color: '#5fa8ff' },
  { name: 'orchid', color: '#f03fd8' },
  { name: 'lime', color: '#8ad64a' },
  { name: 'violet', color: '#a47bff' },
  { name: 'peach', color: '#ff8a5c' },
  { name: 'cobalt', color: '#3f7af0' },
  { name: 'copper', color: '#e07a45' },
  { name: 'teal', color: '#1fa89a' },
  { name: 'amber', color: '#e0a012' },
  { name: 'pearl', color: '#e9eef5' },
  { name: 'onyxeye', color: '#3a3a44' },
];

const PATTERNS: Txt[] = [both('纯色', 'solid'), both('虎纹', 'tiger'), both('圆点', 'speckles'), both('花斑', 'calico')];
const CHEEK = ['#ff9db8', '#ff8fa3', '#ffb08a', '#f79ac8', '#ffa6a6'];

function mix(a: string, b: string | number | bigint): number {
  let h = 2166136261;
  const s = `${a.toLowerCase()}#${b}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 两个 #rrggbb 按 t 混合（t=1 全取 b）。 */
function blend(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rarityLabel(r: Rarity) {
  return txt(RARITY_NAME[r]);
}

export function typeLabel(r: Rarity) {
  return txt(TYPE_NAME[r]);
}

export function phenotypeOf(cpu: string, circuitId: bigint | number | string, rarity: Rarity = 0): Phenotype {
  const h = mix(cpu, circuitId);
  const speciesId = h % SPECIES.length;
  const sp = SPECIES[speciesId]!;
  const coat = COATS[(h >>> 3) % COATS.length]!;
  const eye = EYES[(h >>> 9) % EYES.length]!;
  const pattern = (h >>> 15) % 4;
  const pat = PATTERNS[pattern]!;
  // 文字类字段用 getter：切换语言后，已经算好的 Phenotype 也跟着变
  return {
    speciesId,
    get species() { return txt(sp.name); },
    coat: coat.name,
    body: coat.body,
    belly: coat.belly,
    accent: coat.accent,
    outline: blend(coat.accent, '#2a1c1c', 0.62),
    bg: coat.bg,
    eye: eye.color,
    eyeName: eye.name,
    cheek: CHEEK[(h >>> 12) % CHEEK.length]!,
    pattern,
    get patternName() { return tr(`${pat.zh} ${pat.en}`, pat.en); },
    ear: (h >>> 18) % 3,
    tail: (h >>> 21) % 3,
    mouth: (h >>> 24) % 4,
    eyeShape: (h >>> 27) % 3,
    rarity,
    get typeName() { return txt(TYPE_NAME[rarity]); },
    get vibe() { return txt(sp.vibe); },
    get blurb() { return txt(sp.blurb); },
  };
}

export function geneStory(p: Phenotype, gates?: number) {
  const g = gates && gates > 0 ? tr(`${gates} 个逻辑门`, `${gates} logic gates`) : tr('一枚链上电路', 'an on-chain circuit');
  return tr(
    `这只${p.species}（${p.coat}）的心脏是${g}。毛色 ${p.coat} · 瞳色 ${p.eyeName} · 花纹 ${p.patternName}。${p.blurb}。类型：${p.typeName}。`,
    `This ${p.species} (${p.coat}) has a heart made of ${g}. Coat ${p.coat} · eyes ${p.eyeName} · pattern ${p.patternName}. It ${p.blurb}. Type: ${p.typeName}.`,
  );
}

export function cattributes(p: Phenotype) {
  return [
    { label: 'base', value: p.coat },
    { label: 'eyes', value: p.eyeName },
    { label: 'pattern', value: txt(PATTERNS[p.pattern]) },
    { label: 'type', value: txt(RARITY_NAME[p.rarity]) },
  ];
}
