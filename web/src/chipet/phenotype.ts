/**
 * 由电路身份派生外形指纹（CryptoKitties 式 Cattributes）。
 * 主特征锁在 cpu+circuitId；可选 seed（宠物 id/名/孵化时间）只做细微色泽与五官差。
 */
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
  /** 0 尖耳 · 1 圆耳 · 2 折耳 · 3 长耳 · 4 翅耳 */
  ear: number;
  earName: string;
  /** 0 卷钩 · 1 蓬松 · 2 翘尾 · 3 短 stub · 4 问号尾 */
  tail: number;
  /** 0 w 嘴 · 1 吐舌 · 2 张嘴笑 · 3 小虎牙 */
  mouth: number;
  /** 0 圆眼 · 1 睫毛 · 2 慵懒半睁 · 3 异色感（高光偏移） */
  eyeShape: number;
  /** 0 标准 · 1 圆墩 · 2 瘦高 · 3 吐司蹲 */
  bodyShape: number;
  bodyShapeName: string;
  /** 0 一撮 · 1 无 · 2 乱毛 · 3 莫霍克 · 4 双螺旋 */
  tuft: number;
  /** 0 无 · 1 项圈 · 2 蝴蝶结 · 3 天线芯片 · 4 圆眼镜 · 5 铃铛 · 6 小围巾 */
  accessory: number;
  accessoryName: string;
  nose: string;
  /** 是否有雀斑 */
  freckles: boolean;
  /** 是否有爪垫高亮 */
  pawPads: boolean;
  /** 0 短须 · 1 标准 · 2 长须 */
  whisker: number;
  /** 瞳孔水平微调（同电路个体差） */
  gaze: number;
  /** 腮红透明度 0.45–0.9 */
  blush: number;
  /** 花纹装饰轻微平移 */
  markJitter: number;
  rarity: Rarity;
  typeName: string;
  vibe: string;
  blurb: string;
  coat: string;
}

/** 把一只宠的稳定身份收成 seed，同电路不同宠也会有细微差。 */
export function petSeed(p: {
  id?: number | string;
  name?: string;
  hatchedAt?: number;
  key?: string;
  owner?: string;
}): string {
  return [p.key ?? p.id ?? '', p.name ?? '', p.hatchedAt ?? 0, p.owner ?? ''].join(':');
}

