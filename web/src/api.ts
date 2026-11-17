// AI 设计需要后端（持有模型密钥）；其余功能全部在浏览器里直接读链完成。

import { DEWEB } from './env.ts';
import { tr } from './i18n.ts';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface AiEvent {
  type: 'attempt' | 'best' | 'done' | 'error';
  round?: number;
  phase?: 'correct' | 'optimize';
  code?: string | null;
  ok?: boolean;
  gateCount?: number;
  feedback?: string;
  message?: string;
  best?: { code: string; gateCount: number } | null;
}

export async function aiAvailable(): Promise<boolean> {
  if (DEWEB && !BASE) return false;
  try {
    const r = await fetch(`${BASE}/api/health`);
    return r.ok && Boolean((await r.json()).ai);
  } catch {
    return false;
  }
}

export async function aiDesign(body: Record<string, unknown>, onEvent: (e: AiEvent) => void, signal?: AbortSignal) {
  const r = await fetch(`${BASE}/api/ai/design`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? tr(`AI 服务返回 ${r.status}`, `AI service returned ${r.status}`));
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (data) onEvent(JSON.parse(data));
    }
  }
}

export interface PetTalkBody {
  name: string;
  species?: string;
  vibe?: string;
  rarity?: number;
  mood?: number;
  energy?: number;
  intimacy?: number;
  level?: number;
  wins?: number;
  mine?: boolean;
  owner?: string;
}

/** 商店链上充值成功后上报；txHash 去重。失败静默（不挡发货）。 */
export async function reportRecharge(body: {
  address: string;
  chainId: number;
  txHash: string;
  amountRaw: string;
  sku?: string;
}): Promise<{ isNew: boolean; rechargeTxs: number } | null> {
  if (DEWEB && !BASE) return null;
  try {
    const r = await fetch(`${BASE}/api/recharges/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({})) as {
      ok?: boolean;
      isNew?: boolean;
      rechargeTxs?: number;
      error?: string;
    };
    if (!r.ok || !data.ok) return null;
    return { isNew: Boolean(data.isNew), rechargeTxs: Number(data.rechargeTxs ?? 0) };
  } catch {
    return null;
  }
}

/** 连接钱包后登记地址；已存在则只刷新 last_seen。失败静默（不挡连钱包）。 */
export async function registerWalletUser(address: string, chainId?: number): Promise<{ isNew: boolean; registered: number } | null> {
  if (DEWEB && !BASE) return null;
  try {
    const r = await fetch(`${BASE}/api/users/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, chainId }),
    });
    const data = await r.json().catch(() => ({})) as { ok?: boolean; isNew?: boolean; registered?: number; error?: string };
    if (!r.ok || !data.ok) return null;
    return { isNew: Boolean(data.isNew), registered: Number(data.registered ?? 0) };
  } catch {
    return null;
  }
}

/** 切磋对手：存档里其他玩家的链上猫（公开接口）。失败返回空列表。 */
export interface RivalPetDto {
  chainId: number;
  petId: number;
  owner: string;
  name: string;
  cpu: string;
  circuitId: string;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
}

