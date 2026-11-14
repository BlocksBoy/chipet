// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {CircuitFactory} from "../vendor/tapeout/CircuitFactory.sol";
import {Circuits} from "../vendor/tapeout/Circuits.sol";
import {Transistors} from "../vendor/tapeout/Transistors.sol";
import {TapeArena} from "../src/TapeArena.sol";
import {ComponentLibrary} from "../src/ComponentLibrary.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev 在 X Layer 主网 fork 上用官方工厂跑完整流程。需要网络：FORK=1 forge test --mc XLayerFork
contract XLayerForkTest is Base {
    address internal constant XLAYER_FACTORY = 0x1f09DAeFA827f02CBb40967cc91b259763760761;
    address internal constant BEM = 0x60e62Efa9405d6873C5deaBD4E6CC91c25363952;

    function setUp() public override {
        if (!vm.envOr("FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork("xlayer");
        fixtures = vm.readFile("test/fixtures/circuits.json");
        factory = CircuitFactory(XLAYER_FACTORY);

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(erin, 100 ether);

        // 主网工厂已升级：建 CPU 改为用 BEM 支付 deployFee（不再收 OKB）
        uint256 fee = factory.deployFee();
        deal(BEM, alice, fee);
        vm.startPrank(alice);
        IERC20(BEM).approve(address(factory), fee);
        (address t, address c) = factory.createCPU("TapeArena Fork CPU", "TAF", "fork", 1_000_000, 0);
        vm.stopPrank();
        tr = Transistors(t);
        cpu = Circuits(c);
        assertTrue(factory.isCPU(c));

        lib = new ComponentLibrary(address(factory), owner);
        arena = new TapeArena(address(factory), address(lib), treasury, 250, owner);
        vm.prank(owner);
        lib.setArena(address(arena));
    }

    /// @dev 主网 Transistors 已升级：mint 用 BEM 支付协议费与晶体管价格。
    function _mint(uint256 kind, uint256 amount) internal override {
        (, address who,) = vm.readCallers();
        deal(BEM, who, IERC20(BEM).balanceOf(who) + 1e12);
        IERC20(BEM).approve(address(tr), type(uint256).max);
        tr.mint(kind, amount);
    }

    function test_fork_fullFlowWithRoyalty() public {
        uint256 refId = _tapeoutFx(alice, "faRef");
        uint256 fa9Id = _tapeoutFx(bob, "fa9");

        // 1. 全加器擂台：bob 夺冠，作弊者被挑战出局
        TapeArena.CreateParams memory p = _params(1 ether, address(cpu), refId, 3, 2, _vec("faVectorsCin0"), 0);
        vm.prank(alice);
        uint256 faBounty = arena.createBounty{value: 1 ether}(p);

        vm.prank(bob);
        arena.submit{value: 0.01 ether}(faBounty, address(cpu), fa9Id);
        uint256 cheatId = _tapeoutFx(carol, "faCheat");
        vm.prank(carol);
        arena.submit{value: 0.01 ether}(faBounty, address(cpu), cheatId);
        assertEq(arena.getBounty(faBounty).best, 2);

        vm.prank(dave);
        arena.challenge(faBounty, 1, hex"04");
        assertEq(arena.getBounty(faBounty).best, 1);

        // 2. 4 位加法器擂台：erin 用 bob 的全加器 REF 拼装，结算时上游自动分润 20%
        (bytes memory nl, uint32 nIn, uint32 nOut) = _fx("add4Ref");
        nl = _patchAddr(nl, vm.parseJsonAddress(fixtures, ".placeholder"), address(cpu));
        uint256 addId = _tapeout(erin, nl, nIn, nOut);
        (,,, uint32 gates) = cpu.circuitInfo(addId);
        assertEq(gates, 42);

        TapeArena.CreateParams memory q = _params(2 ether, address(cpu), addId, nIn, nOut, _vec("add4Vectors"), 2000);
        q.meta = '{"title":"4-bit adder"}';
        vm.prank(alice);
        uint256 addBounty = arena.createBounty{value: 2 ether}(q);

        vm.prank(erin);
        arena.submit{value: 0.01 ether}(addBounty, address(cpu), addId);

        // via_ir 下 warp 之后读 block.timestamp 可能被优化成旧值，所以两场擂台都在 warp 前创建
        vm.warp(block.timestamp + 2 days + 1);
        arena.finalize(faBounty);
        assertEq(lib.get(lib.keyOf(address(cpu), fa9Id)).verifiedBounty, faBounty + 1);
        arena.finalize(addBounty);

        // 2 ether: 2.5% 手续费 0.05，版税池 20% 归 bob，其余归 erin
        assertEq(arena.credit(address(0), treasury), 0.025 ether + 0.05 ether);
        assertEq(arena.credit(address(0), bob), 0.975 ether + 0.4 ether);
        assertEq(arena.credit(address(0), erin), 1.55 ether);
    }

    function test_fork_rejectsForeignContract() public {
        TapeArena.CreateParams memory p = _params(1 ether, address(arena), 1, 3, 2, _vec("faVectorsCin0"), 0);
        vm.prank(alice);
        vm.expectRevert(TapeArena.NotCPU.selector);
        arena.createBounty{value: 1 ether}(p);
    }
}
