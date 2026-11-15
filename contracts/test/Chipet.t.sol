// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Chipet} from "../src/Chipet.sol";

contract ChipetTest is Base {
    Chipet internal chipet;
    uint256 internal hatchPrice = 0.001 ether;

    function setUp() public override {
        super.setUp();
        chipet = new Chipet(address(factory), treasury, hatchPrice, owner);

        uint256 common = _tapeoutFx(alice, "fa9");
        uint256 rare = _tapeoutFx(alice, "faCheat");
        uint256 legend = _tapeoutFx(alice, "faRef");
        vm.startPrank(owner);
        chipet.addTemplate(address(cpu), uint64(common), 0, 70);
        chipet.addTemplate(address(cpu), uint64(rare), 1, 25);
        chipet.addTemplate(address(cpu), uint64(legend), 2, 5);
        vm.stopPrank();
    }

    function test_hatchAndCare() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}(unicode"小狐");
        assertEq(chipet.ownerOf(id), bob);

        Chipet.Pet memory p = chipet.petOf(id);
        assertEq(keccak256(bytes(p.name)), keccak256(bytes(unicode"小狐")));
        assertEq(p.level, 1);
        assertEq(p.energy, 80);

        vm.prank(bob);
        chipet.feed(id);
        p = chipet.petOf(id);
        assertEq(p.energy, 100);
        assertEq(p.intimacy, 1);

        vm.prank(bob);
        chipet.play(id);
        p = chipet.petOf(id);
        assertEq(p.mood, 90);
        assertEq(p.intimacy, 2);

        (address c,, uint8 rarity, uint32 gates,,) = chipet.geneHint(id);
        assertEq(c, address(cpu));
        assertTrue(gates > 0);
        assertTrue(rarity <= 2);

        assertEq(treasury.balance, hatchPrice);
    }

    function test_feedCooldown() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("Cool");
        vm.prank(bob);
        chipet.feed(id);
        vm.prank(bob);
        vm.expectRevert(Chipet.CoolingDown.selector);
        chipet.feed(id);
        vm.warp(block.timestamp + 5 minutes + 1);
        vm.prank(bob);
        chipet.feed(id);
    }

    function test_onlyOwnerCares() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("Mine");
        vm.prank(carol);
        vm.expectRevert(Chipet.NotPetOwner.selector);
        chipet.feed(id);
    }

    function test_badPayment() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        chipet.hatch{value: hatchPrice - 1}("x");
    }
}
