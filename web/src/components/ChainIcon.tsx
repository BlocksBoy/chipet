import { Terminal } from 'lucide-react';
import { cn } from './ui.tsx';

/** X Layer 标志：五个方块排成 X，右侧两道渐淡的「层」。 */
function XLayerMark() {
  const sq = (x: number, y: number) => <rect key={`${x},${y}`} x={x} y={y} width="4.67" height="4.67" rx=".31" />;
  return (
    <svg viewBox="0 0 24 24" className="size-full" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#000" />
      <g fill="#fff" transform="translate(12 12) scale(.76) translate(-12 -12)">
        {[[3, 4.99], [12.34, 4.99], [7.69, 9.67], [3, 14.33], [12.34, 14.33]].map(([x, y]) => sq(x!, y!))}
        <g fillOpacity=".55">
          <path d="M17.82 4.99h1.27c.17 0 .31.14.31.31v4.05c0 .17-.14.31-.31.31h-1.27zM17.82 14.34h1.27c.17 0 .31.14.31.31v4.05c0 .17-.14.31-.31.31h-1.27z" />
        </g>
        <g fillOpacity=".32">
          <path d="M20.21 4.99h.48c.17 0 .31.14.31.31v4.05c0 .17-.14.31-.31.31h-.48zM20.21 14.34h.48c.17 0 .31.14.31.31v4.05c0 .17-.14.31-.31.31h-.48z" />
        </g>
      </g>
    </svg>
  );
}

/** BNB Chain 标志：黄底白色立方体。 */
function BscMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-full" aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#F0B90B" />
      <path
        fill="#fff" transform="translate(12 12) scale(.74) translate(-12 -12)"
        d="M7.09 5.755 12 3l4.91 2.755-1.8 1.02L12 5.035l-3.105 1.74L7.09 5.755Zm9.82 3.48-1.8-1.02L12 9.955l-3.105-1.74-1.805 1.02v2.035l3.1 1.74v3.475L12 17.505l1.805-1.02V13.01l3.105-1.74V9.235Zm0 5.515v-2.04l-1.8 1.02v2.035l1.8-1.015Zm1.285.72-3.105 1.735v2.04L20 16.485v-5.51l-1.805 1.015v3.48ZM16.39 7.495l1.8 1.02v2.035L20 9.535v-2.04l-1.805-1.02-1.805 1.025v-.005Zm-6.2 10.45v2.035L12 21l1.805-1.02v-2.03L12 18.965l-1.805-1.02h-.005Zm-3.1-3.2 1.8 1.02V13.73l-1.8-1.02v2.04-.005Zm3.1-7.25L12 8.515l1.805-1.02L12 6.475l-1.805 1.025-.005-.005ZM5.805 8.515 7.61 7.495l-1.8-1.02L4 7.5v2.04l1.805 1.015V8.515Zm0 3.475L4 10.975v5.51l4.91 2.76V17.2l-3.1-1.735v-3.48l-.005.005Z"
      />
    </svg>
  );
}

/** 网络图标。认不出的链（本地 fork）用一个终端图标。 */
export function ChainIcon({ id, className = 'size-5' }: { id: number; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full', className)}>
      {id === 196 ? <XLayerMark />
        : id === 56 ? <BscMark />
        : <span className="grid size-full place-items-center bg-mute text-white"><Terminal className="size-[62%]" strokeWidth={2.4} /></span>}
    </span>
  );
}
