import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '../components/ui.tsx';
import { useT } from '../i18n.ts';
import { getSoundRev, isSoundOn, setSoundOn, subscribeSound } from './sound.ts';

export function useSoundOn() {
  useSyncExternalStore(subscribeSound, getSoundRev, getSoundRev);
  return isSoundOn();
}

/** 声音开关；tone="glass" 用在深色画面上 */
export function SoundToggle({ tone = 'panel', className }: { tone?: 'panel' | 'glass'; className?: string }) {
  const t = useT();
  const on = useSoundOn();
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      onClick={() => setSoundOn(!on)}
      aria-pressed={on}
      aria-label={on ? t('关闭声音', 'Mute') : t('打开声音', 'Unmute')}
      title={on ? t('关闭声音', 'Mute') : t('打开声音', 'Unmute')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition active:scale-[0.96]',
        tone === 'glass'
          ? 'bg-black/35 text-white backdrop-blur-sm hover:bg-black/45'
          : 'border border-line bg-panel text-mute hover:border-si/50 hover:text-ink',
        className,
      )}
    >
      <Icon className="size-3.5" />
      {on ? t('声音开', 'Sound on') : t('静音', 'Muted')}
    </button>
  );
}
