import { formatUnits, zeroAddress, type Address } from 'viem';
import { both, tr, txt } from './i18n.ts';

export const short = (a?: string, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : '');

export function amount(v: bigint, token: Address = zeroAddress, decimals = 18): string {
  const s = Number(formatUnits(v, decimals));
  const txt = s >= 100 ? s.toFixed(0) : s >= 1 ? s.toFixed(2) : s.toPrecision(3);
  return `${txt.replace(/\.?0+$/, '') || '0'}`;
}

/** 奖金单位：原生币用当前链的符号（X Layer 是 OKB，BSC 是 BNB）。 */
export const unit = (token: Address = zeroAddress, native = 'OKB') => (token === zeroAddress ? native : 'TOKEN');

export function left(ts: number, now = Date.now() / 1000): string {
  let d = Math.max(0, Math.floor(ts - now));
  if (d === 0) return tr('已到期', 'ended');
  const day = Math.floor(d / 86400); d -= day * 86400;
  const h = Math.floor(d / 3600); d -= h * 3600;
  const m = Math.floor(d / 60);
  if (day) return tr(`${day} 天 ${h} 小时`, `${day}d ${h}h`);
  if (h) return tr(`${h} 小时 ${m} 分`, `${h}h ${m}m`);
  return tr(`${m} 分钟`, `${m} min`);
}

const PHASE = {
  open: both('开放提交', 'Open'),
  challenge: both('挑战期', 'Challenge'),
  settle: both('待结算', 'To settle'),
  finalized: both('已结算', 'Settled'),
} as const;
export const phaseText = (p: keyof typeof PHASE) => txt(PHASE[p]);

export function errMsg(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; cause?: { reason?: string; data?: { errorName?: string } } };
  const name = any?.cause?.data?.errorName;
  const known: Record<string, string> = {
    VectorFailed: tr('测试向量未通过', 'Test vectors failed'),
    NotCircuitOwner: tr('你不是这枚电路的持有人', "You don't own this circuit"),
    PinMismatch: tr('引脚数量不符', 'Pin count mismatch'),
    HasState: tr('电路含寄存器', 'The circuit contains registers'),
    TooManyGates: tr('门数超过上限', 'Gate count exceeds the limit'),
    Closed: tr('已截止或已结算', 'Already closed or settled'),
    AlreadySubmitted: tr('这枚电路已经提交过', 'This circuit was already submitted'),
    BadBond: tr('保证金金额不对', 'Wrong bond amount'),
    NotDifferent: tr('这个输入下与参考电路一致，挑战不成立', 'Same output as the reference for this input, so the challenge fails'),
    NotYet: tr('还没到结算时间', 'Not time to settle yet'),
    NotCPU: tr('不是 TapeOut 官方处理器', 'Not an official TapeOut processor'),
    BadParams: tr('参数不合法', 'Invalid parameters'),
  };
  if (name && known[name]) return known[name];
  return any?.shortMessage ?? any?.cause?.reason ?? any?.message ?? String(e);
}
