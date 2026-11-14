// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {TapeArena} from "../src/TapeArena.sol";
import {ComponentLibrary} from "../src/ComponentLibrary.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}
    function mint(address to, uint256 a) external { _mint(to, a); }
}

contract TapeArenaTest is Base {
    uint256 internal refId;
    uint256 internal fa9Id;

    function setUp() public override {
        super.setUp();
        refId = _tapeoutFx(alice, "faRef"); // #1 参考电路
        fa9Id = _tapeoutFx(bob, "fa9");     // #2 9 门全加器
    }

    function _createFA(bytes memory vectors, uint16 royaltyBps) internal returns (uint256 id) {
        TapeArena.CreateParams memory p = _params(1 ether, address(cpu), refId, 3, 2, vectors, royaltyBps);
        vm.prank(alice);
        id = arena.createBounty{value: 1 ether}(p);
    }

    function test_fullFlow_submitChallengeFinalize() public {
        uint256 id = _createFA(_vec("faVectorsCin0"), 0);

        vm.prank(bob);
        arena.submit{value: 0.01 ether}(id, address(cpu), fa9Id);
        assertEq(arena.getBounty(id).best, 1);

        // 作弊电路只对 cin=0 正确，但门数更少，暂时领先
        uint256 cheatId = _tapeoutFx(carol, "faCheat");
        vm.prank(carol);
        arena.submit{value: 0.01 ether}(id, address(cpu), cheatId);
        TapeArena.Submission[] memory subs = arena.getSubmissions(id);
        assertLt(subs[1].gateCount, subs[0].gateCount);
        assertEq(arena.getBounty(id).best, 2);

        // 拿参考电路无法反驳的输入去挑战：失败
        vm.prank(dave);
        vm.expectRevert(TapeArena.NotDifferent.selector);
        arena.challenge(id, 1, hex"03"); // a=1 b=1 cin=0

        // a=0 b=0 cin=1：作弊电路 s=0，参考 s=1 → 取消资格，保证金归挑战者
        vm.prank(dave);
        arena.challenge(id, 1, hex"04");
        assertTrue(arena.getSubmissions(id)[1].disqualified);
        assertEq(arena.getBounty(id).best, 1);
        assertEq(arena.credit(address(0), dave), 0.01 ether);

        vm.expectRevert(TapeArena.NotYet.selector);
        arena.finalize(id);

        vm.warp(block.timestamp + 2 days + 1);
        arena.finalize(id);

        assertEq(arena.credit(address(0), bob), 0.975 ether);
        assertEq(arena.credit(address(0), treasury), 0.025 ether);

        vm.prank(bob);
        arena.claimBond(id, 0);
        vm.prank(carol);
        vm.expectRevert(TapeArena.Closed.selector);
        arena.claimBond(id, 1);

        uint256 before = bob.balance;
        vm.prank(bob);
        arena.withdraw(address(0));
        assertEq(bob.balance - before, 0.985 ether);

        // 冠军自动入组件库并带认证
        ComponentLibrary.Component memory c = lib.get(lib.keyOf(address(cpu), fa9Id));
        assertEq(c.registrant, bob);
        assertEq(c.verifiedBounty, id + 1);
        assertEq(c.gateCount, 9);
    }

    function test_royaltyToUpstreamComponent() public {
        // bob 把 9 门全加器登记成组件
        vm.prank(bob);
        lib.register(address(cpu), fa9Id, "FA9", '{"pins":"a,b,cin -> s,cout"}');

        // erin 用 4 个 FA9 拼出 4 位加法器（REF 引用 #2）
        (bytes memory nl, uint32 nIn, uint32 nOut) = _fx("add4Ref");
        nl = _patchAddr(nl, vm.parseJsonAddress(fixtures, ".placeholder"), address(cpu));
        uint256 addId = _tapeout(erin, nl, nIn, nOut);
        (,,, uint32 gates) = cpu.circuitInfo(addId);
        assertEq(gates, vm.parseJsonUint(fixtures, ".add4Ref.gateCount"));

        TapeArena.CreateParams memory p = _params(2 ether, address(0), 0, 9, 5, _vec("add4Vectors"), 2000);
        p.bond = 0;
        vm.prank(alice);
        uint256 id = arena.createBounty{value: 2 ether}(p);

        vm.prank(erin);
        arena.submit(id, address(cpu), addId);

        assertEq(lib.recordUse(address(cpu), addId), 1);
        assertEq(lib.recordUse(address(cpu), addId), 0); // 重复调用不重复计数
        assertEq(lib.get(lib.keyOf(address(cpu), fa9Id)).uses, 1);

        vm.warp(block.timestamp + 2 days + 1);
        arena.finalize(id);

        assertEq(arena.credit(address(0), bob), 0.4 ether);   // 20% 分润给上游组件持有人
        assertEq(arena.credit(address(0), treasury), 0.05 ether);
        assertEq(arena.credit(address(0), erin), 1.55 ether);
    }

    function test_rejectsWrongCircuit() public {
        uint256 id = _createFA(_vec("faVectorsAll"), 0);
        uint256 cheatId = _tapeoutFx(carol, "faCheat");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(TapeArena.VectorFailed.selector, 4));
        arena.submit{value: 0.01 ether}(id, address(cpu), cheatId);

        (bool ok, uint256 failed,, string memory reason) = arena.check(id, address(cpu), cheatId);
        assertFalse(ok);
        assertEq(failed, 4);
        assertEq(reason, "vector failed");
        (ok,,,) = arena.check(id, address(cpu), fa9Id);
        assertTrue(ok);
    }

    function test_rejectsNotOwnerDuplicateAndLate() public {
        uint256 id = _createFA(_vec("faVectorsAll"), 0);
        vm.prank(carol);
        vm.expectRevert(TapeArena.NotCircuitOwner.selector);
        arena.submit{value: 0.01 ether}(id, address(cpu), fa9Id);

        vm.prank(bob);
        vm.expectRevert(TapeArena.BadBond.selector);
        arena.submit(id, address(cpu), fa9Id);

        vm.startPrank(bob);
        arena.submit{value: 0.01 ether}(id, address(cpu), fa9Id);
        vm.expectRevert(TapeArena.AlreadySubmitted.selector);
        arena.submit{value: 0.01 ether}(id, address(cpu), fa9Id);
        vm.stopPrank();

        uint256 other = _tapeoutFx(bob, "faRef");
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(TapeArena.Closed.selector);
        arena.submit{value: 0.01 ether}(id, address(cpu), other);
    }

    function test_rejectsPinMismatchAndBadReference() public {
        (bytes memory nl, uint32 nIn, uint32 nOut) = _fx("add4Ref");
        nl = _patchAddr(nl, vm.parseJsonAddress(fixtures, ".placeholder"), address(cpu));
        uint256 addId = _tapeout(erin, nl, nIn, nOut);
        uint256 id = _createFA(_vec("faVectorsAll"), 0);
        vm.prank(erin);
        vm.expectRevert(TapeArena.PinMismatch.selector);
        arena.submit{value: 0.01 ether}(id, address(cpu), addId);

        // 参考电路必须通过自己的向量
        uint256 cheatId = _tapeoutFx(carol, "faCheat");
        TapeArena.CreateParams memory p = _params(1 ether, address(cpu), cheatId, 3, 2, _vec("faVectorsAll"), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TapeArena.VectorFailed.selector, 4));
        arena.createBounty{value: 1 ether}(p);
    }

    function test_noSubmissionsRefundsAndCancel() public {
        uint256 id = _createFA(_vec("faVectorsAll"), 0);
        vm.warp(block.timestamp + 2 days + 1);
        arena.finalize(id);
        assertEq(arena.credit(address(0), alice), 1 ether);

        uint256 id2 = _createFA(_vec("faVectorsAll"), 0);
        vm.prank(bob);
        vm.expectRevert(TapeArena.BadParams.selector);
        arena.cancel(id2);
        vm.prank(alice);
        arena.cancel(id2);
        assertEq(arena.credit(address(0), alice), 2 ether);
    }

    function test_erc20RewardAndTopUp() public {
        MockUSD usd = new MockUSD();
        usd.mint(alice, 1000e18);
        usd.mint(dave, 500e18);
        TapeArena.CreateParams memory p = _params(1000e18, address(cpu), refId, 3, 2, _vec("faVectorsAll"), 0);
        p.token = address(usd);
        vm.startPrank(alice);
        usd.approve(address(arena), 1000e18);
        uint256 id = arena.createBounty(p);
        vm.stopPrank();

        vm.startPrank(dave);
        usd.approve(address(arena), 500e18);
        arena.addReward(id, 500e18);
        vm.stopPrank();
        assertEq(arena.getBounty(id).reward, 1500e18);

        vm.prank(bob);
        arena.submit{value: 0.01 ether}(id, address(cpu), fa9Id);
        vm.warp(block.timestamp + 2 days + 1);
        arena.finalize(id);
        vm.prank(bob);
        arena.withdraw(address(usd));
        assertEq(usd.balanceOf(bob), 1462.5e18);
    }

    function test_optimisticSamplingAndVectorChallenge() public {
        TapeArena.CreateParams memory p = _params(1 ether, address(0), 0, 3, 2, _vec("faVectorsAll"), 0);
        p.sampleSize = 2;
        vm.prank(alice);
        uint256 id = arena.createBounty{value: 1 ether}(p);
        uint256 cheatId = _tapeoutFx(carol, "faCheat");

        // 找一个让两次抽检都落在 cin=0（下标 0..3）的 prevrandao，模拟作弊者侥幸过关
        uint256 r;
        for (r = 1; r < 1000; r++) {
            uint256 seed = uint256(keccak256(abi.encode(r, carol, address(cpu), cheatId, id)));
            if (uint256(keccak256(abi.encode(seed, 0))) % 8 < 4 && uint256(keccak256(abi.encode(seed, 1))) % 8 < 4) break;
        }
        vm.prevrandao(bytes32(r));
        vm.prank(carol);
        arena.submit{value: 0.01 ether}(id, address(cpu), cheatId);

        vm.prank(dave);
        vm.expectRevert(TapeArena.NotDifferent.selector);
        arena.challengeVector(id, 0, 1);

        vm.prank(dave);
        arena.challengeVector(id, 0, 4);
        assertTrue(arena.getSubmissions(id)[0].disqualified);
        assertEq(arena.getBounty(id).best, 0);
        assertEq(arena.credit(address(0), dave), 0.01 ether);
    }

    function test_libraryRegisterRules() public {
        vm.prank(carol);
        vm.expectRevert(ComponentLibrary.NotOwner.selector);
        lib.register(address(cpu), fa9Id, "x", "");

        vm.prank(bob);
        bytes32 k = lib.register(address(cpu), fa9Id, "FA9", "");
        vm.prank(bob);
        vm.expectRevert(ComponentLibrary.AlreadyRegistered.selector);
        lib.register(address(cpu), fa9Id, "FA9", "");

        uint256 before = bob.balance;
        vm.prank(dave);
        lib.tip{value: 0.5 ether}(k);
        assertEq(bob.balance - before, 0.5 ether);

        vm.expectRevert(ComponentLibrary.OnlyArena.selector);
        lib.registerVerified(address(cpu), fa9Id, bob, "x", "", 0);

        assertEq(lib.count(), 1);
        assertEq(lib.list(0, 10)[0].name, "FA9");
    }
}
