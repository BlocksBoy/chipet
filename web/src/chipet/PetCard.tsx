import type { ComponentType, ReactNode } from 'react';
import { Cable, Fish, Hand, MessageCircleHeart, Sparkles, Swords, Zap, type LucideProps } from 'lucide-react';
import { Tag, cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';
import { PetAvatar } from './PetAvatar.tsx';
import { phenotypeOf, rarityLabel, type Rarity } from './phenotype.ts';
import type { Activity } from './social.ts';

export const rarityTone = (r: Rarity) => (r === 2 ? 'gold' : r === 1 ? 'si' : 'faint') as 'gold' | 'si' | 'faint';

/** 全站统一的芯喵卡片：上半是这只猫专属的粉彩底卡，下半是名字、一行说明、标签和操作。 */
export function PetCard({
  pet, name, sub, badge, corner, tags, footer, onClick, size = 128, mood, locked, className,
}: {
  pet: { cpu: string; circuitId: bigint; rarity: Rarity; mood?: number; level?: number };
  name: ReactNode;
  /** 名字下面的一行说明 */
  sub?: ReactNode;
  /** 底卡左上角（名次、等级…） */
  badge?: ReactNode;
  /** 底卡右上角 */
  corner?: ReactNode;
  /** 追加在稀有度后面的标签 */
  tags?: ReactNode;
  /** 卡片底部的操作区，不参与整卡点击 */
  footer?: ReactNode;
  onClick?: () => void;
  size?: number;
  mood?: number;
  /** 还没遇见：只露一个剪影 */
  locked?: boolean;
  className?: string;
}) {
  const ph = phenotypeOf(pet.cpu, pet.circuitId, pet.rarity);
  const body = (
    <>
      <div className="relative grid w-full place-items-center px-3 pt-6 pb-3" style={{ backgroundColor: locked ? undefined : ph.bg }}>
        {badge && <span className="absolute top-2.5 left-3 font-mono text-[11px] font-medium text-ink/55">{badge}</span>}
        {corner && <span className="absolute top-2.5 right-3 font-mono text-[11px] text-ink/55">{corner}</span>}
        <div className={cn('transition-transform duration-200 group-hover:scale-105', locked && 'opacity-25 brightness-0')}>
          <PetAvatar cpu={pet.cpu} circuitId={pet.circuitId} rarity={pet.rarity} mood={mood ?? pet.mood ?? 80} size={size} lively={!locked} />
        </div>
      </div>
      <div className="w-full px-4 pt-3 pb-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-[17px] font-bold text-ink">{name}</span>
          {pet.level !== undefined && !locked && <span className="shrink-0 font-mono text-[11px] text-mute">Lv.{pet.level}</span>}
        </div>
        {sub && <div className="mt-0.5 truncate text-xs text-mute">{sub}</div>}
        <div className="mt-2 flex flex-wrap gap-1">
          {!locked && <Tag tone={rarityTone(pet.rarity)}>{rarityLabel(pet.rarity)}</Tag>}
          {tags}
        </div>
      </div>
    </>
  );
  return (
    <div className={cn(
      'group flex h-full flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5 transition duration-200',
      onClick && 'hover:-translate-y-0.5 hover:border-si/40 hover:shadow-md hover:shadow-si/10',
      locked && 'bg-panel-2/40',
      className,
    )}>
      {onClick
        ? <button type="button" onClick={onClick} className="flex flex-1 flex-col text-left">{body}</button>
        : <div className="flex flex-1 flex-col">{body}</div>}
      {footer && <div className="flex gap-2 px-4 pb-4">{footer}</div>}
    </div>
  );
}

export function timeAgo(at: number) {
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return tr('刚刚', 'just now');
  if (m < 60) return tr(`${m} 分钟前`, `${m}m ago`);
  const h = Math.floor(m / 60);
  if (h < 24) return tr(`${h} 小时前`, `${h}h ago`);
  return tr(`${Math.floor(h / 24)} 天前`, `${Math.floor(h / 24)}d ago`);
}

export const ACT_ICON: Record<Activity['kind'], ComponentType<LucideProps>> = {
  hatch: Sparkles,
  pat: Hand,
  gift: Fish,
  note: MessageCircleHeart,
  checkin: Sparkles,
  talk: MessageCircleHeart,
  battle: Swords,
  bond: Cable,
  power: Zap,
};

/** 动态图标的底色：对战用铜色、牵线用金色，其余用主色。 */
export const actTone = (kind: Activity['kind']) =>
  kind === 'battle' ? 'bg-copper/10 text-copper' : kind === 'bond' ? 'bg-gold/15 text-gold-dim' : 'bg-si/10 text-si';

/** 动态里的 petKey（mine:3 / npc:-2）→ 宠物页路由 id */
export const routeIdOf = (petKey: string) => (petKey.startsWith('npc:') ? petKey.slice(4) : petKey.slice(5));
