// AI 设计需要后端（持有模型密钥）；其余功能全部在浏览器里直接读链完成。

import { DEWEB } from './env.ts';
import { tr } from './i18n.ts';

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface AiEvent {
  type: 'attempt' | 'best' | 'done' | 'error';
  round?: number;
  phase?: 'correct' | 'optimize';
  code?: string | null;
  ok?: boolean;
  gateCount?: number;
  feedback?: string;
  message?: string;
  best?: { code: string; gateCount: number } | null;
}

export async function aiAvailable(): Promise<boolean> {
  if (DEWEB && !BASE) return false;
  try {
    const r = await fetch(`${BASE}/api/health`);
    return r.ok && Boolean((await r.json()).ai);
  } catch {
    return false;
  }
}

export async function aiDesign(body: Record<string, unknown>, onEvent: (e: AiEvent) => void, signal?: AbortSignal) {
  const r = await fetch(`${BASE}/api/ai/design`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? tr(`AI 服务返回 ${r.status}`, `AI service returned ${r.status}`));
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (data) onEvent(JSON.parse(data));
    }
  }
}
