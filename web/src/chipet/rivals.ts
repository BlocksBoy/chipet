import { fetchRivals } from '../api.ts';
import { isChainPet, localChipet } from './store.ts';
import { rivalFromArchive, social, type PublicPet } from './social.ts';

/** 拉其他玩家的链上芯喵进邻居/切磋池；排除本机同 id+同名。 */
export async function hydrateChainRivals(opts?: {
  exclude?: string | null;
  limit?: number;
}): Promise<PublicPet[]> {
  const items = await fetchRivals({
    exclude: opts?.exclude || undefined,
    limit: opts?.limit ?? 48,
  });
  const localChain = localChipet.list().filter(isChainPet);
  const pets = items.map(rivalFromArchive).filter((p) => {
    const petId = Number(p.key.split(':')[2]);
    return !localChain.some((lp) => lp.id === petId && lp.name === p.name);
  });
  social.setChainRivals(pets);
  return pets;
}
