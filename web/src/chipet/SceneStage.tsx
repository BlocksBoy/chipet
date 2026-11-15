import type { ReactNode } from 'react';
import { cn } from '../components/ui.tsx';

type Props = {
  children: ReactNode;
  className?: string;
  hint?: string;
  /** 纯色粉彩底卡；换猫时平滑过渡 */
  bg?: string;
};

/** 加密猫式展示台：一块纯色粉彩底卡，角色居中。 */
export function SceneStage({ children, className, hint, bg = '#fbd9f3' }: Props) {
  return (
    <div className={cn('relative mx-auto w-full', className)}>
      <div
        className="relative z-[1] aspect-square overflow-hidden rounded-[1.75rem] transition-[background-color] duration-700 ease-out"
        style={{
          backgroundColor: bg,
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.6), 0 10px 28px rgb(120 90 110 / 0.16)',
        }}
      >
        {children}
      </div>

      {hint && (
        <p className="pointer-events-none relative z-[1] mt-2 text-center text-[11px] text-faint">
          {hint}
        </p>
      )}
    </div>
  );
}
