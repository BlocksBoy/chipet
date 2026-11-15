import { CHAINS, DEPLOYMENTS, MAINNET_IDS } from '@tapearena/chain';

// `vite build --mode deweb`：发布到 X Layer 链上网站。链上网站的网关默认拦截节点以外的链下请求，所以只连主网、不连后端。
export const DEWEB = import.meta.env.MODE === 'deweb';

/** 选择器里的网络：X Layer、BSC 两条主网始终可选；本地 fork 有部署记录才出现。链上网站（deweb）只能连 X Layer 节点。 */
export const CHAIN_IDS = [
  ...MAINNET_IDS.filter((id) => !DEWEB || id === 196),
  ...Object.keys(CHAINS).map(Number).filter((id) => !MAINNET_IDS.includes(id) && !DEWEB && DEPLOYMENTS[id]),
];
