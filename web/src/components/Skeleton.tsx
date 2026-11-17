import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './ui.tsx';

/** 单块骨架：圆角灰底 + 扫光。 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-bone', className)} aria-hidden />;
}

/** 加载态抬头：转圈 + 文案，底下可挂骨架内容。 */
export function DataLoading({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)} role="status" aria-live="polite" aria-busy="true">
      {label != null && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-mute">
          <Loader2 className="size-4 shrink-0 animate-spin text-copper" />
          <span>{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function FeedRowSkeleton() {
  return (
    <div className="flex min-h-[4.75rem] items-center gap-3 px-5 py-4">
      <Skeleton className="size-9 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-[88%] rounded-md" />
        <Skeleton className="h-3 w-32 rounded-md" />
      </div>
      <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
    </div>
  );
}

export function FeedSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-line/70', className)}>
      {Array.from({ length: rows }, (_, i) => <FeedRowSkeleton key={i} />)}
    </div>
  );
}

export function PetCardSkeleton({ footer = true, className }: { footer?: boolean; className?: string }) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5', className)}>
      <div className="relative grid w-full place-items-center px-3 pt-6 pb-3">
        <Skeleton className="absolute top-2.5 left-3 h-3 w-8 rounded" />
        <Skeleton className="size-28 rounded-full" />
      </div>
      <div className="w-full px-4 pt-3 pb-3.5">
        <Skeleton className="h-5 w-24 rounded-md" />
        <Skeleton className="mt-2 h-3 w-36 rounded-md" />
        <div className="mt-2 flex gap-1">
          <Skeleton className="h-5 w-12 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
      {footer && (
        <div className="flex gap-2 px-4 pb-4">
          <Skeleton className="h-8 flex-1 rounded-xl" />
          <Skeleton className="h-8 flex-1 rounded-xl" />
        </div>
      )}
    </div>
  );
}

export function PetCardGridSkeleton({
  count = 6,
  cols = 'grid-cols-2 md:grid-cols-3',
  footer = true,
  className,
}: {
  count?: number;
  cols?: string;
  footer?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn('grid gap-4', cols, className)}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}><PetCardSkeleton footer={footer} /></li>
      ))}
    </ul>
  );
}

export function RankRowSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl px-3 py-2">
      <Skeleton className="size-7 shrink-0 rounded-full" />
      <Skeleton className="size-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24 rounded-md" />
        <Skeleton className="h-3 w-20 rounded-md" />
      </div>
      <Skeleton className="hidden h-1.5 w-28 rounded-full sm:block" />
      <Skeleton className="h-4 w-8 rounded-md" />
    </div>
  );
}

export function RankListSkeleton({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {Array.from({ length: rows }, (_, i) => <RankRowSkeleton key={i} />)}
    </div>
  );
}

export function StatBandSkeleton({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn(
      'grid gap-px overflow-hidden rounded-3xl border border-line/80 bg-line/70 shadow-sm shadow-si/5',
      cols === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2',
      className,
    )}>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className="flex min-w-0 items-center gap-3.5 bg-panel px-4 py-4 sm:px-5">
          <Skeleton className="size-11 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-14 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BountyCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-line/80 bg-panel p-5 shadow-sm shadow-si/5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-md" />
      </div>
      <Skeleton className="h-6 w-3/4 rounded-md" />
      <Skeleton className="h-3.5 w-full rounded-md" />
      <Skeleton className="h-3.5 w-2/3 rounded-md" />
      <div className="mt-2 flex gap-3">
        <Skeleton className="h-4 w-20 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
    </div>
  );
}

export function BountyGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))]', className)}>
      {Array.from({ length: count }, (_, i) => <BountyCardSkeleton key={i} />)}
    </div>
  );
}

export function LibraryCardSkeleton() {
  return (
    <div className="rounded-3xl border border-line/80 bg-panel p-5 shadow-sm shadow-si/5">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="h-3 w-24 rounded-md" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-4/5 rounded-md" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-20 rounded-xl" />
        <Skeleton className="h-8 w-16 rounded-xl" />
      </div>
    </div>
  );
}

export function LibraryGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, i) => <LibraryCardSkeleton key={i} />)}
    </div>
  );
}

export function BountyPageSkeleton() {
  return (
    <div className="min-w-0 w-full overflow-x-clip pb-16">
      <DataLoading label={undefined} className="pt-6">
        <div className="mb-4 flex items-center justify-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin text-copper" />
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="flex flex-col gap-5">
            <div>
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="mt-3 h-10 w-3/4 max-w-md rounded-lg" />
              <Skeleton className="mt-3 h-4 w-full max-w-xl rounded-md" />
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
              </div>
            </div>
            <div className="rounded-3xl border border-line/80 bg-panel p-5">
              <Skeleton className="h-5 w-24 rounded-md" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-line/80 bg-panel p-5">
              <Skeleton className="h-5 w-20 rounded-md" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </DataLoading>
    </div>
  );
}

export function PetPageSkeleton() {
  return (
    <div className={cn('mx-auto w-full min-w-0 max-w-[1180px] px-4 py-8 sm:px-7 sm:py-10')}>
      <DataLoading label={undefined}>
        <div className="mb-2 flex items-center justify-center gap-2 text-sm text-mute">
          <Loader2 className="size-4 animate-spin text-copper" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-line/80 bg-panel p-6">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <Skeleton className="size-36 shrink-0 rounded-full" />
                <div className="w-full flex-1 space-y-3">
                  <Skeleton className="h-8 w-40 rounded-lg" />
                  <Skeleton className="h-4 w-56 rounded-md" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full rounded-md" />
                  <Skeleton className="h-3 w-4/5 rounded-md" />
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-line/80 bg-panel p-5">
              <Skeleton className="h-5 w-24 rounded-md" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-2xl" />)}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-3xl border border-line/80 bg-panel p-5">
              <Skeleton className="h-5 w-20 rounded-md" />
              <div className="mt-4 space-y-3">
                <Skeleton className="h-3 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </DataLoading>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line/80', className)}>
      <div className="grid gap-3 border-b border-line/70 bg-panel-2/40 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }, (_, i) => <Skeleton key={i} className="h-3 rounded-md" />)}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="grid gap-3 border-b border-line/50 px-4 py-3.5 last:border-0" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className="h-3.5 rounded-md" />)}
        </div>
      ))}
    </div>
  );
}

export function PlazaSidebarSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-3xl border border-line/80 bg-panel shadow-sm shadow-si/5">
        <div className="border-b border-line/70 px-5 py-3.5">
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        <div className="flex items-center gap-3.5 p-5">
          <Skeleton className="size-14 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-28 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-line/80 bg-panel p-4 shadow-sm shadow-si/5">
        <Skeleton className="mb-3 h-4 w-20 rounded-md" />
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-1.5">
              <Skeleton className="size-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-24 rounded-md" />
                <Skeleton className="h-3 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
