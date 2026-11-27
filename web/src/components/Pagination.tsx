import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './ui.tsx';
import { useT } from '../i18n.ts';

/** 页码窗口：当前页附近若干号，两端保留首尾 */
export function pageWindow(current: number, total: number, radius = 2): (number | '…')[] {
  if (total <= 1) return total === 1 ? [1] : [];
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, total]);
  for (let i = current - radius; i <= current + radius; i++) {
    if (i >= 1 && i <= total) set.add(i);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - sorted[i - 1]! > 1) out.push('…');
    out.push(n);
  }
  return out;
}

/** 广场动态同款分页条：页码胶囊 + 上一页 / 下一页（窄屏只显示箭头，避免挤扁） */
export function PaginationBar({
  page,
  pages,
  onChange,
  className,
  label,
  hideWhenSingle = true,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  className?: string;
  /** aria-label，默认「分页」 */
  label?: string;
  /** 仅一页时是否隐藏，默认隐藏 */
  hideWhenSingle?: boolean;
}) {
  const t = useT();
  if (hideWhenSingle && pages <= 1) return null;
  const safePages = Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), safePages);
  // 窄屏少露几个页码，给箭头留位
  const windowItems = pageWindow(safePage, safePages, 1);

  return (
    <nav
      aria-label={label ?? t('分页', 'Pagination')}
      className={cn(
        'flex flex-col gap-2 border-t border-line/70 bg-substrate/40 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 sm:px-4',
        className,
      )}
    >
      <span className="font-mono text-[11px] tabular-nums text-faint sm:mr-auto">
        {t(`第 ${safePage} / ${safePages} 页`, `Page ${safePage} / ${safePages}`)}
      </span>
      <div className="flex w-full min-w-0 items-center justify-between gap-1 rounded-full bg-panel p-1 shadow-sm ring-1 ring-line/80 sm:inline-flex sm:w-auto sm:justify-start sm:gap-0.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onChange(Math.max(1, safePage - 1))}
          aria-label={t('上一页', 'Previous page')}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold text-mute transition enabled:hover:bg-panel-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 sm:h-8"
        >
          <ChevronLeft className="size-4 shrink-0 sm:size-3.5" />
          <span className="hidden sm:inline">{t('上一页', 'Prev')}</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-none">
          {windowItems.map((item, i) => (
            item === '…' ? (
              <span key={`e${i}`} className="grid size-8 shrink-0 place-items-center font-mono text-xs text-faint" aria-hidden>…</span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={t(`第 ${item} 页`, `Page ${item}`)}
                aria-current={item === safePage ? 'page' : undefined}
                onClick={() => onChange(item)}
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full font-mono text-[12px] tabular-nums transition',
                  item === safePage
                    ? 'bg-copper font-bold text-white shadow-sm shadow-copper/30'
                    : 'text-mute hover:bg-panel-2 hover:text-ink',
                )}
              >
                {item}
              </button>
            )
          ))}
        </div>
        <button
          type="button"
          disabled={safePage >= safePages}
          onClick={() => onChange(Math.min(safePages, safePage + 1))}
          aria-label={t('下一页', 'Next page')}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold text-mute transition enabled:hover:bg-panel-2 enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 sm:h-8"
        >
          <span className="hidden sm:inline">{t('下一页', 'Next')}</span>
          <ChevronRight className="size-4 shrink-0 sm:size-3.5" />
        </button>
      </div>
    </nav>
  );
}
