import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Star, X, Zap } from 'lucide-react';
import { Die } from '../components/Die.tsx';
import { Button, Panel, cn } from '../components/ui.tsx';
import { useLang, useT } from '../i18n.ts';
import { run, type Heart } from './heart.ts';
import { social } from './social.ts';

const ROUNDS = 3;
export const POWER_MAX_STARS = ROUNDS * 3;

interface Goal {
  target: number[];
  /** 从当前开关状态出发，最少要拨几次 */
  par: number;
}

const toInt = (bits: number[]) => bits.reduce((v, b, i) => v | (b << i), 0);
const popcount = (v: number) => {
  let n = 0;
  for (let x = v; x; x &= x - 1) n++;
  return n;
};

function Stars({ n, max = 3, className }: { n: number; max?: number; className?: string }) {
  return (
    <span className={cn('inline-flex gap-0.5', className)}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} className={cn('size-4', i < n ? 'fill-gold text-gold' : 'text-line-2')} />
      ))}
    </span>
  );
}

/**
 * 通电玩耍：拨动输入引脚，让心脏电路的输出灯和目标一模一样。
 * 每一次拨动都真的把网表逐门算一遍，版图上能看到信号一路点亮过去。
 */
export function PowerUpGame({ heart, petName, onFinish, onClose }: {
  heart: Heart;
  petName: string;
  /** 三关打完后结算，返回要展示的奖励文案 */
  onFinish: (stars: number, max: number) => string;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  /** 真值表：每一种开关组合对应的输出 */
  const table = useMemo(
    () => Array.from({ length: 1 << heart.nIn }, (_, v) => run(heart, Array.from({ length: heart.nIn }, (_, i) => (v >> i) & 1)).out.join('')),
    [heart],
  );

  const pickGoal = (bits: number[], avoid?: string): Goal => {
    const cur = toInt(bits);
    const outs = [...new Set(table)].filter((o) => o !== table[cur] && o !== avoid);
    const t = outs[Math.floor(Math.random() * outs.length)] ?? table[cur]!;
    let par = heart.nIn;
    table.forEach((o, v) => { if (o === t) par = Math.min(par, popcount(v ^ cur)); });
    return { target: t.split('').map(Number), par };
  };

  const [bits, setBits] = useState<number[]>(() => new Array<number>(heart.nIn).fill(0));
  const [goal, setGoal] = useState<Goal>(() => pickGoal(new Array<number>(heart.nIn).fill(0)));
  const [round, setRound] = useState(0);
  const [flips, setFlips] = useState(0);
  const [stars, setStars] = useState<number[]>([]);
  const [phase, setPhase] = useState<'play' | 'solved' | 'done'>('play');
  const [summary, setSummary] = useState('');
  const timer = useRef<number>();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return () => window.clearTimeout(timer.current);
  }, []);

  const result = useMemo(() => run(heart, bits), [heart, bits]);
  const total = stars.reduce((s, v) => s + v, 0);
  /** 引脚多的大心脏，开关排两列 */
  const wide = heart.nIn > 6;

  const toggle = (i: number) => {
    if (phase !== 'play') return;
    const next = bits.map((b, k) => (k === i ? 1 - b : b));
    const n = flips + 1;
    setBits(next);
    setFlips(n);
    if (table[toInt(next)] !== goal.target.join('')) return;

    const got = n <= goal.par ? 3 : n <= goal.par + 2 ? 2 : 1;
    const all = [...stars, got];
    setStars(all);
    setPhase('solved');
    timer.current = window.setTimeout(() => {
      if (round + 1 >= ROUNDS) {
        // 三关打完立刻记任务，不依赖父组件养成结算是否成功
        social.completeQuest('power');
        setSummary(onFinish(all.reduce((s, v) => s + v, 0), POWER_MAX_STARS));
        setPhase('done');
        return;
      }
      setRound(round + 1);
      setGoal(pickGoal(next, goal.target.join('')));
      setFlips(0);
      setPhase('play');
    }, 1300);
  };

  return (
    <div ref={box}>
      <Panel
        title={t(`通电玩耍 · 「${petName}」的${heart.name}`, `Power Play · ${petName}'s ${heart.name}`)}
        icon={Zap}
        className="animate-rise"
        bodyClass="p-5"
        right={
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-mute">{t(`第 ${Math.min(round + 1, ROUNDS)}/${ROUNDS} 关`, `Level ${Math.min(round + 1, ROUNDS)}/${ROUNDS}`)}</span>
            <Stars n={total} max={POWER_MAX_STARS} />
            <button type="button" aria-label={t('关闭', 'Close')} onClick={onClose} className="text-faint transition-colors hover:text-ink"><X className="size-4" /></button>
          </div>
        }
      >
        {phase === 'done' ? (
          <div className="flex flex-col items-center py-6 text-center">
            <Stars n={total} max={POWER_MAX_STARS} className="[&_svg]:size-6" />
            <h3 className="mt-3 text-xl">{t('通电完成！', 'Powered up!')}{total >= POWER_MAX_STARS ? t('满星！', ' Perfect!') : ''}</h3>
            <p className="mt-1 text-sm text-mute">{summary}</p>
            <Button className="mt-5" onClick={onClose}>{t('好耶', 'Yay')}</Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-mute">
              {lang === 'zh'
                ? <>拨动左边的<b className="font-semibold text-copper-dim">引脚开关</b>，让右边亮的灯和<b className="font-semibold text-gold-dim">目标</b>一模一样。拨得越少，星星越多。</>
                : <>Flip the <b className="font-semibold text-copper-dim">pin switches</b> on the left until the lit lamps on the right match the <b className="font-semibold text-gold-dim">target</b> exactly. Fewer flips, more stars.</>}
            </p>

            <div className={cn('mt-4 grid items-center gap-4', wide ? 'md:grid-cols-[236px_1fr_150px]' : 'md:grid-cols-[150px_1fr_150px]')}>
              <div className={cn('grid grid-cols-3 gap-2', wide ? 'md:grid-cols-2' : 'md:grid-cols-1')}>
                {heart.inLabels.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={!!bits[i]}
                    aria-label={t(`引脚 ${label}：${bits[i] ? '开' : '关'}`, `pin ${label}: ${bits[i] ? 'on' : 'off'}`)}
                    className="pin-switch group flex items-center justify-between gap-2 rounded-2xl bg-panel-2/70 px-3 py-1.5 transition hover:bg-panel-2"
                  >
                    <span className="font-mono text-xs text-mute">{label}</span>
                    <span className={cn('relative h-6 w-11 rounded-full transition-colors duration-150', bits[i] ? 'bg-copper' : 'bg-line-2')}>
                      <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-150', bits[i] ? 'left-[22px]' : 'left-0.5')} />
                    </span>
                  </button>
                ))}
              </div>

              <div className="relative">
                <Die elements={heart.c.elements} nIn={heart.nIn} signals={result.signals} height={230} label={t(`${heart.name} · ${heart.gates} 门`, `${heart.name} · ${heart.gates} gates`)} />
                {phase === 'solved' && (
                  <div className="absolute inset-0 grid place-items-center rounded-xl bg-[#0b1512]/70 backdrop-blur-[2px]">
                    <div className="power-win flex flex-col items-center gap-2">
                      <Stars n={stars[stars.length - 1] ?? 0} className="[&_svg]:size-7" />
                      <span className="font-display text-lg font-bold text-white">{t('叮！灯全对上了', 'Ding! Every lamp matches')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-panel-2/70 px-3 py-2.5">
                <div className="grid grid-cols-[1fr_auto_auto_16px] items-center gap-x-3 gap-y-2 font-mono text-xs text-mute">
                  <span />
                  <span className="text-[10px] text-gold-dim">{t('目标', 'target')}</span>
                  <span className="text-[10px] text-si-dim">{t('现在', 'now')}</span>
                  <span />
                  {heart.outLabels.map((label, i) => {
                    const want = goal.target[i];
                    const got = result.out[i];
                    return (
                      <div key={label} className="contents">
                        <span>{label}</span>
                        <i className={cn('mx-auto block size-4 rounded-full ring-2 ring-gold/70', want ? 'bg-gold' : 'bg-transparent')} />
                        <i className={cn('mx-auto block size-4 rounded-full transition duration-200', got ? 'bg-[#35cdb4] shadow-[0_0_10px_rgb(53_205_180/0.9)]' : 'bg-line-2')} />
                        {want === got ? <Check className="size-3.5 text-si" /> : <span />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-faint">
              <span>{t(`已拨 ${flips} 次 · 最少 ${goal.par} 次能点亮`, `${flips} flips so far · solvable in ${goal.par}`)}</span>
              <span>{t(`每拨一下，${heart.gates} 个逻辑门都会重新算一遍`, `Every flip re-evaluates all ${heart.gates} logic gates`)}</span>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