export async function fetchRivals(opts?: {
  exclude?: string;
  chainId?: number | 'all';
  limit?: number;
}): Promise<RivalPetDto[]> {
  if (DEWEB && !BASE) return [];
  try {
    const q = new URLSearchParams();
    if (opts?.exclude) q.set('exclude', opts.exclude);
    if (opts?.chainId != null) q.set('chainId', String(opts.chainId));
    if (opts?.limit != null) q.set('limit', String(opts.limit));
    const r = await fetch(`${BASE}/api/pets/rivals?${q}`);
    if (!r.ok) return [];
    const data = await r.json().catch(() => ({})) as { items?: RivalPetDto[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- Chipet 广场 / 钱包进度同步

export type ChipetText = string | { zh: string; en: string };

export interface ChipetActivityDto {
  id: string;
  at: number;
  kind: string;
  actor: ChipetText;
  petKey: string;
  petName: string;
  text: ChipetText;
  wallet?: string;
  likes?: number;
}

export interface ChipetNoteDto {
  id: string;
  petKey: string;
  from: ChipetText;
  text: ChipetText;
  at: number;
  wallet?: string;
}

export interface ChipetProfileDto {
  address: string;
  displayName: string;
  nameCustomized: boolean;
  friendCode: string;
  checkinDay: string;
  streak: number;
  fish: number;
  quest: { day: string; n: Record<string, number>; claimed: Record<string, boolean> };
  myPatsToday: Record<string, string>;
  giftsToday: Record<string, string>;
  wildDay: Record<string, string>;
  bonds: string[];
  liked: Record<string, boolean>;
  bubbles: Record<string, ChipetText>;
  updatedAt: number;
  exists: boolean;
}

export interface ChipetBemDto {
  address: string;
  demoBal: number;
  bondSlots: number;
  eggCredits: number;
  faucetDay: string;
  log: { at: number; sku: string; price: number; via: 'demo' | 'chain'; note?: string }[];
  updatedAt: number;
  exists: boolean;
}

export interface ChipetLocalPetDto {
  id: number;
  name: string;
  cpu: string;
  circuitId: string;
  rarity: number;
  energy: number;
  mood: number;
  intimacy: number;
  level: number;
  xp?: number;
  wins?: number;
  losses?: number;
  lastFeed: number;
  lastPlay: number;
  hatchedAt: number;
}

function apiReady(): boolean {
  return !(DEWEB && !BASE);
}

async function apiGet<T>(path: string): Promise<T | null> {
  if (!apiReady()) return null;
  try {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

async function apiSend<T>(path: string, method: 'POST' | 'PUT', body: unknown): Promise<T | null> {
  if (!apiReady()) return null;
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch {
    return null;
  }
}

export async function fetchChipetFeed(opts?: { limit?: number; before?: number }): Promise<{
  items: ChipetActivityDto[];
  likes: Record<string, number>;
} | null> {
  const q = new URLSearchParams();
  if (opts?.limit != null) q.set('limit', String(opts.limit));
  if (opts?.before != null) q.set('before', String(opts.before));
  const qs = q.toString();
  return apiGet(`/api/chipet/feed${qs ? `?${qs}` : ''}`);
}

export async function fetchChipetNotes(petKey: string): Promise<ChipetNoteDto[] | null> {
  const data = await apiGet<{ items?: ChipetNoteDto[] }>(`/api/chipet/notes?petKey=${encodeURIComponent(petKey)}`);
  return data ? (Array.isArray(data.items) ? data.items : []) : null;
}

export async function postChipetNote(body: {
  address: string;
  petKey: string;
  from: ChipetText;
  text: ChipetText;
  id?: string;
  at?: number;
}): Promise<ChipetNoteDto | null> {
  const data = await apiSend<{ ok?: boolean; note?: ChipetNoteDto }>('/api/chipet/notes', 'POST', body);
  return data?.ok && data.note ? data.note : null;
}

export async function postChipetActivity(body: {
  address?: string;
  id?: string;
  at?: number;
  kind: string;
  actor: ChipetText;
  petKey?: string;
  petName?: string;
  text: ChipetText;
}): Promise<ChipetActivityDto | null> {
  const data = await apiSend<{ ok?: boolean; item?: ChipetActivityDto }>('/api/chipet/activities', 'POST', body);
  return data?.ok && data.item ? data.item : null;
}

export async function postChipetLike(address: string, activityId: string): Promise<{ liked: boolean; likes: number } | null> {
  const data = await apiSend<{ ok?: boolean; liked?: boolean; likes?: number }>('/api/chipet/like', 'POST', { address, activityId });
  if (!data?.ok) return null;
  return { liked: Boolean(data.liked), likes: Number(data.likes) || 0 };
}

export async function postChipetPetAgg(petKey: string, field: 'pats' | 'visits', delta = 1): Promise<{ pats: number; visits: number } | null> {
  const data = await apiSend<{ ok?: boolean; pats?: number; visits?: number }>('/api/chipet/pet-agg', 'POST', { petKey, field, delta });
  if (!data?.ok) return null;
  return { pats: Number(data.pats) || 0, visits: Number(data.visits) || 0 };
}

export async function fetchChipetProfile(address: string): Promise<ChipetProfileDto | null> {
  return apiGet(`/api/chipet/profile?address=${encodeURIComponent(address)}`);
}

export async function putChipetProfile(body: Partial<ChipetProfileDto> & { address: string }): Promise<ChipetProfileDto | null> {
  const data = await apiSend<{ ok?: boolean; profile?: ChipetProfileDto }>('/api/chipet/profile', 'PUT', body);
  return data?.ok && data.profile ? data.profile : null;
}

export async function fetchChipetBem(address: string): Promise<ChipetBemDto | null> {
  return apiGet(`/api/chipet/bem?address=${encodeURIComponent(address)}`);
}

export async function putChipetBem(body: Partial<ChipetBemDto> & { address: string }): Promise<ChipetBemDto | null> {
  const data = await apiSend<{ ok?: boolean; bem?: ChipetBemDto }>('/api/chipet/bem', 'PUT', body);
  return data?.ok && data.bem ? data.bem : null;
}

export async function fetchChipetLocalPets(address: string): Promise<{ pets: ChipetLocalPetDto[]; exists: boolean } | null> {
  const data = await apiGet<{ pets?: ChipetLocalPetDto[]; exists?: boolean }>(
    `/api/chipet/local-pets?address=${encodeURIComponent(address)}`,
  );
  if (!data) return null;
  return { pets: Array.isArray(data.pets) ? data.pets : [], exists: Boolean(data.exists) };
}

export async function putChipetLocalPets(address: string, pets: ChipetLocalPetDto[]): Promise<ChipetLocalPetDto[] | null> {
  const data = await apiSend<{ ok?: boolean; pets?: ChipetLocalPetDto[] }>('/api/chipet/local-pets', 'PUT', { address, pets });
  return data?.ok && Array.isArray(data.pets) ? data.pets : null;
}

/** 芯宠说话：成功返回双语台词；失败抛错，由调用方回落本地台词池。 */
export async function aiPetTalk(body: PetTalkBody, signal?: AbortSignal): Promise<{ zh: string; en: string }> {
  if (DEWEB && !BASE) throw new Error(tr('当前环境无 AI 后端', 'No AI backend in this build'));
  const r = await fetch(`${BASE}/api/ai/pet-talk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await r.json().catch(() => ({})) as { line?: { zh?: string; en?: string }; error?: string };
  if (!r.ok || !data.line?.zh || !data.line?.en) {
    throw new Error(data.error ?? tr(`AI 服务返回 ${r.status}`, `AI service returned ${r.status}`));
  }
  return { zh: data.line.zh, en: data.line.en };
}
