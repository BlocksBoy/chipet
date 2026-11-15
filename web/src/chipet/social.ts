import type { Address } from 'viem';
import { both, tr, txt, type Text, type Txt } from '../i18n.ts';
import { WILDS } from './battle.ts';
import type { Rarity } from './phenotype.ts';
import { bem } from './bem.ts';
import { prepareNote, scrubNoteText } from './noteGuard.ts';
import { localChipet, type LocalPet } from './store.ts';

const MOCK_CPU = '0x000000000000000000000000000000000000c111' as Address;

export interface PublicPet {
  key: string;
  id: number;
  name: string;
  owner: string;
  cpu: Address;
  circuitId: bigint;
  rarity: Rarity;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  wins: number;
  mine: boolean;
}

/** 动态、留言都会存进 localStorage：系统生成的文案存双语（Txt），显示时用 txt() 取当前语言。 */
export interface Activity {
  id: string;
  at: number;
  kind: 'hatch' | 'pat' | 'gift' | 'note' | 'checkin' | 'talk' | 'battle' | 'bond' | 'power';
  actor: Text;
  petKey: string;
  petName: string;
  text: Text;
}

export interface GuestNote {
  id: string;
  from: Text;
  text: Text;
  at: number;
}

export interface Quest {
  id: QuestId;
  label: string;
  goal: number;
  progress: number;
  done: boolean;
  claimed: boolean;
}

interface SocialState {
  displayName: string;
  friendCode: string;
  pats: Record<string, number>;
  myPatsToday: Record<string, string>; // petKey -> YYYY-MM-DD
  giftsToday: Record<string, string>;
  notes: Record<string, GuestNote[]>;
  visits: Record<string, number>;
  activities: Activity[];
  checkinDay: string;
  streak: number;
  fish: number; // 小鱼干，可送给别人的宠
  bubbles: Record<string, Text>; // petKey -> last talk bubble
  bonds: string[]; // 牵过线的邻居 petKey（合体电路的另一半）
  likes: Record<string, number>; // 动态 id -> 击掌数
  liked: Record<string, boolean>;
  npcWins: Record<string, number>; // 邻居守擂成功的次数
  wildDay: Record<string, string>; // 野怪 id -> 今日首胜日期
  quest: { day: string; n: Record<string, number>; claimed: Record<string, boolean> };
}

const KEY = 'chipet.social.v1';
const DAY = () => new Date().toISOString().slice(0, 10);
/** 免费基础线友位；可用 BEM 扩到 bem.bondSlots()（最多 5） */
export const MAX_BONDS = 3;
export const maxBonds = () => bem.bondSlots();

/** 没改过昵称的玩家，按当前语言显示默认名。 */
const DEFAULT_NAME = both('旅行者', 'Traveler');

type Neighbor = Omit<PublicPet, 'mine' | 'key' | 'name' | 'owner'> & { name: Txt; owner: Txt };

/** 广场里的邻居芯宠，让社交区不空。 */
const NEIGHBORS: Neighbor[] = [
  { id: -1, name: both('青橘', 'Kumquat'), owner: both('林间小站', 'ForestStop'), cpu: MOCK_CPU, circuitId: 2048n, rarity: 1, energy: 88, mood: 92, intimacy: 24, level: 4, wins: 6 },
  { id: -2, name: both('比特', 'Bit'), owner: both('XLayerFans', 'XLayerFans'), cpu: MOCK_CPU, circuitId: 3110n, rarity: 0, energy: 70, mood: 65, intimacy: 11, level: 2, wins: 2 },
  { id: -3, name: both('糖芯', 'Sugarchip'), owner: both('喵呜研究所', 'MeowLabs'), cpu: MOCK_CPU, circuitId: 7777n, rarity: 2, energy: 95, mood: 98, intimacy: 56, level: 7, wins: 15 },
  { id: -4, name: both('豆皮', 'Tofu'), owner: both('周末玩家', 'WeekendPlayer'), cpu: MOCK_CPU, circuitId: 1201n, rarity: 0, energy: 60, mood: 80, intimacy: 8, level: 1, wins: 1 },
  { id: -5, name: both('海盐', 'Seasalt'), owner: both('DeWEB旅行者', 'DeWEBNomad'), cpu: MOCK_CPU, circuitId: 9090n, rarity: 1, energy: 75, mood: 70, intimacy: 19, level: 3, wins: 4 },
  { id: -6, name: both('脉冲', 'Pulse'), owner: both('电路夜猫', 'CircuitNightOwl'), cpu: MOCK_CPU, circuitId: 4242n, rarity: 2, energy: 90, mood: 85, intimacy: 41, level: 6, wins: 11 },
];
const npc = (id: number) => NEIGHBORS.find((n) => n.id === id)!;

