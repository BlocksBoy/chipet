import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useEffect, useState, type ButtonHTMLAttributes, type ComponentType, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Hourglass, Loader2, Radio, Scale, type LucideProps } from 'lucide-react';
import type { BountyPhase } from '@tapearena/chain';
import { phaseText } from '../format.ts';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

type Icon = ComponentType<LucideProps>;

/** 全站统一的内容宽度与左右留白。 */
export const PAGE = 'mx-auto w-full min-w-0 max-w-[1180px] px-4 sm:px-7';

/** 跟随媒体查询变化的布尔值，比如 useMedia('(min-width: 640px)')。 */
export function useMedia(query: string) {
  const [on, setOn] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setOn(m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  }, [query]);
  return on;
}

/** 页头：小标签 + 大标题 + 一句说明，右侧放操作或数据。所有一级页面共用。 */
export function PageHeader({ eyebrow, icon: I, title, desc, right, className }:
  { eyebrow?: ReactNode; icon?: Icon; title: ReactNode; desc?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-5', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-si/[0.07] px-3 py-1 font-mono text-[11px] text-si-dim ring-1 ring-si/25 ring-inset">
            {I && <I className="size-3.5" />}{eyebrow}
          </div>
        )}
        <h1 className="text-3xl leading-tight sm:text-[2.5rem]">{title}</h1>
        {desc && <p className="mt-2 max-w-2xl text-pretty text-mute">{desc}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

/** 区块小标题：面板之外、卡片网格之上用。 */
export function SectionTitle({ icon: I, title, desc, right, className }:
  { icon?: Icon; title: ReactNode; desc?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-xl sm:text-2xl">
          {I && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-si/10 text-si"><I className="size-[18px]" /></span>}
          {title}
        </h2>
        {desc && <p className="mt-1 text-sm text-pretty text-mute">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

const BAND_TONE = {
  si: 'bg-si/10 text-si',
  copper: 'bg-copper/10 text-copper',
  gold: 'bg-gold/15 text-gold-dim',
  violet: 'bg-[#8b7cf0]/12 text-[#6a5ad6]',
};

/** 一排关键数字：图标 + 大数字 + 说明，各页顶部共用。 */
export function StatBand({ items, className }: {
  items: { icon: Icon; label: ReactNode; value: ReactNode; tone?: keyof typeof BAND_TONE }[];
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line/80 bg-line/70 shadow-sm shadow-si/5 lg:grid-cols-4', className)}>
      {items.map(({ icon: I, label, value, tone = 'si' }, i) => (
        <div key={i} className="flex min-w-0 items-center gap-3.5 bg-panel px-4 py-4 sm:px-5">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', BAND_TONE[tone])}><I className="size-5" /></span>
          <div className="min-w-0">
            <dd className="m-0 font-display text-2xl leading-tight font-bold tabular-nums text-ink">{value}</dd>
            <dt className="truncate text-xs text-mute">{label}</dt>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** 分段切换（页签）。 */
export function Segmented<K extends string>({ value, onChange, options, size = 'md', className }: {
  value: K;
  onChange: (k: K) => void;
  options: readonly (readonly [K, ReactNode, Icon?])[];
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-panel-2/80 p-1', className)}>
      {options.map(([k, label, I]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
            value === k ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-mute hover:text-ink',
          )}>
          {I && <I className={cn('size-4', value === k && 'text-si')} />}{label}
        </button>
      ))}
    </div>
  );
}

/** 进度条：能量、心情、经验这类 0–100 的量。 */
export function Meter({ label, value, text, tone = 'bg-si', icon: I, className }:
  { label: ReactNode; value: number; text?: ReactNode; tone?: string; icon?: Icon; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-mute">
        <span className="flex items-center gap-1.5">{I && <I className="size-3.5 text-faint" />}{label}</span>
        <span className="font-mono tabular-nums text-ink">{text ?? Math.round(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** 外形基因小标签（Cattribute）。 */
export function Trait({ label, value, className }: { label?: ReactNode; value: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-panel-2/70 px-2.5 py-0.5 text-[11px] whitespace-nowrap text-mute ring-1 ring-line/70 ring-inset', className)}>
      {label && <span className="font-mono text-faint">{label}</span>}
      <span className="font-medium text-ink/80">{value}</span>
    </span>
  );
}

const BTN = {
  primary: 'bg-copper text-white shadow-md shadow-copper/25 hover:bg-copper-hi',
  si: 'bg-si text-white shadow-md shadow-si/20 hover:brightness-110',
  ghost: 'bg-panel text-ink ring-1 ring-inset ring-line-2 shadow-sm hover:bg-panel-2 hover:ring-si/40',
  danger: 'bg-danger text-white hover:brightness-110',
};

export function btn(variant: keyof typeof BTN = 'primary', size: 'sm' | 'md' | 'lg' = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl font-semibold whitespace-nowrap no-underline transition duration-150 hover:-translate-y-0.5 active:translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:hover:translate-y-0 [&_svg]:shrink-0',
    { sm: 'h-8 px-3 text-[13px] [&_svg]:size-3.5', md: 'h-10 px-4 text-sm [&_svg]:size-4', lg: 'h-12 px-5 text-[15px] [&_svg]:size-[18px]' }[size],
    BTN[variant],
    extra,
  );
}

export function Button({ variant, size, icon: I, busy, className, children, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN; size?: 'sm' | 'md' | 'lg'; icon?: Icon; busy?: boolean }) {
  return (
    <button type="button" className={btn(variant, size, className)} {...p}>
      {busy ? <Loader2 className="animate-spin" /> : I && <I />}
      {children}
    </button>
  );
}

export function Panel({ title, icon: I, right, className, bodyClass, children }:
  { title?: ReactNode; icon?: Icon; right?: ReactNode; className?: string; bodyClass?: string; children: ReactNode }) {
  return (
    <section className={cn('overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5', className)}>
      {title !== undefined && (
        <header className="flex items-center gap-2.5 border-b border-line/70 px-5 py-3.5 text-[13px]">
          {I && <span className="grid size-7 place-items-center rounded-xl bg-panel-2 text-si"><I className="size-4" /></span>}
          <span className="font-semibold text-ink">{title}</span>
          <div className="flex-1" />
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const TAG = {
  neutral: 'text-mute ring-line-2',
  si: 'text-si ring-si-dim bg-si/5',
  gold: 'text-gold ring-gold-dim bg-gold/5',
  copper: 'text-copper-dim ring-copper/30 bg-copper/10',
  danger: 'text-danger ring-danger-dim bg-danger/5',
  faint: 'text-faint ring-line',
};

export function Tag({ tone = 'neutral', icon: I, className, children, title }: { tone?: keyof typeof TAG; icon?: Icon; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] whitespace-nowrap ring-1 ring-inset', TAG[tone], className)}>
      {I && <I className="size-3" />}
      {children}
    </span>
  );
}

const PHASE: Record<BountyPhase, { tone: keyof typeof TAG; icon: Icon }> = {
  open: { tone: 'si', icon: Radio },
  challenge: { tone: 'gold', icon: Scale },
  settle: { tone: 'copper', icon: Hourglass },
  finalized: { tone: 'faint', icon: CircleCheck },
};

export function PhaseTag({ phase }: { phase: BountyPhase }) {
  const { tone, icon: I } = PHASE[phase];
  return (
    <Tag tone={tone}>
      {phase === 'open' ? <span className="relative flex size-1.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-si opacity-60" /><span className="relative inline-flex size-1.5 rounded-full bg-si" /></span> : <I className="size-3" />}
      {phaseText(phase)}
    </Tag>
  );
}
const FIELD = 'w-full rounded-2xl border border-line bg-panel px-3.5 py-2 text-sm text-ink outline-none shadow-sm transition placeholder:text-faint focus:border-si focus:ring-4 focus:ring-si/15';

export function Input({ mono, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn(FIELD, 'h-10', mono && 'font-mono text-[13px] tabular-nums', className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, 'text-pretty', className)} {...p} />;
}
export function Select({ className, wrapClass, icon: I, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { wrapClass?: string; icon?: Icon }) {
  return (
    <span className={cn('relative inline-flex items-center', wrapClass)}>
      {I && <I className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />}
      <select
        className={cn(
          FIELD,
          // 固定高度 + 清掉 FIELD 的 py-2，文字与箭头垂直居中
          'h-10 cursor-pointer appearance-none py-0 leading-10 pr-10',
          I && 'pl-9',
          className,
        )}
        {...p}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-mute" />
    </span>
  );
}

export function Field({ label, icon: I, hint, children, className }: { label: string; icon?: Icon; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-center gap-1.5 font-mono text-xs text-mute">{I && <I className="size-3.5 text-faint" />}{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub, icon: I, tone = 'ink', className }:
  { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: Icon; tone?: 'ink' | 'copper' | 'si' | 'gold'; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-2xl bg-panel-2/70 px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-faint">{I && <I className="size-3.5 shrink-0" />}<span className="truncate">{label}</span></div>
      <div className={cn('mt-0.5 truncate font-display text-xl font-bold tabular-nums', { ink: 'text-ink', copper: 'text-copper', si: 'text-si', gold: 'text-gold-dim' }[tone])}>{value}</div>
      {sub && <div className="truncate text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

export function Empty({ icon: I, title, children, action }: { icon: Icon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-panel-2 text-copper ring-1 ring-line-2"><I className="size-7" /></span>
      <h3 className="text-xl text-ink">{title}</h3>
      {children && <div className="mt-2 w-full max-w-md text-sm text-pretty [overflow-wrap:anywhere] text-mute">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrBar({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 border-t border-danger/25 bg-danger/[0.08] px-3.5 py-2.5 font-mono text-[12.5px] text-danger"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{children}</span></div>;
}

export function Loading({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-mute', className)} role="status" aria-live="polite" aria-busy="true">
      <Loader2 className="size-4 shrink-0 animate-spin text-copper" />
      {children}
    </div>
  );
}

export function KV({ rows }: { rows: [Icon, string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([I, k, v]) => (
        <div key={k} className="contents">
          <dt className="flex items-center gap-1.5 font-mono text-xs text-faint"><I className="size-3.5" />{k}</dt>
          <dd className="m-0 font-mono text-[12.5px] break-all tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
