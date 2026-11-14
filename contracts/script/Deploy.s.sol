// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TapeArena} from "../src/TapeArena.sol";
import {ComponentLibrary} from "../src/ComponentLibrary.sol";

interface IFactoryV2 {
    function deployFee() external view returns (uint256);
    function bem() external view returns (address);
    function createCPU(string calldata, string calldata, string calldata, uint256, uint256) external returns (address, address);
}

/// @notice 部署组件库 + 擂台到 X Layer，并可选地用官方工厂建一台默认处理器（需要钱包里有 BEM 付 deployFee）。
///   forge script script/Deploy.s.sol --rpc-url xlayer --broadcast --account <你的 keystore 名>
/// 可选环境变量：TREASURY（默认部署者）、FEE_BPS（默认 250）、CREATE_CPU=1、CPU_NAME
contract Deploy is Script {
    address constant FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;

    function run() external {
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(250)));
        bool createCpu = vm.envOr("CREATE_CPU", false);

        vm.startBroadcast();
        ComponentLibrary lib = new ComponentLibrary(FACTORY, deployer);
        TapeArena arena = new TapeArena(FACTORY, address(lib), treasury, feeBps, deployer);
        lib.setArena(address(arena));

        address cpu = address(0);
        if (createCpu) {
            IFactoryV2 f = IFactoryV2(FACTORY);
            IERC20(f.bem()).approve(FACTORY, f.deployFee());
            (, cpu) = f.createCPU(vm.envOr("CPU_NAME", string("TapeArena")), "TAPE", "TapeArena default processor", 100_000_000, 0);
        }
        vm.stopBroadcast();

        console2.log("library", address(lib));
        console2.log("arena  ", address(arena));
        console2.log("cpu    ", cpu);

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "factory", FACTORY);
        vm.serializeAddress(o, "library", address(lib));
        vm.serializeAddress(o, "arena", address(arena));
        string memory json = vm.serializeAddress(o, "cpu", cpu);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
