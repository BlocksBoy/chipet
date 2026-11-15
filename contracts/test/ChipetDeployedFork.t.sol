// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chipet} from "../src/Chipet.sol";

/// @dev 核对已部署主网 Chipet：价格、模板、工厂，并在 fork 上模拟免费孵化。
///   FORK=1 forge test --mc ChipetDeployedFork -vv
contract ChipetDeployedForkTest is Test {
    address constant XLAYER_CHIPET = 0xEB13A939cfD7d69C73f52f4EA23E5CECF880F710;
    address constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant XLAYER_OWNER = 0xBd435f285916F437A2971D62233F08d1f1434e00;

    address constant BSC_CHIPET = 0x17be584c6D69Ab652fc9DdDa201042c6374667F4;
    address constant BSC_FACTORY = 0x68224F668083c29e9800Be2a646d42d18cedF7e2;
    address constant BSC_OWNER = 0x231705a35dB8A4264742d9660F8b45Ad7A4966d5;

    function setUp() public {
        if (!vm.envOr("FORK", false)) {
            vm.skip(true);
            return;
        }
    }

    function test_fork_xlayer_liveConfigAndHatch() public {
        vm.createSelectFork("xlayer");
        _assertLive(XLAYER_CHIPET, XLAYER_FACTORY, XLAYER_OWNER);
    }

    function test_fork_bsc_liveConfigAndHatch() public {
        vm.createSelectFork("bsc");
        _assertLive(BSC_CHIPET, BSC_FACTORY, BSC_OWNER);
    }

    function _assertLive(address chipetAddr, address expectFactory, address expectOwner) internal {
        require(chipetAddr.code.length > 0, "no chipet code");
        Chipet chipet = Chipet(chipetAddr);

        assertEq(chipet.owner(), expectOwner, "owner");
        assertEq(address(chipet.factory()), expectFactory, "factory");
        assertEq(chipet.hatchPrice(), 0, "must stay free until intentional price change");
        assertEq(chipet.templateCount(), 3, "templates");
        assertEq(chipet.treasury(), expectOwner, "treasury is deployer");
        assertEq(address(chipet).balance, 0, "no trapped ETH");

        address bob = makeAddr("liveBob");
        vm.deal(bob, 1 ether);

        // 误付费必须失败
        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        chipet.hatch{value: 1 wei}("leak");

        uint256 nextBefore = chipet.nextId();
        vm.prank(bob);
        uint256 id = chipet.hatch{value: 0}(unicode"测宠");
        assertEq(id, nextBefore);
        assertEq(chipet.ownerOf(id), bob);
        assertEq(address(chipet).balance, 0);

        Chipet.Pet memory p = chipet.petOf(id);
        assertEq(p.energy, 80);
        assertEq(p.mood, 70);
        assertEq(p.level, 1);

        vm.prank(bob);
        chipet.feed(id);
        assertEq(chipet.petOf(id).energy, 100);

        vm.prank(bob);
        chipet.play(id);
        assertEq(chipet.petOf(id).mood, 90);

        // 非 owner 不能改价 / 换国库
        vm.prank(bob);
        vm.expectRevert();
        chipet.setHatchPrice(1 ether);
        vm.prank(bob);
        vm.expectRevert();
        chipet.setTreasury(bob);
    }
}