/** 对齐加密猫 Kitty Types：Normal / Fancy / Exclusive（Special Edition 并入 Fancy） */
const TYPE_NAME: Txt[] = [both('普通', 'Normal'), both('珍奇', 'Fancy'), both('限定', 'Exclusive')];
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
  { name: both('狐喵', 'Fox Cat'), vibe: both('狡黠', 'sly'), blurb: both('眼神像在调试别人的代码', 'looks like it’s debugging someone else’s code') },
  { name: both('熊喵', 'Bear Cat'), vibe: both('憨厚', 'cozy'), blurb: both('抱起来像一颗暖乎乎的电阻', 'feels like a warm resistor when hugged') },
  { name: both('月喵', 'Moon Cat'), vibe: both('安静', 'quiet'), blurb: both('夜里会轻轻闪一颗时钟星', 'softly blinks a clock-star at night') },
  { name: both('星喵', 'Star Cat'), vibe: both('闪亮', 'sparkly'), blurb: both('每一步都像点亮一盏 LED', 'lights an LED with every step') },
  { name: both('虎喵', 'Tiger Cat'), vibe: both('霸气', 'bold'), blurb: both('花纹是放大的走线总线', 'wears tiger stripes like a fat bus of traces') },
  { name: both('幽灵喵', 'Ghost Cat'), vibe: both('神秘', 'eerie'), blurb: both('半透明时仍能看见内部网表', 'stays translucent enough to show its netlist') },
  { name: both('焊喵', 'Solder Cat'), vibe: both('勤快', 'handy'), blurb: both('胡须尖有一点锡的光泽', 'has whisker tips with a solder sheen') },
  { name: both('比特喵', 'Bit Cat'), vibe: both('跳跃', 'bouncy'), blurb: both('走路节奏像在跳二进制', 'walks in a binary bounce') },
  { name: both('云喵', 'Cloud Cat'), vibe: both('飘忽', 'dreamy'), blurb: both('一团毛像刚出炉的棉花糖', 'is a puff of fur like fresh cotton candy') },
  { name: both('墨喵', 'Ink Cat'), vibe: both('沉静', 'stoic'), blurb: both('留下的爪印像示波器波形', 'leaves paw prints shaped like scope waves') },
  { name: both('糖喵', 'Candy Cat'), vibe: both('甜蜜', 'sweet'), blurb: both('腮红甜得像刚焊好的糖霜', 'has cheeks sweet as fresh solder frosting') },
  { name: both('雷喵', 'Thunder Cat'), vibe: both('冲动', 'zippy'), blurb: both('炸毛时像静电放电', 'fluffs up like a static discharge') },
  { name: both('森喵', 'Grove Cat'), vibe: both('温厚', 'gentle'), blurb: both('身上带着一股新开板的松香味', 'smells faintly of fresh board flux') },
  { name: both('沙喵', 'Dune Cat'), vibe: both('悠闲', 'chill'), blurb: both('打滚时扬起一串时钟沙', 'kicks up a trail of clock-sand when it rolls') },
  { name: both('霓喵', 'Neon Cat'), vibe: both('吵闹', 'loud'), blurb: both('夜里轮廓会自己发光', 'outlines itself in neon after dark') },
  { name: both('瓷喵', 'Porcelain Cat'), vibe: both('精致', 'dainty'), blurb: both('耳朵薄得像陶瓷封装', 'has ears thin as porcelain packaging') },
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
const COATS: { name: Txt; body: string; belly: string; accent: string; bg: string }[] = [
  { name: both('芝士橙', 'nachocheez'), body: '#f7a13c', belly: '#fff1dc', accent: '#d9701f', bg: '#ffe8d1' },
  { name: both('棉花糖', 'cottoncandy'), body: '#f8a9cc', belly: '#fff0f6', accent: '#e0629e', bg: '#f9dcf5' },
  { name: both('火星绿', 'martian'), body: '#7ed957', belly: '#effbe2', accent: '#3f9a2b', bg: '#e6f5c9' },
  { name: both('冰川蓝', 'glacier'), body: '#8fd0f4', belly: '#f0faff', accent: '#3d8fc4', bg: '#fef6cf' },
  { name: both('香蕉奶', 'bananacream'), body: '#fbe07a', belly: '#fffbe2', accent: '#d9a520', bg: '#fef6cf' },
  { name: both('影灰', 'shadowgrey'), body: '#8b93a1', belly: '#f1f3f6', accent: '#525a68', bg: '#cdf5d8' },
  { name: both('云白', 'cloudwhite'), body: '#f7f3ec', belly: '#ffffff', accent: '#d8b9a0', bg: '#fbdcee' },
  { name: both('墨玉', 'onyx'), body: '#4b4b57', belly: '#b9b9c6', accent: '#2a2a32', bg: '#d6f0ee' },
  { name: both('火龙果', 'dragonfruit'), body: '#d070e0', belly: '#f9e3fc', accent: '#8f3ba3', bg: '#c9eefb' },
  { name: both('红丝绒', 'redvelvet'), body: '#f26b6b', belly: '#fff0ee', accent: '#c23a3a', bg: '#fddcdc' },
  { name: both('灰姑娘蓝', 'cinderella'), body: '#6fb0f7', belly: '#eaf4ff', accent: '#2d6fc0', bg: '#c9eefb' },
  { name: both('布朗尼', 'brownies'), body: '#a2714e', belly: '#f6e6d4', accent: '#6b4128', bg: '#efe9de' },
  { name: both('苔原', 'tundra'), body: '#d2bd9c', belly: '#fbf5ea', accent: '#94795a', bg: '#f3e6b8' },
  { name: both('热可可', 'hotcocoa'), body: '#7a4e3a', belly: '#ecd4bf', accent: '#4a2a1e', bg: '#ffe8d1' },
  { name: both('矢车菊', 'cornflower'), body: '#7f8ff0', belly: '#eaedff', accent: '#4553c4', bg: '#fef6cf' },
  { name: both('冰凌', 'icicle'), body: '#d6eefb', belly: '#ffffff', accent: '#7fb6d6', bg: '#cfe6fb' },
  { name: both('海沫', 'seafoam'), body: '#62d6c2', belly: '#e6fbf6', accent: '#249682', bg: '#fddcdc' },
  { name: both('薰衣草', 'lavender'), body: '#b99cf5', belly: '#f4eeff', accent: '#7a52cc', bg: '#fef6cf' },
  { name: both('杏子', 'apricot'), body: '#f8a871', belly: '#fff0e2', accent: '#d5703a', bg: '#d6f0ee' },
  { name: both('薄荷巧', 'mintchip'), body: '#86dcb2', belly: '#ecfbf2', accent: '#3a9c6c', bg: '#e6f5c9' },
  { name: both('葡萄冻', 'grapejelly'), body: '#8b62cc', belly: '#eee2fb', accent: '#553493', bg: '#f9dcf5' },
  { name: both('鲑鱼粉', 'salmon'), body: '#f98b7a', belly: '#fff0ea', accent: '#c94f43', bg: '#ffe8d1' },
  { name: both('墨蓝', 'inkblue'), body: '#4a5cb0', belly: '#dfe6fb', accent: '#28357a', bg: '#c9eefb' },
  { name: both('蜜瓜', 'honeydew'), body: '#d0ef8a', belly: '#f8fde6', accent: '#84ad2e', bg: '#cdf5d8' },
  { name: both('霓虹粉', 'neonglow'), body: '#ff5ec8', belly: '#ffe6f6', accent: '#c2188a', bg: '#f9dcf5' },
  { name: both('电路绿', 'pcbgreen'), body: '#3d8f5a', belly: '#dff5e6', accent: '#1f5a34', bg: '#cdf5d8' },
  { name: both('午夜紫', 'midnight'), body: '#3a2a55', belly: '#cfc0e8', accent: '#1e1433', bg: '#e8dff8' },
  { name: both('奶油焦糖', 'caramel'), body: '#c9894a', belly: '#fff3e0', accent: '#8a5520', bg: '#ffe8d1' },
  { name: both('银狐', 'silverfox'), body: '#c5ccd6', belly: '#ffffff', accent: '#7a8494', bg: '#e8eef5' },
  { name: both('珊瑚礁', 'reef'), body: '#ff7a9a', belly: '#ffe8ef', accent: '#d4456a', bg: '#fddcdc' },
  { name: both('青瓷', 'celadon'), body: '#9fd4b8', belly: '#f0faf5', accent: '#4f9a74', bg: '#e6f5c9' },
  { name: both('琥珀糖', 'ambercandy'), body: '#e8a020', belly: '#fff4d6', accent: '#a86a00', bg: '#fef6cf' },
  { name: both('樱花', 'sakura'), body: '#ffc1d6', belly: '#fff5f8', accent: '#e8789c', bg: '#f9dcf5' },
  { name: both('石墨', 'graphite'), body: '#5c6570', belly: '#d8dee6', accent: '#2e353c', bg: '#e8eef5' },
  { name: both('奶油蓝', 'creamblue'), body: '#a8c8e8', belly: '#f4f8fc', accent: '#5a88b8', bg: '#c9eefb' },
  { name: both('芥末', 'wasabi'), body: '#c8d84a', belly: '#f6fad8', accent: '#889620', bg: '#e6f5c9' },
  { name: both('栗子', 'chestnut'), body: '#8b4a2e', belly: '#f0d8c4', accent: '#5a2a14', bg: '#efe9de' },
  { name: both('电浆紫', 'plasma'), body: '#9a4dff', belly: '#efe0ff', accent: '#5c1fc4', bg: '#e8dff8' },
];

