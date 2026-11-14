import { formatUnits, zeroAddress, type Address } from 'viem';

export const short = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : '');

export function amount(v: bigint, token: Address = zeroAddress, decimals = 18): string {
  const s = Number(formatUnits(v, decimals));
  const txt = s >= 100 ? s.toFixed(0) : s >= 1 ? s.toFixed(2) : s.toPrecision(3);
  return `${txt.replace(/\.?0+$/, '') || '0'}`;
}

export const unit = (token: Address = zeroAddress) => (token === zeroAddress ? 'OKB' : 'TOKEN');

export function left(ts: number, now = Date.now() / 1000): string {
  let d = Math.max(0, Math.floor(ts - now));
  if (d === 0) return '已到期';
  const day = Math.floor(d / 86400); d -= day * 86400;
  const h = Math.floor(d / 3600); d -= h * 3600;
  const m = Math.floor(d / 60);
  if (day) return `${day} 天 ${h} 小时`;
  if (h) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}

export const PHASE_TEXT = { open: '开放提交', challenge: '挑战期', settle: '待结算', finalized: '已结算' } as const;

export function errMsg(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; cause?: { reason?: string; data?: { errorName?: string } } };
  const name = any?.cause?.data?.errorName;
  const known: Record<string, string> = {
    VectorFailed: '测试向量未通过', NotCircuitOwner: '你不是这枚电路的持有人', PinMismatch: '引脚数量不符', HasState: '电路含寄存器',
    TooManyGates: '门数超过上限', Closed: '已截止或已结算', AlreadySubmitted: '这枚电路已经提交过', BadBond: '保证金金额不对',
    NotDifferent: '这个输入下与参考电路一致，挑战不成立', NotYet: '还没到结算时间', NotCPU: '不是 TapeOut 官方处理器', BadParams: '参数不合法',
  };
  if (name && known[name]) return known[name];
  return any?.shortMessage ?? any?.cause?.reason ?? any?.message ?? String(e);
}
