import type { Pin } from '@tapearena/netlist';
import { tr } from '../i18n.ts';
import { cn } from './ui.tsx';

export function Bits({ width, value, onToggle, out }: { width: number; value: bigint; onToggle?: (bit: number) => void; out?: boolean }) {
  return (
    <div className="flex flex-row-reverse flex-wrap justify-end gap-1">
      {Array.from({ length: width }, (_, i) => {
        const on = ((value >> BigInt(i)) & 1n) === 1n;
        return (
          <button key={i} type="button" title={tr(`第 ${i} 位`, `bit ${i}`)} aria-label={tr(`第 ${i} 位：${on ? 1 : 0}`, `bit ${i}: ${on ? 1 : 0}`)}
            onClick={onToggle ? () => onToggle(i) : undefined} disabled={!onToggle && !out}
            className={cn(
              'grid size-6 place-items-center rounded font-mono text-[11px] ring-1 ring-inset transition-colors duration-100',
              on
                ? out ? 'bg-si text-[#06201a] ring-si shadow-[0_0_10px_rgb(127_209_185/0.45)]' : 'bg-copper text-[#1a0f07] ring-copper-hi shadow-[0_0_10px_rgb(224_138_76/0.45)]'
                : 'bg-[#0a0d0b] text-faint ring-line-2',
              onToggle ? 'cursor-pointer hover:ring-copper-dim' : 'cursor-default',
            )}>
            {on ? 1 : 0}
          </button>
        );
      })}
    </div>
  );
}

export function PinRows({ pins, values, onChange, out }: {
  pins: Pin[]; values: Record<string, bigint>; onChange?: (name: string, v: bigint) => void; out?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {pins.map((p) => {
        const v = values[p.name] ?? 0n;
        return (
          <div className="grid grid-cols-[88px_1fr_64px] items-center gap-2.5" key={p.name}>
            <span className="truncate font-mono text-[13px] text-mute">{p.name}{p.width > 1 ? `[${p.width}]` : ''}</span>
            <Bits width={p.width} value={v} out={out} onToggle={onChange ? (i) => onChange(p.name, v ^ (1n << BigInt(i))) : undefined} />
            <span className={cn('text-right font-mono text-[13px] tabular-nums', out ? 'text-si' : 'text-ink')}>{v.toString()}</span>
          </div>
        );
      })}
    </div>
  );
}
