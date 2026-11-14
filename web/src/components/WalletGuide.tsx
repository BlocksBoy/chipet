import { useEffect, useState } from 'react';
import { Download, ExternalLink, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import { GUIDE_WALLETS, type GuideWallet } from '../wallet.tsx';
import { Button } from './ui.tsx';

const STEPS = ['安装钱包插件', '创建或导入钱包', '回到这里刷新页面'];

function Tile({ w }: { w: GuideWallet }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { let live = true; w.icon().then((s) => live && setSrc(s)).catch(() => {}); return () => { live = false; }; }, [w]);
  return (
    <a href={w.url} target="_blank" rel="noreferrer"
      className="group relative flex flex-col items-center gap-2 rounded-xl border border-line bg-substrate/60 px-2 pt-4 pb-3 text-center no-underline transition hover:border-copper-dim hover:bg-panel-2">
      <ExternalLink className="absolute top-2 right-2 size-3 text-faint opacity-0 transition group-hover:opacity-100" />
      <span className="grid size-10 place-items-center overflow-hidden rounded-[10px]" style={{ background: w.background }}>
        {src ? <img src={src} alt="" className="size-10" /> : <Wallet className="size-5 text-mute" />}
      </span>
      <span className="text-[13px] font-semibold text-ink">{w.name}</span>
      <span className="text-[11px] leading-snug text-faint">{w.note}</span>
    </a>
  );
}

export function WalletGuide({ open, onClose }: { open: boolean; onClose(): void }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal aria-labelledby="wallet-guide-title" onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[500px] animate-rise rounded-2xl border border-line bg-panel shadow-2xl shadow-black/60">
        <div className="flex items-start gap-3 border-b border-line px-6 pt-6 pb-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-copper/10 ring-1 ring-copper-dim"><Download className="size-5 text-copper" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="wallet-guide-title" className="text-lg font-bold text-ink">还没有检测到钱包</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-mute">在 TapeArena 发悬赏、提交电路都要用浏览器插件钱包签名。选一个装上，几分钟就好。</p>
          </div>
          <button type="button" aria-label="关闭" onClick={onClose} className="rounded-lg p-1 text-faint transition-colors hover:bg-panel-2 hover:text-ink"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-3 gap-2.5 px-6 pt-5">
          {GUIDE_WALLETS.map((w) => <Tile key={w.id} w={w} />)}
        </div>

        <ol className="mx-6 mt-5 flex items-center gap-2 rounded-xl bg-substrate/60 px-4 py-3 text-xs text-mute ring-1 ring-line">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-panel-2 font-mono text-[11px] text-copper ring-1 ring-line-2">{i + 1}</span>
              <span className="leading-tight">{s}</span>
            </li>
          ))}
        </ol>

        <p className="mx-6 mt-3 flex items-center gap-1.5 text-[11px] text-faint">
          <ShieldCheck className="size-3.5 text-si" />只从官网或浏览器官方应用商店安装；助记词不要告诉任何人。
        </p>

        <div className="mt-5 flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onClose}>稍后再说</Button>
          <Button size="sm" icon={RefreshCw} onClick={() => location.reload()}>我已安装，刷新页面</Button>
        </div>
      </div>
    </div>
  );
}