const REPLIES: Txt[] = [
  both('咕噜～被你摸得很舒服。', 'Purr~ that feels so nice.'),
  both('芯片暖暖的，再来一下！', 'My chip is all warm. One more time!'),
  both('今天也要一起变强哦。', "Let's get stronger together today."),
  both('……我在想下一场对战。', "…I'm thinking about the next battle."),
  both('喂我小鱼干的话会更开心。', 'A fish treat would make me even happier.'),
  both('你的味道像刚焊好的铜线。', 'You smell like freshly soldered copper.'),
  both('基因页有秘密，要不要看？', "There's a secret on my gene page. Want to see?"),
  both('给我通通电嘛，灯全亮的时候最舒服。', 'Power me up! It feels best when every lamp is lit.'),
  both('听说牵了线的两颗心脏能放合体技。', 'I heard two linked hearts can pull off a fusion move.'),
];

const THANKS: Txt[] = [
  both('谢谢你的小鱼干！回来摸摸你家的～', 'Thanks for the fish treat! Came by to pat yours~'),
  both('礼尚往来，来串个门。', 'One good turn deserves another. Dropping by!'),
  both('鱼干真香，下次一起去打 Bug 王。', "That fish was delicious. Let's take on The Bug together next time."),
];
const BOND_HI: Txt[] = [
  both('线牵好了！以后对战喊我。', "We're linked! Call me when you battle."),
  both('两颗心脏串起来，门数加倍。', 'Two hearts in series, twice the gates.'),
  both('合体电路已就绪，冲。', 'Fusion circuit ready. Go!'),
];

const QUEST_DEFS = [
  { id: 'checkin', label: both('每日签到', 'Daily check-in'), goal: 1 },
  { id: 'power', label: both('给芯喵通电玩耍一次', 'Power-play your kitty once'), goal: 1 },
  { id: 'battle', label: both('赢一场电路对战', 'Win a circuit battle'), goal: 1 },
  { id: 'visit', label: both('摸摸 2 位邻居的芯喵', "Pat 2 neighbors' kitties"), goal: 2 },
] as const;
export type QuestId = (typeof QUEST_DEFS)[number]['id'];

/** 首次进入时预置的动态和留言。 */
function seedActivities(): Activity[] {
  const now = Date.now();
  return [
    { id: 'a4', at: now - 600000, kind: 'battle', actor: npc(-6).owner, petKey: 'npc:-6', petName: '脉冲', text: both('「脉冲」在电路对战中击败了野怪「静电怪」', 'Pulse beat the wild bug Static in a circuit battle') },
    { id: 'a3', at: now - 900000, kind: 'note', actor: npc(-4).owner, petKey: 'npc:-3', petName: '糖芯', text: both('在「糖芯」家留言：基因页的芯片好酷', 'Left a note for Sugarchip: The chip on the gene page is so cool') },
    { id: 'a2', at: now - 1800000, kind: 'gift', actor: npc(-5).owner, petKey: 'npc:-5', petName: '海盐', text: both('给「海盐」投喂了小鱼干', 'Fed Seasalt a fish treat') },
    { id: 'a1', at: now - 5400000, kind: 'pat', actor: npc(-1).owner, petKey: 'npc:-1', petName: '青橘', text: both('摸了摸「青橘」的头', 'Patted Kumquat on the head') },
    { id: 'a0', at: now - 7200000, kind: 'hatch', actor: npc(-3).owner, petKey: 'npc:-3', petName: '糖芯', text: both('孵化了限定芯宠「糖芯」', 'Hatched an Exclusive Chipet, Sugarchip') },
  ];
}

