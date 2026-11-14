import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown, CircleAlert, CircleCheck, Hourglass, Loader2, Radio, Scale, type LucideProps } from 'lucide-react';
import type { BountyPhase } from '@tapearena/chain';
import { PHASE_TEXT } from '../format.ts';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

type Icon = ComponentType<LucideProps>;

const BTN = {
  primary: 'bg-copper text-[#1a0f07] shadow-sm shadow-copper/30 hover:bg-copper-hi',
  si: 'bg-si text-[#06201a] shadow-sm shadow-si/20 hover:brightness-110',
  ghost: 'bg-transparent text-ink ring-1 ring-inset ring-line-2 hover:bg-copper/5 hover:ring-copper-dim',
  danger: 'bg-danger text-[#200805] hover:brightness-110',
};

export function btn(variant: keyof typeof BTN = 'primary', size: 'sm' | 'md' | 'lg' = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap no-underline transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale [&_svg]:shrink-0',
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
    <section className={cn('overflow-hidden rounded-xl border border-line bg-panel/90 backdrop-blur-sm', className)}>
      {title !== undefined && (
        <header className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-[13px]">
          {I && <span className="grid size-7 place-items-center rounded-md bg-panel-2 text-copper ring-1 ring-line-2"><I className="size-4" /></span>}
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
  copper: 'text-copper-hi ring-copper-dim bg-copper/5',
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
      {PHASE_TEXT[phase]}
    </Tag>
  );
}
const FIELD = 'w-full rounded-lg border border-line-2 bg-substrate px-3 py-2 text-sm text-ink outline-none transition placeholder:text-faint focus:border-copper-dim focus:ring-4 focus:ring-copper/10';

export function Input({ mono, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn(FIELD, 'h-10', mono && 'font-mono text-[13px] tabular-nums', className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD, 'text-pretty', className)} {...p} />;
}
export function Select({ className, wrapClass, icon: I, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { wrapClass?: string; icon?: Icon }) {
  return (
    <span className={cn('relative inline-flex items-center', wrapClass)}>
      {I && <I className="pointer-events-none absolute left-3 size-4 text-faint" />}
      <select className={cn(FIELD, 'h-10 cursor-pointer appearance-none pr-10', I && 'pl-9', className)} {...p}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3.5 size-4 text-mute" />
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

export function Stat({ label, value, icon: I, tone = 'ink' }: { label: string; value: ReactNode; icon?: Icon; tone?: 'ink' | 'copper' | 'si' | 'gold' }) {
  return (
    <div className="bg-panel px-4 py-3">
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-faint">{I && <I className="size-3.5" />}{label}</div>
      <div className={cn('mt-0.5 font-display text-[26px] font-extrabold tabular-nums', { ink: 'text-ink', copper: 'text-copper-hi', si: 'text-si', gold: 'text-gold' }[tone])}>{value}</div>
    </div>
  );
}

export function Empty({ icon: I, title, children, action }: { icon: Icon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-panel-2 text-copper ring-1 ring-line-2"><I className="size-7" /></span>
      <h3 className="text-xl text-ink">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-pretty text-mute">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrBar({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2 border-t border-danger/25 bg-danger/[0.08] px-3.5 py-2.5 font-mono text-[12.5px] text-danger"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /><span>{children}</span></div>;
}

export function Loading({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-mute"><Loader2 className="size-4 animate-spin text-copper" />{children}</div>;
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