const EYES: { name: Txt; color: string }[] = [
  { name: both('金瞳', 'gold'), color: '#f5b93c' },
  { name: both('薄荷', 'mint'), color: '#4fd1b0' },
  { name: both('泡泡糖', 'bubblegum'), color: '#ff6fa3' },
  { name: both('天空蓝', 'sky'), color: '#5fa8ff' },
  { name: both('兰花紫', 'orchid'), color: '#f03fd8' },
  { name: both('青柠', 'lime'), color: '#8ad64a' },
  { name: both('紫罗兰', 'violet'), color: '#a47bff' },
  { name: both('蜜桃', 'peach'), color: '#ff8a5c' },
  { name: both('钴蓝', 'cobalt'), color: '#3f7af0' },
  { name: both('铜色', 'copper'), color: '#e07a45' },
  { name: both('青绿', 'teal'), color: '#1fa89a' },
  { name: both('琥珀', 'amber'), color: '#e0a012' },
  { name: both('珍珠', 'pearl'), color: '#e9eef5' },
  { name: both('墨瞳', 'onyxeye'), color: '#3a3a44' },
  { name: both('血红', 'crimson'), color: '#e04050' },
  { name: both('电光', 'electric'), color: '#40e0ff' },
  { name: both('抹茶', 'matcha'), color: '#6cbc4a' },
  { name: both('玫瑰金', 'rosegold'), color: '#e8a0b0' },
];

