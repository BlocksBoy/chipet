#!/usr/bin/env node
/** 本地一键起 API + 前端，避免只跑 Vite 时登录代理成 HTTP 500。 */
import { spawn } from 'node:child_process';

const kids = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit', shell: true }),
];

let exiting = false;
function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const p of kids) {
    try { p.kill('SIGTERM'); } catch { /* ignore */ }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const p of kids) {
  p.on('exit', (code, signal) => {
    if (exiting) return;
    if (signal) shutdown(1);
    if (code && code !== 0) shutdown(code);
  });
}
