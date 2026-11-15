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

/// @notice 部署组件库 + 擂台。默认不建 CPU（建 CPU 需 BEM）。
///   forge script script/Deploy.s.sol --rpc-url bsc --broadcast --private-key $PK
///   forge script script/Deploy.s.sol --rpc-url xlayer --broadcast --private-key $PK
/// 可选：TREASURY、FEE_BPS、CREATE_CPU=1、CPU_NAME、TAPEOUT_FACTORY
contract Deploy is Script {
    address constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant BSC_FACTORY = 0x68224F668083c29e9800Be2a646d42d18cedF7e2;

    function run() external {
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(250)));
        bool createCpu = vm.envOr("CREATE_CPU", false);

        address defaultFactory = address(0);
        if (block.chainid == 196 || block.chainid == 31337) defaultFactory = XLAYER_FACTORY;
        else if (block.chainid == 56) defaultFactory = BSC_FACTORY;
        address factory = vm.envOr("TAPEOUT_FACTORY", defaultFactory);
        require(factory.code.length > 0, "set TAPEOUT_FACTORY");

        vm.startBroadcast();
        ComponentLibrary lib = new ComponentLibrary(factory, deployer);
        TapeArena arena = new TapeArena(factory, address(lib), treasury, feeBps, deployer);
        lib.setArena(address(arena));

        address cpu = address(0);
        if (createCpu) {
            IFactoryV2 f = IFactoryV2(factory);
            IERC20(f.bem()).approve(factory, f.deployFee());
            (, cpu) = f.createCPU(vm.envOr("CPU_NAME", string("TapeArena")), "TAPE", "TapeArena default processor", 100_000_000, 0);
        }
        vm.stopBroadcast();

        console2.log("library", address(lib));
        console2.log("arena  ", address(arena));
        console2.log("cpu    ", cpu);

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "factory", factory);
        vm.serializeAddress(o, "library", address(lib));
        vm.serializeAddress(o, "arena", address(arena));
        string memory json = vm.serializeAddress(o, "cpu", cpu);
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
