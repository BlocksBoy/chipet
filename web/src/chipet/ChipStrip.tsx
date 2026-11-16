import { ArrowRight, Cpu, Zap } from 'lucide-react';
import { cn } from '../components/ui.tsx';
import { tr } from '../i18n.ts';

/** 功率格：四格闪电，亮几格就是几点功率。 */
export function PowerPips({ power, max = 4, className }: { power: number; max?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={tr(`功率 ${power}`, `power ${power}`)}>
      {Array.from({ length: max }, (_, i) => (
        <Zap
          key={i}
          className={cn('size-3.5', i < power ? 'fill-gold text-gold' : 'text-current opacity-25')}
          strokeWidth={2.2}
        />
      ))}
    </span>
  );
}

/**
 * 一次电路判定的全过程：输入位 → 心脏芯片 → 输出灯 → 功率。
 * 对战里双方各一条并排在宠物下方，让「胜负由电路算出来」看得见。
 */
export function ChipStrip({ who, chip, gates, inBits, outBits, power, className }: {
  who: string;
  chip: string;
  gates: number;
  inBits: number[];
  outBits: number[];
  power: number;
  className?: string;
}) {
  return (
    <div className={cn('chip-strip flex min-w-0 flex-col gap-1.5 rounded-2xl bg-[#14231f] px-2.5 py-2 font-mono text-[10px] text-[#b9d4c7] sm:gap-2 sm:px-3 sm:py-2.5 sm:text-[11px]', className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate font-sans text-xs font-semibold text-white">{who}</span>
        <span className="flex shrink-0 items-center gap-1 text-[#e8f3ee]">
          {tr('功率', 'power')} <b className="font-display text-sm text-gold">{power}</b>
          <PowerPips power={power} />
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 sm:gap-x-2">
        <span className="flex items-center gap-[3px]" aria-label={tr(`输入 ${inBits.join('')}`, `inputs ${inBits.join('')}`)}>
          {inBits.map((b, i) => (
            <i key={i} className={cn('block size-2 rounded-[2px]', b ? 'bg-copper shadow-[0_0_6px_rgb(240_139_85/0.8)]' : 'bg-[#2c4039]')} />
          ))}
        </span>
        <ArrowRight className="size-3 shrink-0 text-[#5f7d72]" />
        <span className="flex min-w-0 max-w-full items-center gap-1 truncate rounded-md bg-[#20362f] px-1.5 py-0.5 text-[#e8f3ee] ring-1 ring-copper/50">
          <Cpu className="size-3 shrink-0 text-copper-hi" />
          <span className="truncate">{chip} · {gates} {tr('门', 'gates')}</span>
        </span>
        <ArrowRight className="size-3 shrink-0 text-[#5f7d72]" />
        <span className="flex items-center gap-1" aria-label={tr(`输出 ${outBits.join('')}`, `outputs ${outBits.join('')}`)}>
          {outBits.map((b, i) => (
            <i
              key={i}
              className={cn('chip-led block size-2.5 rounded-full', b ? 'bg-[#59e0c8] shadow-[0_0_8px_rgb(89_224_200/0.9)]' : 'bg-[#2c4039]')}
              style={{ animationDelay: `${0.25 + i * 0.08}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