/** 0 纯色 · 1 虎纹 · 2 圆点 · 3 花斑 · 4 燕尾服 · 5 面罩 · 6 走线 · 7 爱心 · 8 菱斑 */
const PATTERNS: Txt[] = [
  both('纯色', 'solid'),
  both('虎纹', 'tiger'),
  both('圆点', 'speckles'),
  both('花斑', 'calico'),
  both('燕尾服', 'tuxedo'),
  both('面罩', 'mask'),
  both('走线', 'traces'),
  both('爱心', 'hearts'),
  both('菱斑', 'diamonds'),
];

const EARS: Txt[] = [
  both('尖耳', 'pointy'),
  both('圆耳', 'round'),
  both('折耳', 'folded'),
  both('长耳', 'long'),
  both('翅耳', 'winged'),
  both('簇耳', 'tufted'),
];

const BODY_SHAPES: Txt[] = [
  both('标准', 'classic'),
  both('圆墩', 'chonk'),
  both('瘦高', 'slim'),
  both('吐司蹲', 'loaf'),
  both('豆袋', 'bean'),
];

const ACCESSORIES: Txt[] = [
  both('无配饰', 'none'),
  both('项圈', 'collar'),
  both('蝴蝶结', 'bow'),
  both('天线芯片', 'antenna'),
  both('圆眼镜', 'glasses'),
  both('铃铛', 'bell'),
  both('小围巾', 'scarf'),
];

const NOSES = ['#f28ba8', '#e87890', '#ff9aaa', '#c97888', '#d4a090', '#ffb0c0', '#b07080'];
const CHEEK = ['#ff9db8', '#ff8fa3', '#ffb08a', '#f79ac8', '#ffa6a6', '#ffc4a8', '#e8a0c8', '#ffd0e0'];

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

/**
 * @param seed 个体盐（宠物 id/名/孵化时间）。缺省时纯电路脸；有 seed 时同电路也会有细微差。
 */
