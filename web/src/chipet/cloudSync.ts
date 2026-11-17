/**
 * Chipet 本地 ↔ API 同步：公共广场随时拉；私有进度连钱包后 hydrate / 上传。
 */
import {
  fetchChipetBem,
  fetchChipetFeed,
  fetchChipetLocalPets,
  fetchChipetNotes,
  fetchChipetProfile,
  postChipetActivity,
  postChipetLike,
  postChipetNote,
  postChipetPetAgg,
  putChipetBem,
  putChipetLocalPets,
  putChipetProfile,
  type ChipetText,
} from '../api.ts';
import { bem } from './bem.ts';
import { social } from './social.ts';
import { localChipet } from './store.ts';

let profileTimer: ReturnType<typeof setTimeout> | null = null;
let bemTimer: ReturnType<typeof setTimeout> | null = null;
let petsTimer: ReturnType<typeof setTimeout> | null = null;
let hydrating = false;
let publicHydrated = false;

function wallet(): string {
  return (social.profile().boundWallet || '').toLowerCase();
}

export const cloudSync = {
  /** 启动时拉公共动态（未连钱包也可）。 */
  async hydratePublic(): Promise<void> {
    const feed = await fetchChipetFeed({ limit: 40 });
    if (!feed?.items?.length) return;
    social.applyCloudFeed(feed.items as Parameters<typeof social.applyCloudFeed>[0], feed.likes);
    publicHydrated = true;
  },

  /** 连钱包后：拉 profile/bem/pets；云端空则上传本地，否则覆盖本地。 */
  async hydrateWallet(address: string): Promise<void> {
    const addr = address.trim().toLowerCase();
    if (!addr || hydrating) return;
    hydrating = true;
    // 取消 bindAccount/save 触发的待推送，避免用旧本地盖掉刚拉下的云端
    if (profileTimer) { clearTimeout(profileTimer); profileTimer = null; }
    if (bemTimer) { clearTimeout(bemTimer); bemTimer = null; }
    if (petsTimer) { clearTimeout(petsTimer); petsTimer = null; }
    try {
      if (!publicHydrated) await this.hydratePublic();

      const [profile, bemState, petsState] = await Promise.all([
        fetchChipetProfile(addr),
        fetchChipetBem(addr),
        fetchChipetLocalPets(addr),
      ]);

      if (profile) {
        if (!profile.exists) {
          const snap = social.exportProfileForCloud();
          if (snap) await putChipetProfile({ address: addr, ...snap });
        } else {
          social.applyCloudProfile(profile);
        }
      }

      if (bemState) {
        if (!bemState.exists) {
          const local = bem.exportForCloud();
          if (local.hasLocal) await putChipetBem({ address: addr, ...local.state });
        } else {
          bem.applyCloud({
            demoBal: bemState.demoBal,
            bondSlots: bemState.bondSlots,
            eggCredits: bemState.eggCredits,
            faucetDay: bemState.faucetDay,
            log: bemState.log as ReturnType<typeof bem.exportForCloud>['state']['log'],
          });
        }
      }

      if (petsState) {
        if (!petsState.exists) {
          const local = localChipet.exportLocalForCloud();
          if (local.length) await putChipetLocalPets(addr, local);
        } else {
          localChipet.applyCloudLocal(petsState.pets);
        }
      }
    } finally {
      hydrating = false;
    }
  },

  /** 读某宠留言并写入本地缓存（打开宠页时）。 */
  async hydrateNotes(petKey: string): Promise<void> {
    const items = await fetchChipetNotes(petKey);
    if (!items) return;
    social.applyCloudNotes(petKey, items);
  },

  scheduleProfilePush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (profileTimer) clearTimeout(profileTimer);
    profileTimer = setTimeout(() => {
      if (hydrating) return;
      const snap = social.exportProfileForCloud();
      if (!snap) return;
      void putChipetProfile({ address: addr, ...snap });
    }, 400);
  },

  scheduleBemPush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (bemTimer) clearTimeout(bemTimer);
    bemTimer = setTimeout(() => {
      if (hydrating) return;
      const { state } = bem.exportForCloud();
      void putChipetBem({ address: addr, ...state });
    }, 400);
  },

  schedulePetsPush() {
    if (hydrating) return;
    const addr = wallet();
    if (!addr) return;
    if (petsTimer) clearTimeout(petsTimer);
    petsTimer = setTimeout(() => {
      if (hydrating) return;
      const pets = localChipet.exportLocalForCloud();
      void putChipetLocalPets(addr, pets);
    }, 400);
  },

  pushActivity(act: {
    id: string;
    at: number;
    kind: string;
    actor: ChipetText;
    petKey: string;
    petName: string;
    text: ChipetText;
  }) {
    const addr = wallet();
    void postChipetActivity({
      address: addr || undefined,
      id: act.id,
      at: act.at,
      kind: act.kind,
      actor: act.actor,
      petKey: act.petKey,
      petName: act.petName,
      text: act.text,
    });
  },

  pushNote(note: {
    id: string;
    petKey: string;
    from: ChipetText;
    text: ChipetText;
    at: number;
  }) {
    const addr = wallet();
    if (!addr) return;
    void postChipetNote({
      address: addr,
      id: note.id,
      petKey: note.petKey,
      from: note.from,
      text: note.text,
      at: note.at,
    });
  },

  pushLike(activityId: string) {
    const addr = wallet();
    if (!addr) return;
    void postChipetLike(addr, activityId).then((r) => {
      if (!r) return;
      social.applyCloudLikeResult(activityId, r.liked, r.likes);
    });
  },

  pushPetAgg(petKey: string, field: 'pats' | 'visits', delta = 1) {
    void postChipetPetAgg(petKey, field, delta).then((r) => {
      if (!r) return;
      social.applyCloudPetAgg(petKey, r.pats, r.visits);
    });
  },
};
