# Chipet · 芯宠

TapeOut 黑客松项目：每只芯宠绑定一枚链上电路身份。可在浏览器本地演示，也可在 **X Layer** / **BSC** 连接钱包，走链上孵化、喂食与玩耍。

线上站点：[chipet.web3book.io](https://chipet.web3book.io)

## 功能概览

- **家园**：起名敲蛋孵化芯宠；稀有度与外观由电路身份派生
- **养成**：喂食 / 通电玩耍（链上有冷却）；对战与社交可本地玩
- **实验室**：TapeOut 电路悬赏与设计器（依赖对应链是否部署 TapeArena）
- **BEM 商店**：演示经济；X Layer / BSC 按当前网络读真实 BEM 并支付（非 Chipet 托管）

## 已部署合约

当前主网 **hatchPrice = 0**（免费孵化）。付款精确匹配 `msg.value == hatchPrice`，少付 / 多付都会 revert。

| 链 | Chain ID | Chipet | Factory | 模板 CPU |
|---|---|---|---|---|
| X Layer | 196 | [`0xEB13…F710`](https://www.oklink.com/xlayer/address/0xEB13A939cfD7d69C73f52f4EA23E5CECF880F710) | `0x1f09…0761` | `0x839b…574e` |
| BSC | 56 | [`0x17be…67F4`](https://bscscan.com/address/0x17be584c6D69Ab652fc9DdDa201042c6374667F4) | `0x6822…F7e2` | Genesis `0x50A9…9DD9` |

完整地址见 `packages/chain/src/deployments.json`。

## 本地开发

```bash
npm ci
npm run dev          # web → http://localhost:5288
npm run build:web    # 产出 web/dist
```

合约（需 [Foundry](https://book.getfoundry.sh/)）：

```bash
cd contracts
cp .env.example .env   # 填 X_LAYER_PRIVATE_KEY / BSC_PRIVATE_KEY，勿提交
forge test                           # 本地套件
FORK=1 forge test --match-test fork_ # 含主网 fork / 已部署核对
```

部署脚本（主网广播，谨慎使用）：

```bash
cd contracts
HATCH_PRICE=0 ./script/deploy-chipet-xlayer.sh
HATCH_PRICE=0 ./script/deploy-chipet-bsc.sh
# 然后：npx tsx scripts/sync-deployments.ts
```

## 仓库结构

```
web/                 前端（Vite + React，History 路由）
packages/chain/      ABI、读写 SDK、部署登记
packages/netlist/    网表 / HDL 工具
contracts/           Chipet、TapeArena、Foundry 测试与脚本
server/              可选后端（AI / 本地辅助）
deploy/              弗吉尼亚静态站部署脚本（chipet.web3book.io）
```

## 安全说明（资金相关）

- Chipet 孵化：`nonReentrant`；国库收款失败则整笔回滚；合约不截留原生币
- 仅 owner 可改 `hatchPrice` / `treasury` / 模板
- **运维注意**：收费前务必保证 `treasury != address(0)`，否则付款可能被烧掉
- BEM 商店是 ERC-20 转账 + 前端发货，与 Chipet 合约托管无关
- 私钥只放 `contracts/.env`（已 gitignore）

## License

MIT