export function phenotypeOf(
  cpu: string,
  circuitId: bigint | number | string,
  rarity: Rarity = 0,
  seed?: string | number | bigint | null,
): Phenotype {
  const h = mix(cpu, circuitId);
  const hasSeed = seed != null && String(seed) !== '';
  const s = hasSeed ? mix('pet', seed!) : 0;
  const m = hasSeed ? (Math.imul(h ^ s, 0xc2b2ae35) >>> 0) : (Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 0);

  // —— 主特征：锁电路 ——
  const speciesId = h % SPECIES.length;
  const sp = SPECIES[speciesId]!;
  const coatIdx = (h >>> 3) % COATS.length;
  const coat = COATS[coatIdx]!;
  const pattern = (h >>> 15) % PATTERNS.length;
  const pat = PATTERNS[pattern]!;
  const ear = (h >>> 18) % EARS.length;
  const bodyShape = (h >>> 1) % BODY_SHAPES.length;

  // —— 细微差：有 seed 时在邻近选项里轻挪 / 混色 ——
  const coatNudge = hasSeed ? ((m >>> 2) % 5) - 2 : 0; // -2..2
  const coatB = COATS[(coatIdx + COATS.length + Math.sign(coatNudge)) % COATS.length]!;
  const mixT = Math.abs(coatNudge) * 0.07;
  const body = blend(coat.body, coatB.body, mixT);
  const belly = blend(coat.belly, coatB.belly, mixT * 0.8);
  const accent = blend(coat.accent, coatB.accent, mixT);
  const bg = blend(coat.bg, coatB.bg, mixT * 0.6);

  const eyeBase = (h >>> 9) % EYES.length;
  const eyeShift = hasSeed ? ((m >>> 5) % 3) - 1 : 0;
  const eye = EYES[(eyeBase + eyeShift + EYES.length) % EYES.length]!;

  const mouthBase = (h >>> 24) % 4;
  const mouth = hasSeed ? (mouthBase + ((m >>> 14) & 1)) % 4 : mouthBase;
  const eyeShapeBase = (h >>> 27) % 4;
  const eyeShape = hasSeed ? (eyeShapeBase + ((m >>> 16) & 1)) % 4 : eyeShapeBase;
  const tuftBase = (h >>> 6) % 5;
  const tuft = hasSeed ? (tuftBase + ((m >>> 18) % 3) - 1 + 5) % 5 : tuftBase;
  const tailBase = (h >>> 21) % 7;
  const tail = hasSeed ? (tailBase + ((m >>> 20) % 3) - 1 + 7) % 7 : tailBase;
  const accessory = m % ACCESSORIES.length;

  // 文字类字段用 getter：切换语言后，已经算好的 Phenotype 也跟着变
  return {
    speciesId,
    get species() { return txt(sp.name); },
    get coat() { return txt(coat.name); },
    body,
    belly,
    accent,
    outline: blend(accent, '#2a1c1c', 0.62),
    bg,
    eye: eye.color,
    get eyeName() { return txt(eye.name); },
    cheek: CHEEK[((hasSeed ? m : h) >>> 12) % CHEEK.length]!,
    pattern,
    get patternName() { return txt(pat); },
    ear,
    get earName() { return txt(EARS[ear]!); },
    tail,
    mouth,
    eyeShape,
    bodyShape,
    get bodyShapeName() { return txt(BODY_SHAPES[bodyShape]!); },
    tuft,
    accessory,
    get accessoryName() { return txt(ACCESSORIES[accessory]!); },
    nose: NOSES[(m >>> 4) % NOSES.length]!,
    freckles: ((m >>> 8) & 3) === 0,
    pawPads: ((m >>> 10) & 1) === 1,
    whisker: (m >>> 12) % 3,
    gaze: hasSeed ? ((m >>> 22) % 5) - 2 : ((h >>> 22) % 3) - 1,
    blush: 0.5 + (((m >>> 25) % 9) / 20),
    markJitter: hasSeed ? (m >>> 28) % 7 : 0,
    rarity,
    get typeName() { return txt(TYPE_NAME[rarity]); },
    get vibe() { return txt(sp.vibe); },
    get blurb() { return txt(sp.blurb); },
  };
}

export function geneStory(p: Phenotype, gates?: number) {
  const g = gates && gates > 0 ? tr(`${gates} 个逻辑门`, `${gates} logic gates`) : tr('一枚链上电路', 'an on-chain circuit');
  const acc = p.accessory > 0 ? tr(` · 配饰 ${p.accessoryName}`, ` · accessory ${p.accessoryName}`) : '';
  return tr(
    `这只${p.species}（${p.coat}）的心脏是${g}。体态 ${p.bodyShapeName} · 毛色 ${p.coat} · 瞳色 ${p.eyeName} · 花纹 ${p.patternName} · 耳型 ${p.earName}${acc}。${p.blurb}。类型：${p.typeName}。`,
    `This ${p.species} (${p.coat}) has a heart made of ${g}. Build ${p.bodyShapeName} · coat ${p.coat} · eyes ${p.eyeName} · pattern ${p.patternName} · ears ${p.earName}${acc}. It ${p.blurb}. Type: ${p.typeName}.`,
  );
}

export function cattributes(p: Phenotype) {
  const rows = [
    { id: 'base', label: tr('毛色', 'base'), value: p.coat },
    { id: 'body', label: tr('体态', 'build'), value: p.bodyShapeName },
    { id: 'eyes', label: tr('瞳色', 'eyes'), value: p.eyeName },
    { id: 'pattern', label: tr('花纹', 'pattern'), value: p.patternName },
    { id: 'ears', label: tr('耳型', 'ears'), value: p.earName },
    { id: 'type', label: tr('类型', 'type'), value: txt(RARITY_NAME[p.rarity]) },
  ];
  if (p.accessory > 0) rows.splice(5, 0, { id: 'acc', label: tr('配饰', 'gear'), value: p.accessoryName });
  return rows;
}
