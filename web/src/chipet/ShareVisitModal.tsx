import { useEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { Check, Copy, Download, Loader2, X } from 'lucide-react';
import { Button, Tag, Trait, cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { PetAvatar } from './PetAvatar.tsx';
import { cattributes, phenotypeOf, typeLabel } from './phenotype.ts';
import { rarityTone } from './PetCard.tsx';
import type { PublicPet } from './social.ts';

async function qrDataUrl(url: string): Promise<string> {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(url)}`;
  const res = await fetch(src);
  if (!res.ok) throw new Error('qr');
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function downloadPng(dataUrl: string, name: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  a.click();
}

export function ShareVisitModal({
  pet, url, open, onClose,
}: {
  pet: PublicPet;
  url: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  const [qrFor, setQrFor] = useState('');
  const [qrErr, setQrErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fetchedUrl = useRef('');

  const ph = phenotypeOf(pet.cpu, pet.circuitId, pet.rarity);
  const traits = cattributes(ph);
  const fileName = `chipet-${pet.name.replace(/[^\w\u4e00-\u9fff-]+/g, '').slice(0, 20) || 'share'}.png`;

  // 同一条链接只拉一次二维码，避免弹框打开期间反复刷新
  useEffect(() => {
    if (!open || !url) return;
    if (fetchedUrl.current === url) return;
    fetchedUrl.current = url;
    let alive = true;
    setQrErr(false);
    qrDataUrl(url)
      .then((d) => {
        if (!alive) return;
        setQr(d);
        setQrFor(url);
      })
      .catch(() => {
        if (!alive) return;
        fetchedUrl.current = '';
        setQrErr(true);
      });
    return () => { alive = false; };
  }, [open, url]);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setSaved(false);
    setSaving(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    const el = cardRef.current;
    if (!el || saving || !qr) return;
    setSaving(true);
    try {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      const dataUrl = await toPng(el, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: ph.bg,
      });
      downloadPng(dataUrl, fileName);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const qrReady = qrFor === url ? qr : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1a2e28]/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-labelledby="share-visit-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] animate-rise overflow-hidden rounded-[1.75rem] border border-line bg-panel shadow-2xl shadow-si/20"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
          <h2 id="share-visit-title" className="text-sm font-semibold text-ink">
            {t('分享撸猫卡片', 'Share petting card')}
          </h2>
          <button type="button" aria-label={t('关闭', 'Close')} onClick={onClose}
            className="rounded-lg p-1.5 text-faint transition-colors hover:bg-panel-2 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-[1.35rem]"
            style={{ backgroundColor: ph.bg }}
          >
            <div className="pointer-events-none absolute top-4 left-[30%] size-40 -translate-x-1/2 rounded-full bg-white/55" />

            <div className="relative px-4 pt-4 pb-4">
              <div className="mb-3 flex items-center gap-1.5 font-display text-[11px] font-bold text-ink/55">
                <span className="size-1.5 rounded-full bg-copper" />
                Chipet
              </div>

              <div className="flex items-center gap-3">
                <div className="grid size-[112px] shrink-0 place-items-center">
                  <PetAvatar
                    cpu={pet.cpu}
                    circuitId={pet.circuitId}
                    rarity={pet.rarity}
                    mood={pet.mood}
                    size={108}
                    lively={false}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-display text-xl leading-tight font-bold text-ink">{pet.name}</h3>
                    <Tag tone={rarityTone(pet.rarity)}>{typeLabel(pet.rarity)}</Tag>
                  </div>
                  <p className="mt-1 text-[12px] text-ink/60">
                    {ph.species} · {ph.vibe}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {traits.map((g) => (
                      <Trait key={g.id} label={g.label} value={g.value} className="bg-white/85" />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/80 p-2.5 ring-1 ring-white/60">
                <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm">
                  {qrReady ? (
                    <img
                      src={qrReady}
                      alt={t('撸猫链接二维码', 'Petting link QR code')}
                      width={96}
                      height={96}
                      className="block size-24"
                      draggable={false}
                    />
                  ) : (
                    <div className="grid size-24 place-items-center text-[11px] text-mute">
                      {qrErr ? t('加载失败', 'Failed') : <Loader2 className="size-4 animate-spin text-copper" />}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[15px] font-bold text-ink">
                    {t('扫码来撸猫', 'Scan to pet')}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-pretty text-ink/55">
                    {t('打开就能摸摸这只芯喵。', 'Open the link and give this Chipet a pat.')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 border-t border-line px-4 pt-3 pb-4">
          <div className="flex items-center gap-2">
            <code className={cn('min-w-0 flex-1 truncate rounded-xl bg-substrate px-3 py-2.5 font-mono text-[12px] leading-none text-ink ring-1 ring-line')}>
              {url}
            </code>
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy} className="shrink-0 self-center">
              {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
            </Button>
          </div>

          <Button
            className="w-full"
            icon={saved ? Check : Download}
            busy={saving}
            disabled={!qrReady || saving}
            onClick={save}
          >
            {saving
              ? t('生成中…', 'Saving…')
              : saved
                ? t('已保存图片', 'Image saved')
                : t('保存图片分享', 'Save image to share')}
          </Button>
        </div>
      </div>
    </div>
  );
}