function seedNotes(): GuestNote[] {
  const now = Date.now();
  return [
    { id: 'n1', from: npc(-2).owner, text: both('限定芯宠好闪！求摸', 'That Exclusive Chipet is so shiny! Pat mine back?'), at: now - 86400000 },
    { id: 'n2', from: npc(-4).owner, text: both('基因页的芯片好酷', 'The chip on the gene page is so cool'), at: now - 3600000 },
  ];
}

function defaultState(): SocialState {
  const code = `CHIP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return {
    displayName: '',
    friendCode: code,
    pats: Object.fromEntries(NEIGHBORS.map((n) => [`npc:${n.id}`, 3 + Math.floor(Math.random() * 40)])),
    myPatsToday: {},
    giftsToday: {},
    notes: { 'npc:-3': seedNotes() },
    visits: Object.fromEntries(NEIGHBORS.map((n) => [`npc:${n.id}`, 20 + Math.floor(Math.random() * 80)])),
    activities: seedActivities(),
    checkinDay: '',
    streak: 0,
    fish: 2,
    bubbles: {},
    bonds: [],
    likes: { a0: 5, a3: 2, a4: 3 },
    liked: {},
    npcWins: {},
    wildDay: {},
    quest: { day: '', n: {}, claimed: {} },
  };
}

/** 加双语之前存下的孵化动态是纯中文，句式固定，可以原样补出英文。 */
function upgradeHatchText(text: Text): Text {
  const m = typeof text === 'string' ? /^孵化了(限定|珍奇)?芯宠「(.+)」$/.exec(text) : null;
  if (!m) return text;
  const kind = m[1] === '限定' ? 'an Exclusive Chipet' : m[1] === '珍奇' ? 'a Fancy Chipet' : 'a Chipet';
  return both(text as string, `Hatched ${kind}, ${m[2]}`);
}

/**
 * 加双语之前存下的记录是纯中文：预置动态 / 留言按 id 换成双语版（时间保留），
 * 玩家自己的默认昵称和孵化动态补上英文，其余老记录原样显示。
 */
function upgradeSeeds(s: SocialState) {
  const acts = new Map(seedActivities().map((a) => [a.id, a]));
  s.activities = s.activities.map((a) => {
    const seed = acts.get(a.id);
    if (seed && typeof a.text === 'string') return { ...seed, at: a.at };
    return { ...a, actor: a.actor === DEFAULT_NAME.zh ? DEFAULT_NAME : a.actor, text: a.kind === 'hatch' ? upgradeHatchText(a.text) : a.text };
  });
  const notes = new Map(seedNotes().map((n) => [n.id, n]));
  const key = 'npc:-3';
  if (s.notes[key]) {
    s.notes[key] = s.notes[key].map((n) => {
      const seed = notes.get(n.id);
      return seed && typeof n.text === 'string' ? { ...seed, at: n.at } : n;
    });
  }
}

function load(): SocialState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const s: SocialState = { ...defaultState(), ...JSON.parse(raw) };
    upgradeSeeds(s);
    return s;
  } catch {
    return defaultState();
  }
}

function save(s: SocialState) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

/** 我的昵称：没改过就跟着语言走。 */
function me(s: SocialState): Text {
  return !s.displayName || s.displayName === DEFAULT_NAME.zh || s.displayName === DEFAULT_NAME.en ? DEFAULT_NAME : s.displayName;
}

function pushAct(s: SocialState, act: Omit<Activity, 'id' | 'at'>) {
  s.activities.unshift({ ...act, id: `a${Date.now()}${Math.random()}`, at: Date.now() });
  s.activities = s.activities.slice(0, 40);
}

/** 今日任务进度 +1（跨天自动清零）。 */
function bump(s: SocialState, id: QuestId, n = 1) {
  if (s.quest.day !== DAY()) s.quest = { day: DAY(), n: {}, claimed: {} };
  s.quest.n[id] = (s.quest.n[id] ?? 0) + n;
}

function npcKey(id: number) {
  return `npc:${id}`;
}

/** name / owner 用 getter：切换语言后，页面手里已有的对象也跟着变。 */
function toPublic(p: LocalPet, owner: Text): PublicPet {
  return {
    key: `mine:${p.id}`,
    id: p.id,
    name: p.name,
    get owner() { return txt(owner); },
    cpu: p.cpu,
    circuitId: p.circuitId,
    rarity: p.rarity,
    energy: p.energy,
    mood: p.mood,
    intimacy: p.intimacy,
    level: p.level,
    wins: p.wins,
    mine: true,
  };
}

function npcPublic(n: Neighbor, s: SocialState): PublicPet {
  const { name, owner, ...rest } = n;
  const key = npcKey(n.id);
  return {
    ...rest,
    key,
    mine: false,
    wins: n.wins + (s.npcWins[key] ?? 0),
    get name() { return txt(name); },
    get owner() { return txt(owner); },
  };
}

/** 一只宠物在两种语言下的名字（玩家自己的宠只有一个名字）。 */
function namesOf(pet: PublicPet): Txt {
  return NEIGHBORS.find((n) => npcKey(n.id) === pet.key)?.name ?? both(pet.name, pet.name);
}

function ownerOf(pet: PublicPet): Text {
  return NEIGHBORS.find((n) => npcKey(n.id) === pet.key)?.owner ?? pet.owner;
}

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

const noPet = () => new Error(tr('芯宠不存在', 'Chipet not found'));

/** 邻居回访：在我最新的芯喵门口留言、顺手摸一下，让社交有来有往。 */
function visitBack(s: SocialState, from: PublicPet, text: Txt) {
  const mine = localChipet.list()[0];
  if (!mine) return;
  const key = `mine:${mine.id}`;
  const who = namesOf(from);
  const note: GuestNote = { id: `n${Date.now()}${Math.random()}`, from: ownerOf(from), text, at: Date.now() };
  s.notes[key] = [note, ...(s.notes[key] ?? [])].slice(0, 20);
  s.pats[key] = (s.pats[key] ?? 0) + 1;
  s.visits[key] = (s.visits[key] ?? 0) + 1;
  localChipet.cheer(mine.id, 4, 1);
  pushAct(s, {
    kind: 'pat', actor: ownerOf(from), petKey: key, petName: mine.name,
    text: both(`带着「${who.zh}」回访，摸了摸「${mine.name}」`, `Visited back with ${who.en} and patted ${mine.name}`),
  });
}

export const social = {
  profile() {
    const s = load();
    return { displayName: txt(me(s)), friendCode: s.friendCode, streak: s.streak, fish: s.fish, checkedIn: s.checkinDay === DAY() };
  },
  setName(name: string) {
    const s = load();
    s.displayName = name.trim().slice(0, 16) || s.displayName;
    save(s);
  },
  /** BEM 鱼干礼包等：直接加鱼干 */
  addFish(n: number) {
    const s = load();
    s.fish += Math.max(0, Math.floor(n));
    save(s);
    return s.fish;
  },
  checkin() {
    const s = load();
    const today = DAY();
    if (s.checkinDay === today) throw new Error(tr('今天已经签到过了', 'You already checked in today'));
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.streak = s.checkinDay === yesterday ? s.streak + 1 : 1;
    s.checkinDay = today;
    s.fish += 1 + (s.streak >= 3 ? 1 : 0);
    bump(s, 'checkin');
    pushAct(s, {
      kind: 'checkin', actor: me(s), petKey: '', petName: '',
      text: both(`连续签到 ${s.streak} 天，领到小鱼干`, `Checked in, day ${s.streak} of the streak, and got fish treats`),
    });
    save(s);
    return s;
  },
  allPets(): PublicPet[] {
    const s = load();
    const mine = localChipet.list().map((p) => toPublic(p, me(s)));
    return [...mine, ...NEIGHBORS.map((n) => npcPublic(n, s))];
  },
  neighbors(): PublicPet[] {
    return this.allPets().filter((p) => !p.mine);
  },
  getPet(key: string): PublicPet | undefined {
    return this.allPets().find((p) => p.key === key);
  },
  getByRouteId(id: number): PublicPet | undefined {
    if (id < 0) return this.getPet(npcKey(id));
    const s = load();
    const p = localChipet.get(id);
    return p ? toPublic(p, me(s)) : undefined;
  },
  patCount(key: string) {
    return load().pats[key] ?? 0;
  },
  visits(key: string) {
    return load().visits[key] ?? 0;
  },
  recordVisit(key: string) {
    const s = load();
    s.visits[key] = (s.visits[key] ?? 0) + 1;
    save(s);
  },
  canPat(key: string) {
    return load().myPatsToday[key] !== DAY();
  },
  pat(key: string) {
    const s = load();
    const pet = this.getPet(key);
    if (!pet) throw noPet();
    if (s.myPatsToday[key] === DAY()) throw new Error(tr('今天已经摸过它了，明天再来', 'You already patted it today. Come back tomorrow'));
    s.myPatsToday[key] = DAY();
    s.pats[key] = (s.pats[key] ?? 0) + 1;
    const who = namesOf(pet);
    pushAct(s, { kind: 'pat', actor: me(s), petKey: key, petName: pet.name, text: both(`摸了摸「${who.zh}」的头`, `Patted ${who.en} on the head`) });
    if (pet.mine) localChipet.cheer(pet.id, 6, 1);
    else bump(s, 'visit');
    save(s);
    return s.pats[key];
  },
  canGift(key: string) {
    const s = load();
    return s.fish > 0 && s.giftsToday[key] !== DAY();
  },
  gift(key: string) {
    const s = load();
    const pet = this.getPet(key);
    if (!pet) throw noPet();
    if (s.fish <= 0) throw new Error(tr('小鱼干不够了，先去签到或做今日任务', 'Out of fish treats. Check in or finish a daily quest first'));
    if (s.giftsToday[key] === DAY()) throw new Error(tr('今天已经喂过它了', 'You already fed it today'));
    s.fish -= 1;
    s.giftsToday[key] = DAY();
    s.pats[key] = (s.pats[key] ?? 0) + 2;
    if (pet.mine) localChipet.cheer(pet.id, 12, 2);
    const who = namesOf(pet);
    pushAct(s, { kind: 'gift', actor: me(s), petKey: key, petName: pet.name, text: both(`给「${who.zh}」投喂了小鱼干`, `Fed ${who.en} a fish treat`) });
    if (!pet.mine) visitBack(s, pet, pick(THANKS));
    save(s);
    return s.fish;
  },
  notes(key: string) {
    return (load().notes[key] ?? []).map((n) => ({
      ...n,
      // 读出时再洗一遍，防旧数据或被改过的 localStorage
      text: typeof n.text === 'string' ? scrubNoteText(n.text) : n.text,
    }));
  },
  leaveNote(key: string, text: string) {
    const s = load();
    const pet = this.getPet(key);
    if (!pet) throw noPet();
    // 清洗、禁链、敏感词、限流；只入库纯文本
    const t = prepareNote(key, text);
    const note: GuestNote = { id: `n${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, from: me(s), text: t, at: Date.now() };
    s.notes[key] = [note, ...(s.notes[key] ?? [])].slice(0, 20);
    const who = namesOf(pet);
    pushAct(s, { kind: 'note', actor: me(s), petKey: key, petName: pet.name, text: both(`在「${who.zh}」家留言：${t}`, `Left a note for ${who.en}: ${t}`) });
    save(s);
    return note;
  },
  talk(key: string) {
    const s = load();
    const pet = this.getPet(key);
    if (!pet) throw noPet();
    const line = pick(REPLIES);
    s.bubbles[key] = line;
    const who = namesOf(pet);
    pushAct(s, { kind: 'talk', actor: me(s), petKey: key, petName: pet.name, text: both(`和「${who.zh}」说了会儿话`, `Had a chat with ${who.en}`) });
    save(s);
    return line;
  },
  bubble(key: string): Text {
    return load().bubbles[key] ?? '';
  },
  activities() {
    const s = load();
    return s.activities.map((a) => ({ ...a, likes: s.likes[a.id] ?? 0, liked: !!s.liked[a.id] }));
  },
  /** 给一条动态击掌 / 取消击掌。 */
  like(id: string) {
    const s = load();
    const on = !s.liked[id];
    s.liked[id] = on;
    s.likes[id] = Math.max(0, (s.likes[id] ?? 0) + (on ? 1 : -1));
    save(s);
    return on;
  },
  announceHatch(pet: LocalPet) {
    const s = load();
    pushAct(s, {
      kind: 'hatch', actor: me(s), petKey: `mine:${pet.id}`, petName: pet.name,
      text: both(
        `孵化了${pet.rarity === 2 ? '限定' : pet.rarity === 1 ? '珍奇' : ''}芯宠「${pet.name}」`,
        `Hatched ${pet.rarity === 2 ? 'an Exclusive' : pet.rarity === 1 ? 'a Fancy' : 'a'} Chipet, ${pet.name}`,
      ),
    });
    save(s);
  },

  // ── 今日任务 ─────────────────────────────────────
  quests(): Quest[] {
    const s = load();
    const live = s.quest.day === DAY();
    return QUEST_DEFS.map((q) => {
      const progress = Math.min(q.goal, live ? (s.quest.n[q.id] ?? 0) : 0);
      return {
        id: q.id,
        goal: q.goal,
        get label() { return txt(q.label); },
        progress,
        done: progress >= q.goal,
        claimed: live && !!s.quest.claimed[q.id],
      };
    });
  },
  claimQuest(id: QuestId) {
    const s = load();
    const q = this.quests().find((x) => x.id === id);
    if (!q || !q.done) throw new Error(tr('任务还没完成', 'Quest not finished yet'));
    if (q.claimed) throw new Error(tr('奖励已经领过了', 'Reward already claimed'));
    s.quest.claimed[id] = true;
    s.fish += 1;
    save(s);
    return s.fish;
  },

  // ── 通电玩耍 ─────────────────────────────────────
  recordPower(pet: LocalPet, stars: number, maxStars: number) {
    const s = load();
    bump(s, 'power');
    const perfect = stars >= maxStars;
    if (perfect) s.fish += 1;
    pushAct(s, {
      kind: 'power', actor: me(s), petKey: `mine:${pet.id}`, petName: pet.name,
      text: both(
        `给「${pet.name}」的心脏通电，拿到 ${stars}/${maxStars} 颗星${perfect ? '（满星！）' : ''}`,
        `Powered up ${pet.name}'s heart and got ${stars}/${maxStars} stars${perfect ? ' (perfect!)' : ''}`,
      ),
    });
    save(s);
    return { fish: perfect ? 1 : 0 };
  },

  // ── 电路对战 ─────────────────────────────────────
  /** 对手二选一：野怪给 wildId，邻居给 opKey。 */
  recordBattle(a: { myId: number; myName: string; opKey: string; wildId?: string; result: 'win' | 'lose' | 'draw'; rounds: number }) {
    const s = load();
    const today = DAY();
    let fish = 0;
    const wild = a.wildId ? WILDS.find((w) => w.id === a.wildId) : undefined;
    const neighbor = !wild && a.opKey ? this.getPet(a.opKey) : undefined;
    const op = wild ? wild.names : neighbor ? namesOf(neighbor) : both('对手', 'an opponent');
    const whoZh = wild ? `野怪「${op.zh}」` : `「${op.zh}」`;
    const whoEn = wild ? `the wild bug ${op.en}` : op.en;
    const my = a.myName;
    const text =
      a.result === 'win' ? both(`「${my}」在电路对战中击败了${whoZh}（${a.rounds} 回合）`, `${my} beat ${whoEn} in a circuit battle (${a.rounds} rounds)`)
        : a.result === 'lose' ? both(`「${my}」挑战${whoZh}，惜败`, `${my} challenged ${whoEn} and narrowly lost`)
          : both(`「${my}」和${whoZh}打成平手`, `${my} and ${whoEn} fought to a draw`);
    pushAct(s, { kind: 'battle', actor: me(s), petKey: `mine:${a.myId}`, petName: my, text });
    if (a.result === 'win') {
      bump(s, 'battle');
      if (a.wildId && s.wildDay[a.wildId] !== today) {
        s.wildDay[a.wildId] = today;
        s.fish += 1;
        fish = 1;
      }
    }
    if (!a.wildId && a.opKey) {
      if (a.result === 'lose') s.npcWins[a.opKey] = (s.npcWins[a.opKey] ?? 0) + 1;
      const line =
        a.result === 'win' ? both(`带「${my}」来切磋，赢了一场！`, `Came to spar with ${my} and won!`)
          : a.result === 'lose' ? both(`带「${my}」来切磋，输了，下次再来。`, `Came to spar with ${my} and lost. We'll be back.`)
            : both(`带「${my}」来切磋，打平。`, `Came to spar with ${my}. It was a draw.`);
      const note: GuestNote = { id: `n${Date.now()}`, from: me(s), text: line, at: Date.now() };
      s.notes[a.opKey] = [note, ...(s.notes[a.opKey] ?? [])].slice(0, 20);
    }
    save(s);
    return { fish };
  },
  /** 今天打赢这只野怪还能不能再拿鱼干 */
  wildBounty(wildId: string) {
    return load().wildDay[wildId] !== DAY();
  },

  // ── 牵线：两颗心脏用 REF 串成合体电路 ─────────────────
  bonds(): PublicPet[] {
    const s = load();
    const all = this.allPets();
    return s.bonds.map((k) => all.find((p) => p.key === k)).filter((p): p is PublicPet => !!p);
  },
  isBonded(key: string) {
    return load().bonds.includes(key);
  },
  bond(key: string) {
    const s = load();
    const pet = this.getPet(key);
    if (!pet) throw noPet();
    if (pet.mine) throw new Error(tr('不能和自己的芯喵牵线', "You can't link up with your own kitty"));
    if (s.bonds.includes(key)) throw new Error(tr('已经牵过线了', 'Already linked'));
    const cap = maxBonds();
    if (s.bonds.length >= cap) throw new Error(tr(`最多牵 ${cap} 根线，先松开一根或去商店扩位`, `You can keep at most ${cap} links. Unlink one or expand slots in the Shop`));
    if (s.fish <= 0) throw new Error(tr('牵线要 1 条小鱼干当见面礼', 'Linking up costs 1 fish treat as a gift'));
    s.fish -= 1;
    s.bonds.push(key);
    const who = namesOf(pet);
    pushAct(s, {
      kind: 'bond', actor: me(s), petKey: key, petName: pet.name,
      text: both(`和「${who.zh}」牵了线，两颗心脏串成合体电路`, `Linked up with ${who.en}: two hearts wired into one fusion circuit`),
    });
    visitBack(s, pet, pick(BOND_HI));
    save(s);
  },
  unbond(key: string) {
    const s = load();
    s.bonds = s.bonds.filter((k) => k !== key);
    save(s);
  },

  leaderboard(kind: 'pats' | 'intimacy' | 'level' | 'wins') {
    const pets = this.allPets();
    const s = load();
    return [...pets]
      .map((p) => ({
        pet: p,
        score: kind === 'pats' ? (s.pats[p.key] ?? 0) : kind === 'intimacy' ? p.intimacy : kind === 'wins' ? p.wins : p.level,
      }))
      .sort((a, b) => b.score - a.score || b.pet.rarity - a.pet.rarity)
      .slice(0, 10);
  },
  /**
   * 分享拜访链接：用电路身份等字段编码，任何人打开都能还原「这一只」猫，
   * 不再依赖本机 `/pet/{本地id}`（别人浏览器里对不上）。
   */
  shareUrl(key: string) {
    const pet = this.getPet(key);
    if (!pet) return location.href;
    return `${location.origin}/pet/s/${encodeSharePet(pet)}`;
  },
  /** 解析 `/pet/s/<token>`；若本机已有同一只（同 circuit+cpu），优先显示自己的那只。 */
  fromShareToken(token: string): PublicPet | undefined {
    const data = decodeSharePet(token);
    if (!data) return undefined;
    const s = load();
    const cid = BigInt(data.c);
    const cpu = data.u.toLowerCase() as Address;
    const mine = localChipet.list().find((p) => p.circuitId === cid && p.cpu.toLowerCase() === cpu);
    if (mine) return toPublic(mine, me(s));
    const rarity = (data.r === 1 || data.r === 2 ? data.r : 0) as Rarity;
    return {
      key: shareKeyOf(data.c, data.u),
      id: shareDisplayId(data.c),
      name: data.n.slice(0, 32) || tr('芯喵', 'Chipet'),
      owner: data.o.slice(0, 24) || tr('旅行者', 'Traveler'),
      cpu: (data.u || MOCK_CPU) as Address,
      circuitId: cid,
      rarity,
      energy: clampStat(data.e, 80),
      mood: clampStat(data.m, 70),
      intimacy: Math.max(0, Math.floor(data.i ?? 0)),
      level: Math.max(1, Math.floor(data.lv ?? 1)),
      wins: Math.max(0, Math.floor(data.w ?? 0)),
      mine: false,
    };
  },
};

