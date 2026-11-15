// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Chipet} from "../src/Chipet.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev 收款时 revert，用于测国库失败整笔回滚。
contract ChipetRevertTreasury {
    receive() external payable {
        revert("nope");
    }
}

/// @dev 收款时尝试重入 hatch。
contract ChipetReenterTreasury {
    Chipet public target;
    bool public hit;

    function setTarget(Chipet t) external {
        target = t;
    }

    receive() external payable {
        hit = true;
        target.hatch{value: msg.value}("reenter");
    }
}

/// @dev ERC721 接收方在回调里再 hatch。
contract ChipetReenterMinter {
    Chipet public target;
    uint256 public price;
    uint256 public depth;

    constructor(Chipet t, uint256 price_) {
        target = t;
        price = price_;
    }

    function attack() external payable {
        target.hatch{value: price}("outer");
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (depth == 0) {
            depth = 1;
            target.hatch{value: price}("inner");
        }
        return this.onERC721Received.selector;
    }
}

/// @dev Chipet 资金与权限安全：支付精确匹配、国库转发、owner 改价、重入。
contract ChipetMoneyTest is Base {
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

    function test_underpayReverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        chipet.hatch{value: hatchPrice - 1}("x");
        assertEq(treasury.balance, 0);
        assertEq(address(chipet).balance, 0);
    }

    function test_overpayReverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        chipet.hatch{value: hatchPrice + 1}("x");
        assertEq(treasury.balance, 0);
        assertEq(bob.balance, 1 ether);
        assertEq(address(chipet).balance, 0);
    }

    function test_exactPayForwardedToTreasury() public {
        uint256 beforeT = treasury.balance;
        uint256 beforeB = bob.balance;
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("Paid");
        assertEq(chipet.ownerOf(id), bob);
        assertEq(treasury.balance, beforeT + hatchPrice);
        assertEq(bob.balance, beforeB - hatchPrice);
        assertEq(address(chipet).balance, 0, "chipet must not retain ETH");
    }

    function test_multiHatchAccumulatesTreasury() public {
        vm.prank(bob);
        chipet.hatch{value: hatchPrice}("A");
        vm.prank(carol);
        chipet.hatch{value: hatchPrice}("B");
        assertEq(treasury.balance, hatchPrice * 2);
        assertEq(address(chipet).balance, 0);
    }

    function test_freeHatchRejectsAnyValue() public {
        Chipet free = new Chipet(address(factory), treasury, 0, owner);
        uint256 cid = _tapeoutFx(alice, "fa9");
        vm.prank(owner);
        free.addTemplate(address(cpu), uint64(cid), 0, 100);

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        free.hatch{value: 1 wei}("leak");

        vm.prank(bob);
        uint256 id = free.hatch{value: 0}("ok");
        assertEq(free.ownerOf(id), bob);
        assertEq(treasury.balance, 0);
        assertEq(address(free).balance, 0);
    }

    function test_treasuryRevertRollsBackMint() public {
        ChipetRevertTreasury bad = new ChipetRevertTreasury();
        Chipet c = new Chipet(address(factory), address(bad), hatchPrice, owner);
        uint256 cid = _tapeoutFx(alice, "fa9");
        vm.prank(owner);
        c.addTemplate(address(cpu), uint64(cid), 0, 100);

        vm.prank(bob);
        vm.expectRevert(bytes("treasury"));
        c.hatch{value: hatchPrice}("no");
        assertEq(c.balanceOf(bob), 0);
        assertEq(address(c).balance, 0);
    }

    function test_treasuryReenterBlocked() public {
        ChipetReenterTreasury bad = new ChipetReenterTreasury();
        Chipet c = new Chipet(address(factory), address(bad), hatchPrice, owner);
        bad.setTarget(c);
        uint256 cid = _tapeoutFx(alice, "fa9");
        vm.prank(owner);
        c.addTemplate(address(cpu), uint64(cid), 0, 100);

        vm.prank(bob);
        // receive 内重入 hatch 失败 → 国库 call 失败 → 外层整笔 revert（hit 也会随 receive 回滚）
        vm.expectRevert(bytes("treasury"));
        c.hatch{value: hatchPrice}("outer");
        assertEq(c.balanceOf(bob), 0);
        assertEq(address(c).balance, 0);
        assertFalse(bad.hit(), "failed receive state rolled back");
    }

    function test_mintCallbackReenterBlocked() public {
        ChipetReenterMinter attacker = new ChipetReenterMinter(chipet, hatchPrice);
        vm.deal(address(attacker), 1 ether);
        vm.expectRevert();
        attacker.attack{value: hatchPrice}();
        assertEq(chipet.balanceOf(address(attacker)), 0);
        assertEq(address(chipet).balance, 0);
    }

    function test_onlyOwnerSetHatchPrice() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        chipet.setHatchPrice(0);

        vm.prank(owner);
        chipet.setHatchPrice(0);
        assertEq(chipet.hatchPrice(), 0);

        vm.prank(bob);
        uint256 id = chipet.hatch{value: 0}("free");
        assertEq(chipet.ownerOf(id), bob);
    }

    function test_onlyOwnerSetTreasury() public {
        address next = makeAddr("newTreasury");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        chipet.setTreasury(next);

        vm.prank(owner);
        chipet.setTreasury(next);
        assertEq(chipet.treasury(), next);

        vm.prank(bob);
        chipet.hatch{value: hatchPrice}("toNew");
        assertEq(next.balance, hatchPrice);
        assertEq(treasury.balance, 0);
    }

    function test_priceChangeAppliesNextHatch() public {
        uint256 next = 0.002 ether;
        vm.prank(owner);
        chipet.setHatchPrice(next);

        vm.prank(bob);
        vm.expectRevert(Chipet.BadPayment.selector);
        chipet.hatch{value: hatchPrice}("old");

        vm.prank(bob);
        chipet.hatch{value: next}("new");
        assertEq(treasury.balance, next);
    }

    function test_onlyOwnerAddTemplate() public {
        uint256 id = _tapeoutFx(alice, "fa9");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        chipet.addTemplate(address(cpu), uint64(id), 0, 10);
    }

    function test_badCpuRejected() public {
        vm.prank(owner);
        vm.expectRevert(Chipet.BadCpu.selector);
        chipet.addTemplate(address(0xBEEF), 1, 0, 10);
    }

    function test_emptyNameReverts() public {
        vm.prank(bob);
        vm.expectRevert(Chipet.EmptyName.selector);
        chipet.hatch{value: hatchPrice}("");
    }

    function test_nameTooLongReverts() public {
        vm.prank(bob);
        vm.expectRevert(Chipet.NameTooLong.selector);
        chipet.hatch{value: hatchPrice}(string(new bytes(33)));
    }

    function test_noTemplateReverts() public {
        Chipet empty = new Chipet(address(factory), treasury, hatchPrice, owner);
        vm.prank(bob);
        vm.expectRevert(Chipet.NoTemplate.selector);
        empty.hatch{value: hatchPrice}("x");
    }

    function test_feedPlayDoNotMoveEth() public {
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("Care");
        uint256 tBal = treasury.balance;
        uint256 bBal = bob.balance;
        uint256 cBal = address(chipet).balance;

        vm.prank(bob);
        chipet.feed(id);
        vm.prank(bob);
        chipet.play(id);

        assertEq(treasury.balance, tBal);
        assertEq(bob.balance, bBal);
        assertEq(address(chipet).balance, cBal);
    }

    function test_feedRejectsAccidentalEth() public {
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("X");
        vm.prank(bob);
        (bool ok,) = address(chipet).call{value: 1 wei}(abi.encodeWithSelector(Chipet.feed.selector, id));
        assertFalse(ok);
        assertEq(address(chipet).balance, 0);
    }

    /// @dev 运维风险记录：owner 若把 treasury 设为 0 且 hatchPrice>0，付款会烧掉（call 到 0 成功）。
    /// 当前主网 hatchPrice=0，无即时资金风险；上线收费前务必确认 treasury 非零。
    function test_zeroTreasuryBurnsPayment_opsRisk() public {
        vm.prank(owner);
        chipet.setTreasury(address(0));
        uint256 before = bob.balance;
        vm.prank(bob);
        uint256 id = chipet.hatch{value: hatchPrice}("burn");
        assertEq(chipet.ownerOf(id), bob);
        assertEq(bob.balance, before - hatchPrice);
        assertEq(address(chipet).balance, 0);
        assertEq(address(0).balance, hatchPrice);
    }
}
