import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

/** 把 `/pet/1?x=1` 或 `pet/1` 规范成 pathname + search。 */
function normalize(to: string): { path: string; search: string; href: string } {
  const raw = to.startsWith('/') ? to : `/${to}`;
  const u = new URL(raw, 'http://local');
  const path = u.pathname || '/';
  const search = u.search;
  return { path, search, href: `${path}${search}` };
}

function parse(): Route {
  const path = window.location.pathname || '/';
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(window.location.search) };
}

/** 旧书签 `#/pet/1` → `/pet/1`，避免刷新丢路由。 */
function migrateHashOnce() {
  const h = window.location.hash;
  if (!h.startsWith('#/')) return;
  const next = h.slice(1);
  window.history.replaceState(null, '', next);
}

export function useRoute(): Route {
  const [r, setR] = useState(() => {
    migrateHashOnce();
    return parse();
  });
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return r;
}

export const go = (to: string) => {
  const { href } = normalize(to);
  if (`${window.location.pathname}${window.location.search}` === href) {
    window.scrollTo({ top: 0 });
    return;
  }
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { href } = normalize(to);
  return (
    <a
      href={href}
      {...rest}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(to);
      }}
    />
  );
}
