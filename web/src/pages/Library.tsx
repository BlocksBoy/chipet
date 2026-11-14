import { useState } from 'react';
import { parseEther } from 'viem';
import { listComponents, tipComponent, type ComponentInfo } from '@tapearena/chain';
import { ArrowDownWideNarrow, BadgeCheck, BookOpen, Check, Copy, Cpu, Gift, Link2, PackageOpen, PenTool, User } from 'lucide-react';
import { useApp, useAsync } from '../state.tsx';
import { Link } from '../router.tsx';
import { short } from '../format.ts';
import { btn, Button, Empty, Loading, Panel, Select, Tag } from '../components/ui.tsx';

function useLine(c: ComponentInfo) {
  const ident = c.name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'C';
  return `use ${ident} = ${c.cpu}#${c.circuitId}`;
}

function Card({ c }: { c: ComponentInfo }) {
  const app = useApp();
  const line = useLine(c);
  const [copied, setCopied] = useState(false);
  const pins = (c.meta.inputs as { name: string; width: number }[] | undefined);
  const outs = (c.meta.outputs as { name: string; width: number }[] | undefined);
  const fmt = (ps?: { name: string; width: number }[]) => ps?.map((p) => p.name + (p.width > 1 ? `[${p.width}]` : '')).join(', ');

  return (
    <div className="flex animate-rise flex-col rounded-xl border border-line bg-panel p-5 transition-colors hover:border-copper-dim">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-copper/10 text-copper ring-1 ring-copper-dim"><Cpu className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-extrabold">{c.name}</div>
          <div className="truncate font-mono text-xs text-faint">{pins && outs ? `${fmt(pins)} → ${fmt(outs)}` : `${c.nIn} 入 → ${c.nOut} 出`}</div>
        </div>
        {c.verifiedBounty >= 0 && (
          <Link to={`/bounty/${c.verifiedBounty}`} className="no-underline"><Tag tone="gold" icon={BadgeCheck}>擂台 #{c.verifiedBounty} 冠军</Tag></Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line">
        <div className="bg-substrate/70 px-3 py-2">
          <div className="font-mono text-[11px] text-faint">门数</div>
          <div className="font-display text-xl font-extrabold text-copper-hi tabular-nums">{c.gateCount}</div>
        </div>
        <div className="bg-substrate/70 px-3 py-2">
          <div className="flex items-center gap-1 font-mono text-[11px] text-faint"><Link2 className="size-3" />被引用</div>
          <div className="font-display text-xl font-extrabold text-si tabular-nums">{c.uses}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1 font-mono text-xs text-faint">
        <span className="flex items-center gap-1.5"><Cpu className="size-3.5" />{short(c.cpu)} #{c.circuitId.toString()}</span>
        <span className="flex items-center gap-1.5"><User className="size-3.5" />{short(c.registrant)}</span>
      </div>

      <code className="mt-3 block truncate rounded-lg bg-substrate px-3 py-2 text-xs ring-1 ring-line" title={line}>{line}</code>

      <div className="mt-4 flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" icon={copied ? Check : Copy}
          onClick={() => { navigator.clipboard.writeText(line); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? '已复制' : '复制 use'}
        </Button>
        <Button variant="ghost" size="sm" icon={Gift}
          onClick={() => app.run('打赏', async (st) => tipComponent(await app.signer(), app.deployment!.library!, c.key, parseEther('0.01'), st))}>
          打赏 0.01
        </Button>
      </div>
    </div>
  );
}

export function Library() {
  const { pub, deployment } = useApp();
  const q = useAsync(() => (deployment?.library ? listComponents(pub, deployment.library) : Promise.resolve(null)), [pub, deployment]);
  const [sort, setSort] = useState<'uses' | 'gates' | 'new'>('uses');
  const list = [...(q.data ?? [])].sort((a, b) =>
    sort === 'uses' ? b.uses - a.uses : sort === 'gates' ? a.gateCount - b.gateCount : b.registeredAt - a.registeredAt);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-8 pb-16 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2.5 text-[28px]"><BookOpen className="size-6 text-copper" />组件库</h2>
          <p className="mt-2 mb-0 max-w-[720px] text-pretty text-mute">
            每个组件都是一枚已流片电路。在 HDL 里写一行 <code>use</code> 就能把它当黑盒复用（链上 REF，不用重新烧晶体管）。
            谁的作品赢了擂台，它引用的组件的当前持有人按比例自动分到奖金。
          </p>
        </div>
        <Select aria-label="排序" icon={ArrowDownWideNarrow} className="w-48" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="uses">按被引用次数</option>
          <option value="gates">按门数</option>
          <option value="new">按登记时间</option>
        </Select>
      </div>
      {!deployment?.library
        ? <Panel><Empty icon={PackageOpen} title="这条链上还没有部署组件库" /></Panel>
        : q.loading && !q.data ? <Loading>读取组件…</Loading>
        : list.length === 0
          ? <Panel><Empty icon={PackageOpen} title="还没有组件" action={<Link to="/studio" className={btn()}><PenTool />去设计器流片</Link>}>在设计器里流片后点「登记为组件」，或者赢一场擂台自动入库。</Empty></Panel>
          : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((c) => <Card key={c.key} c={c} />)}</div>}
    </div>
  );
}
