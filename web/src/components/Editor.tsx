import { useRef, type KeyboardEvent } from 'react';

export function Editor({ value, onChange, errLine }: { value: string; onChange: (v: string) => void; errLine?: number }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const lines = value.split('\n').length;

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t } = el;
    const next = value.slice(0, s) + '  ' + value.slice(t);
    onChange(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
  };

  return (
    <div className="editor" onClick={() => ta.current?.focus()}>
      <div className="gutter">
        {Array.from({ length: lines }, (_, i) => <div key={i} className={errLine === i + 1 ? 'err' : undefined}>{i + 1}</div>)}
      </div>
      <textarea ref={ta} value={value} spellCheck={false} onKeyDown={onKey} rows={lines + 1}
        onChange={(e) => onChange(e.target.value)} aria-label="TapeHDL 源码" />
    </div>
  );
}
