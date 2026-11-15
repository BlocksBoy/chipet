// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chipet} from "../src/Chipet.sol";

/// @notice 部署 Chipet。模板用 cast send addTemplate 登记。
///   forge script script/DeployChipet.s.sol --rpc-url xlayer --broadcast --account <keystore>
///   TAPEOUT_FACTORY=0x… forge script script/DeployChipet.s.sol --rpc-url bsc --broadcast --account <keystore>
/// X Layer 默认用 TapeOut 官方工厂；其他链（BSC）没有官方工厂，必须用 TAPEOUT_FACTORY 指定一个已部署的工厂。
contract DeployChipet is Script {
    address constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;

    function run() external {
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);
        uint256 hatchPrice = vm.envOr("HATCH_PRICE", uint256(0.001 ether));

        // 196 = X Layer 主网，31337 = 它的本地 fork
        bool onXLayer = block.chainid == 196 || block.chainid == 31337;
        address factory = vm.envOr("TAPEOUT_FACTORY", onXLayer ? XLAYER_FACTORY : address(0));
        require(factory.code.length > 0, "set TAPEOUT_FACTORY to a deployed TapeOut factory on this chain");

        vm.startBroadcast();
        Chipet chipet = new Chipet(factory, treasury, hatchPrice, deployer);
        vm.stopBroadcast();

        console2.log("chipet", address(chipet));
        console2.log("hatch ", hatchPrice);

        string memory o = "deploy";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "factory", factory);
        string memory json = vm.serializeAddress(o, "chipet", address(chipet));
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), "-chipet.json"));
    }
}
