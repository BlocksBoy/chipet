import { useMemo, useState, useSyncExternalStore } from 'react';
import { Cat, Trophy } from 'lucide-react';
import { Button, Select } from '../components/ui.tsx';
import { AUX_HEART_POWER } from './battle.ts';
import { getLocalPetsRev, localChipet, subscribeLocalPets } from './store.ts';
import { useT } from '../i18n.ts';

/** 把擂台冠军电路焊进自家芯喵副心脏。 */
export function WeldAuxHeartControl({
  bountyId,
  cpu,
  circuitId,
  className,
}: {
  bountyId: number;
  cpu: string;
  circuitId: string | number | bigint;
  className?: string;
}) {
  const t = useT();
  const petsRev = useSyncExternalStore(subscribeLocalPets, getLocalPetsRev, getLocalPetsRev);
  const pets = useMemo(() => localChipet.list(), [petsRev]);
  const [petId, setPetId] = useState(() => pets[0]?.id ?? 0);
  const [flash, setFlash] = useState('');
  const [err, setErr] = useState('');

  if (pets.length === 0) {
    return (
      <p className={className ? `${className} text-sm text-mute` : 'text-sm text-mute'}>
        {t('先孵一只芯喵，才能焊入副心脏纹。', 'Hatch a kitty first before welding an aux-heart crest.')}
      </p>
    );
  }

  const selected = pets.find((p) => p.id === petId) ?? pets[0]!;
  const equipped = localChipet.hasAuxHeart(selected)
    && selected.auxHeart?.bountyId === bountyId
    && selected.auxHeart.circuitId === String(circuitId);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-1 font-mono text-[11px] text-faint">
            <Cat className="size-3" />{t('焊给哪只芯喵', 'Which kitty')}
          </span>
          <Select
            value={String(selected.id)}
            onChange={(e) => setPetId(Number(e.target.value))}
            className="w-full"
          >
            {pets.map((p) => (
              <option key={p.id} value={p.id}>
                #{String(p.id).padStart(4, '0')} · {p.name}
                {localChipet.hasAuxHeart(p) ? t('（已有纹）', ' (has crest)') : ''}
              </option>
            ))}
          </Select>
        </label>
        <Button
          size="sm"
          variant="si"
          icon={Trophy}
          disabled={equipped || localChipet.auxHeartCdLeft(selected) > 0}
          onClick={() => {
            try {
              localChipet.weldAuxHeart(selected.id, {
                bountyId,
                cpu,
                circuitId: String(circuitId),
              });
              setErr('');
              setFlash(t(
                `已焊入擂台 #${bountyId} 纹 · 对战功率 +${AUX_HEART_POWER}`,
                `Welded bounty #${bountyId} crest · battle power +${AUX_HEART_POWER}`,
              ));
              window.setTimeout(() => setFlash(''), 2800);
            } catch (e) {
              setFlash('');
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {equipped
            ? t('已焊在这只上', 'Already on this kitty')
            : t('焊入副心脏', 'Weld aux heart')}
        </Button>
      </div>
      {flash && <p className="mt-2 text-xs text-si-dim">{flash}</p>}
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
