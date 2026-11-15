// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Chipet} from "../src/Chipet.sol";
import {ICPU, ICircuitFactory} from "../src/interfaces/ITapeOut.sol";

/// @dev X Layer fork 上：部署 Chipet → 复用现成电路做模板 → 免费孵化。
///   FORK=1 forge test --mc ChipetXLayerFork -vv
contract ChipetXLayerForkTest is Test {
    address constant FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address constant CPU0 = 0x839bdD6fa7A66416A609A735e11DE5411B98574e;

    function setUp() public {
        if (!vm.envOr("FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork("xlayer");
    }

    function test_fork_deploySeedHatch() public {
        require(FACTORY.code.length > 0, "factory");
        require(ICircuitFactory(FACTORY).isCPU(CPU0), "cpu0");
        require(ICPU(CPU0).ownerOf(1) != address(0), "circuit1");

        address owner = makeAddr("owner");
        address bob = makeAddr("bob");
        vm.deal(bob, 1 ether);

        Chipet chipet = new Chipet(FACTORY, owner, 0, owner);
        vm.startPrank(owner);
        chipet.addTemplate(CPU0, 1, 0, 70);
        chipet.addTemplate(CPU0, 2, 1, 25);
        chipet.addTemplate(CPU0, 3, 2, 5);
        vm.stopPrank();

        assertEq(chipet.templateCount(), 3);
        assertEq(chipet.hatchPrice(), 0);

        vm.prank(bob);
        uint256 id = chipet.hatch{value: 0}(unicode"青豆");
        assertEq(id, 1);
        assertEq(chipet.ownerOf(1), bob);

        Chipet.Pet memory p = chipet.petOf(1);
        assertEq(p.cpu, CPU0);
        assertEq(keccak256(bytes(p.name)), keccak256(bytes(unicode"青豆")));
        assertEq(p.energy, 80);

        vm.prank(bob);
        chipet.feed(1);
        assertEq(chipet.petOf(1).energy, 100);

        vm.prank(bob);
        chipet.play(1);
        assertEq(chipet.petOf(1).mood, 90);
    }
}
