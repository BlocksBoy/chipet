import { useEffect, useState } from 'react';
import type { Resolved } from '@tapearena/netlist';
import { Die } from '../components/Die.tsx';
import { run } from './heart.ts';

/** 一直在跳动的芯片版图：每隔一会儿喂一组随机输入，信号沿着逻辑门一路点亮。 */
export function LiveDie({ circuit, label, height = 220 }: {
  circuit: { c: Resolved; nOut: number };
  label: string;
  height?: number;
}) {
  const [signals, setSignals] = useState<Uint8Array>();
  useEffect(() => {
    const beat = () => {
      const bits = Array.from({ length: circuit.c.nIn }, () => (Math.random() < 0.5 ? 1 : 0));
      setSignals(run(circuit, bits).signals);
    };
    beat();
    const t = window.setInterval(beat, 1800);
    return () => window.clearInterval(t);
  }, [circuit]);
  return <Die elements={circuit.c.elements} nIn={circuit.c.nIn} signals={signals} height={height} label={label} />;
}
