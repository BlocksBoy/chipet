import { CHAINS, DEPLOYMENTS } from '@tapearena/chain';

// `vite build --mode deweb`：发布到 X Layer 链上网站。链上网站的网关默认拦截节点以外的链下请求，所以只连主网、不连后端。
export const DEWEB = import.meta.env.MODE === 'deweb';

export const CHAIN_IDS = Object.keys(CHAINS).map(Number).filter((id) => id === 196 || (!DEWEB && DEPLOYMENTS[id]));