/** 分享载荷：足以唯一还原外形与档案的最小字段集 */
type SharePayload = {
  n: string;
  o: string;
  c: string;
  u: string;
  r: number;
  lv?: number;
  w?: number;
  m?: number;
  e?: number;
  i?: number;
};

function clampStat(n: number | undefined, fallback: number) {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(n)));
}

function shareKeyOf(circuitId: string, cpu: string) {
  return `share:${circuitId}:${cpu.toLowerCase()}`;
}

/** 展示用伪 id（负数），避免和本机正数 id / NPC 撞车时误路由 */
function shareDisplayId(circuitId: string) {
  let h = 0;
  for (let i = 0; i < circuitId.length; i++) h = (h * 31 + circuitId.charCodeAt(i)) | 0;
  return -1_000_000 - (Math.abs(h) % 900_000);
}

function encodeSharePet(pet: PublicPet): string {
  const payload: SharePayload = {
    n: pet.name,
    o: pet.owner,
    c: pet.circuitId.toString(),
    u: pet.cpu,
    r: pet.rarity,
    lv: pet.level,
    w: pet.wins,
    m: pet.mood,
    e: pet.energy,
    i: pet.intimacy,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSharePet(token: string): SharePayload | null {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (!data?.c || !data?.u || typeof data.n !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}
