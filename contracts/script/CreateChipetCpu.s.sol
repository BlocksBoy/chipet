// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFactory {
    function bem() external view returns (address);
    function deployFee() external view returns (uint256);
    function createCPU(string calldata, string calldata, string calldata, uint256, uint256)
        external
        returns (address transistorsAddr, address circuitsAddr);
    function isCPU(address) external view returns (bool);
}

interface ITransistors {
    function supplyCap() external view returns (uint256);
    function minted() external view returns (uint256);
    function mintPrice() external view returns (uint256);
    function cpuName() external view returns (string memory);
}

interface ICircuits {
    function transistors() external view returns (address);
}

/// @notice 创建一台大供给、mintPrice=0 的 Chipet 流片 CPU，并写回 deployments。
///   CHIPET_FACTORY=0x… forge script script/CreateChipetCpu.s.sol --rpc-url xlayer --broadcast --private-key $PK
contract CreateChipetCpu is Script {
    address constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant BSC_FACTORY = 0x68224F668083c29e9800Be2a646d42d18cedF7e2;

    function run() external {
        address factoryAddr = vm.envOr("CHIPET_FACTORY", address(0));
        if (factoryAddr == address(0)) {
            if (block.chainid == 196 || block.chainid == 31337) factoryAddr = XLAYER_FACTORY;
            else if (block.chainid == 56) factoryAddr = BSC_FACTORY;
        }
        require(factoryAddr != address(0), "set CHIPET_FACTORY");

        IFactory factory = IFactory(factoryAddr);
        IERC20 bem = IERC20(factory.bem());
        uint256 fee = factory.deployFee();
        uint256 supply = vm.envOr("CPU_SUPPLY", uint256(100_000_000));
        string memory name = vm.envOr("CPU_NAME", string("Chipet Heart"));
        string memory symbol = vm.envOr("CPU_SYMBOL", string("CHIP"));
        string memory story = vm.envOr("CPU_STORY", string("Chipet tape-out processor"));

        require(bem.balanceOf(msg.sender) >= fee, "need BEM for deployFee (0.1 BEM on X Layer / BSC)");

        vm.startBroadcast();
        bem.approve(factoryAddr, fee);
        (address transistors, address cpu) = factory.createCPU(name, symbol, story, supply, 0);
        vm.stopBroadcast();

        require(factory.isCPU(cpu), "cpu not registered");
        ITransistors tr = ITransistors(ICircuits(cpu).transistors());
        require(address(tr) == transistors, "tr mismatch");
        require(tr.mintPrice() == 0, "mintPrice not zero");
        require(tr.supplyCap() == supply, "supply mismatch");

        console2.log("cpu         ", cpu);
        console2.log("transistors ", transistors);
        console2.log("supplyCap   ", tr.supplyCap());
        console2.log("minted      ", tr.minted());
        console2.log("name        ", tr.cpuName());

        string memory o = "cpu";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "factory", factoryAddr);
        vm.serializeAddress(o, "transistors", transistors);
        string memory json = vm.serializeAddress(o, "cpu", cpu);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), "-cpu.json"));
    }
}
