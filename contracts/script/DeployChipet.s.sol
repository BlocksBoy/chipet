// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Chipet} from "../src/Chipet.sol";

/// @notice 部署 Chipet。模板用 SeedChipetTemplates / cast send addTemplate 登记。
///   forge script script/DeployChipet.s.sol --rpc-url xlayer --broadcast --private-key $PK
///   forge script script/DeployChipet.s.sol --rpc-url bsc --broadcast --private-key $PK
/// X Layer / BSC 默认用各自官方工厂；其他链必须用 TAPEOUT_FACTORY 指定。
contract DeployChipet is Script {
    address constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant BSC_FACTORY = 0x68224F668083c29e9800Be2a646d42d18cedF7e2;

    function run() external {
        address deployer = msg.sender;
        address treasury = vm.envOr("TREASURY", deployer);
        uint256 hatchPrice = vm.envOr("HATCH_PRICE", uint256(0.001 ether));

        address defaultFactory = address(0);
        if (block.chainid == 196 || block.chainid == 31337) defaultFactory = XLAYER_FACTORY;
        else if (block.chainid == 56) defaultFactory = BSC_FACTORY;
        address factory = vm.envOr("TAPEOUT_FACTORY", defaultFactory);
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
