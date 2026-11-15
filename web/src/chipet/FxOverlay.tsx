import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

export type ChipImpulse = 'idle' | 'hatch' | 'pat' | 'gift' | 'talk' | 'happy';

type Bit = {
  id: number;
  x: number;
  y: number;
  c: string;
  s: number;
  kind: 'dot' | 'spark' | 'chip' | 'star' | 'shell';
  dx: number;
  dy: number;
  rot: number;
};

/** 孵化 / 互动时的环波、星屑与蛋壳碎片。 */
export function FxOverlay({ impulse, label, nonce }: {
  impulse: ChipImpulse;
  label?: string;
  /** 变化时重放特效，用于同一种脉冲的连续触发 */
  nonce?: number;
}) {
  const [bits, setBits] = useState<Bit[]>([]);
  const show = impulse !== 'idle';
  const hatch = impulse === 'hatch';

  useEffect(() => {
    if (impulse === 'idle') return;
    const colors = ['#2a9d8f', '#e07a45', '#f2c46d', '#7fd1b9', '#ffb27a', '#ffffff', '#f5a8c0', '#8eb0dc'];
    const n = hatch ? 48 : 22;
    setBits(
      Array.from({ length: n }, (_, i) => {
        const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        const dist = (hatch ? 90 : 55) + Math.random() * (hatch ? 90 : 50);
        return {
          id: Date.now() + i,
          x: 50 + (Math.random() - 0.5) * 12,
          y: 48 + (Math.random() - 0.5) * 10,
          c: colors[i % colors.length]!,
          s: 4 + Math.random() * (hatch ? 14 : 8),
          kind:
            hatch && i % 6 === 0
              ? 'shell'
              : i % 5 === 0
                ? 'star'
                : i % 4 === 0
                  ? 'spark'
                  : i % 7 === 0
                    ? 'chip'
                    : 'dot',
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist * 0.85 - (hatch ? 40 : 20),
          rot: 80 + Math.random() * 280,
        };
      }),
    );
  }, [impulse, hatch, nonce]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[1.75rem]">
      <AnimatePresence>
        {show && (
          <motion.div
            key={impulse + String(bits[0]?.id)}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute left-1/2 top-[48%] size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  borderColor:
                    i === 0
                      ? 'rgb(42 157 143 / 0.6)'
                      : i === 1
                        ? 'rgb(224 122 69 / 0.45)'
                        : 'rgb(242 196 109 / 0.4)',
                }}
                initial={{ scale: 0.25, opacity: 0.9 }}
                animate={{ scale: 2.4 + i * 0.4, opacity: 0 }}
                transition={{ duration: 0.85 + i * 0.1, delay: i * 0.05, ease: 'easeOut' }}
              />
            ))}

            <motion.div
              className="absolute left-1/2 top-[48%] size-48 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background: hatch
                  ? 'radial-gradient(circle, rgb(255 255 255 / 0.75), rgb(42 157 143 / 0.35), transparent 70%)'
                  : 'radial-gradient(circle, rgb(42 157 143 / 0.4), transparent 68%)',
              }}
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: hatch ? 2.6 : 2.1, opacity: 0 }}
              transition={{ duration: hatch ? 1 : 0.75, ease: 'easeOut' }}
            />

            {bits.map((b, i) => {
              if (b.kind === 'shell') {
                return (
                  <motion.span
                    key={b.id}
                    className="absolute rounded-[40%_60%_50%_45%]"
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      width: b.s * 1.4,
                      height: b.s,
                      background: `linear-gradient(145deg, #fff, ${b.c})`,
                      border: '2px solid #2f2f38',
                    }}
                    initial={{ opacity: 1, scale: 0.5, rotate: 0, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 1, x: b.dx, y: b.dy, rotate: b.rot }}
                    transition={{ duration: 0.95, delay: i * 0.008, ease: 'easeOut' }}
                  />
                );
              }
              if (b.kind === 'star') {
                return (
                  <motion.span
                    key={b.id}
                    className="absolute font-display font-bold"
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      color: b.c,
                      fontSize: b.s * 1.4,
                      textShadow: `0 0 10px ${b.c}`,
                    }}
                    initial={{ opacity: 1, scale: 0.2, rotate: 0, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 1.3, x: b.dx, y: b.dy, rotate: b.rot }}
                    transition={{ duration: 0.8, delay: i * 0.01, ease: 'easeOut' }}
                  >
                    ✦
                  </motion.span>
                );
              }
              if (b.kind === 'spark') {
                return (
                  <motion.span
                    key={b.id}
                    className="absolute"
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      width: b.s * 1.8,
                      height: 2,
                      background: `linear-gradient(90deg, transparent, ${b.c}, transparent)`,
                      boxShadow: `0 0 8px ${b.c}`,
                    }}
                    initial={{ opacity: 1, scale: 0.2, rotate: Math.random() * 180, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 1.2, x: b.dx, y: b.dy, rotate: b.rot }}
                    transition={{ duration: 0.7 + Math.random() * 0.25, delay: i * 0.008, ease: 'easeOut' }}
                  />
                );
              }
              if (b.kind === 'chip') {
                return (
                  <motion.span
                    key={b.id}
                    className="absolute rounded-[2px]"
                    style={{
                      left: `${b.x}%`,
                      top: `${b.y}%`,
                      width: b.s,
                      height: b.s * 0.7,
                      background: b.c,
                      boxShadow: `0 0 10px ${b.c}`,
                    }}
                    initial={{ opacity: 1, scale: 0.3, rotate: 0, x: 0, y: 0 }}
                    animate={{ opacity: 0, scale: 1, x: b.dx, y: b.dy, rotate: b.rot }}
                    transition={{ duration: 0.85, delay: i * 0.01, ease: 'easeOut' }}
                  />
                );
              }
              return (
                <motion.span
                  key={b.id}
                  className="absolute rounded-full"
                  style={{
                    left: `${b.x}%`,
                    top: `${b.y}%`,
                    width: b.s,
                    height: b.s,
                    background: b.c,
                    boxShadow: `0 0 14px ${b.c}`,
                  }}
                  initial={{ opacity: 1, scale: 0.2, x: 0, y: 0 }}
                  animate={{ opacity: 0, scale: 1.15, x: b.dx, y: b.dy }}
                  transition={{ duration: 0.75 + Math.random() * 0.25, delay: i * 0.01, ease: 'easeOut' }}
                />
              );
            })}

            {label && (
              <motion.div
                className="absolute inset-x-0 top-[12%] flex justify-center"
                initial={{ opacity: 0, y: 12, scale: 0.85 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              >
                <span className="rounded-full border border-si/25 bg-white/85 px-4 py-1.5 font-display text-sm font-bold text-si-dim shadow-md backdrop-blur-sm">
                  {label}
                </span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
