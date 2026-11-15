// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Chipet} from "../src/Chipet.sol";
import {ICPU} from "../src/interfaces/ITapeOut.sol";

interface IFactory {
    function isCPU(address) external view returns (bool);
    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
    function cpuAt(uint256 i) external view returns (address);
    function createCPU(string calldata, string calldata, string calldata, uint256, uint256)
        external
        returns (address transistorsAddr, address circuitsAddr);
}

interface ITransistors {
    function BEM() external view returns (address);
    function mint(uint256 id, uint256 amount) external;
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

interface ICircuits {
    function transistors() external view returns (address);
    function TAPEOUT_FEE() external view returns (uint256);
    function nextId() external view returns (uint256);
    function tapeout(bytes calldata nl, uint32 nIn, uint32 nOut) external payable returns (uint256);
}

/// @notice 给已部署的 Chipet 登记 3 条模板电路（普通 / 稀有 / 传说）。
///
/// 推荐（免铸造）：复用链上已有 CPU 的现成电路
///   CHIPET=0x… CPU=0x… USE_EXISTING=1 forge script script/SeedChipetTemplates.s.sol --rpc-url xlayer --broadcast --private-key $PK
///
/// 自建：CREATE_CPU=1 流片 fa9/faCheat/faRef（需 BEM）
///   CHIPET=0x… CREATE_CPU=1 forge script ...
contract SeedChipetTemplates is Script {
    function run() external {
        address chipetAddr = vm.envAddress("CHIPET");
        Chipet chipet = Chipet(chipetAddr);
        address factory = address(chipet.factory());

        address cpu = vm.envOr("CPU", address(0));
        bool useExisting = vm.envOr("USE_EXISTING", false);
        bool createCpu = vm.envOr("CREATE_CPU", false);

        uint64 commonId;
        uint64 rareId;
        uint64 legendId;

        vm.startBroadcast();
        if (cpu == address(0)) {
            if (createCpu) {
                IFactory f = IFactory(factory);
                IERC20 bem = IERC20(f.bem());
                bem.approve(factory, f.deployFee());
                (, cpu) = f.createCPU("Chipet Heart", "CHIP", "Chipet template processor", 10_000_000, 0);
            } else {
                cpu = IFactory(factory).cpuAt(0);
            }
        }
        require(IFactory(factory).isCPU(cpu), "cpu not registered");

        if (useExisting || !vm.envOr("TAPEOUT", false)) {
            // 默认复用现成电路 1/2/3（ownerOf 仅校验存在，不必自己铸造）
            require(ICircuits(cpu).nextId() > 3, "cpu needs circuit ids 1..3");
            commonId = uint64(vm.envOr("TPL_COMMON", uint256(1)));
            rareId = uint64(vm.envOr("TPL_RARE", uint256(2)));
            legendId = uint64(vm.envOr("TPL_LEGEND", uint256(3)));
            ICPU(cpu).ownerOf(commonId);
            ICPU(cpu).ownerOf(rareId);
            ICPU(cpu).ownerOf(legendId);
        } else {
            string memory fixtures = vm.readFile("test/fixtures/circuits.json");
            commonId = uint64(_tapeout(cpu, fixtures, "fa9"));
            rareId = uint64(_tapeout(cpu, fixtures, "faCheat"));
            legendId = uint64(_tapeout(cpu, fixtures, "faRef"));
        }

        chipet.addTemplate(cpu, commonId, 0, 70);
        chipet.addTemplate(cpu, rareId, 1, 25);
        chipet.addTemplate(cpu, legendId, 2, 5);
        vm.stopBroadcast();

        console2.log("chipet   ", chipetAddr);
        console2.log("cpu      ", cpu);
        console2.log("commonId ", uint256(commonId));
        console2.log("rareId   ", uint256(rareId));
        console2.log("legendId ", uint256(legendId));
        console2.log("templates", chipet.templateCount());

        string memory o = "seed";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "factory", factory);
        vm.serializeAddress(o, "chipet", chipetAddr);
        string memory json = vm.serializeAddress(o, "cpu", cpu);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), "-chipet.json"));
    }

    function _tapeout(address cpu, string memory fixtures, string memory key) internal returns (uint256 id) {
        bytes memory nl = vm.parseJsonBytes(fixtures, string.concat(".", key, ".netlist"));
        uint32 nIn = uint32(vm.parseJsonUint(fixtures, string.concat(".", key, ".nIn")));
        uint32 nOut = uint32(vm.parseJsonUint(fixtures, string.concat(".", key, ".nOut")));
        (uint256 nNand, uint256 nLatch) = _burnOf(nl);

        ICircuits c = ICircuits(cpu);
        ITransistors tr = ITransistors(c.transistors());
        uint256 needNand = nNand > tr.balanceOf(msg.sender, 0) ? nNand - tr.balanceOf(msg.sender, 0) : 0;
        uint256 needLatch = nLatch > tr.balanceOf(msg.sender, 1) ? nLatch - tr.balanceOf(msg.sender, 1) : 0;
        if (needNand + needLatch > 0) {
            IERC20(tr.BEM()).approve(address(tr), type(uint256).max);
            if (needNand > 0) tr.mint(0, needNand);
            if (needLatch > 0) tr.mint(1, needLatch);
        }

        id = c.tapeout{value: c.TAPEOUT_FEE()}(nl, nIn, nOut);
        ICPU(cpu).ownerOf(id);
    }

    function _burnOf(bytes memory nl) internal pure returns (uint256 nNand, uint256 nLatch) {
        uint256 p = 0;
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            p += 1;
            if (op == 0) {
                nNand++;
                p += 6;
            } else if (op == 1) {
                nLatch++;
                p += 3;
            } else {
                p += 30 + uint256(uint8(nl[p + 28])) * 3;
            }
        }
    }
}
