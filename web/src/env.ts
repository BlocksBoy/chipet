import { CHAINS, DEPLOYMENTS, MAINNET_IDS } from '@tapearena/chain';

// `vite build --mode deweb`：发布到 X Layer 链上网站。链上网站的网关默认拦截节点以外的链下请求，所以只连主网、不连后端。
export const DEWEB = import.meta.env.MODE === 'deweb';

/**
 * 对用户前端隐藏的主网（选择器 / wagmi 链列表不出现）。
 * packages/chain 的 MAINNET_IDS 与服务端 Admin 扫链逻辑仍保留这些链。
 */
export const HIDDEN_MAINNET_IDS: readonly number[] = [56]; // BSC 暂不对玩家开放

/** 选择器里的网络：可见主网 +（非 deweb）有部署记录的本地 fork。链上网站只能连 X Layer。 */
export const CHAIN_IDS = [
  ...MAINNET_IDS.filter((id) => !HIDDEN_MAINNET_IDS.includes(id) && (!DEWEB || id === 196)),
  ...Object.keys(CHAINS).map(Number).filter((id) => !MAINNET_IDS.includes(id) && !DEWEB && DEPLOYMENTS[id]),
];
