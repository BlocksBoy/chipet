// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {CircuitFactory} from "../vendor/tapeout/CircuitFactory.sol";
import {Circuits} from "../vendor/tapeout/Circuits.sol";
import {Transistors} from "../vendor/tapeout/Transistors.sol";
import {TapeArena} from "../src/TapeArena.sol";
import {ComponentLibrary} from "../src/ComponentLibrary.sol";

/// @dev 本地部署一套真实的 TapeOut 协议（X Layer 上已验证的同一份源码），在上面跑擂台。
abstract contract Base is Test {
    CircuitFactory internal factory;
    Circuits internal cpu;
    Transistors internal tr;
    TapeArena internal arena;
    ComponentLibrary internal lib;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal alice = makeAddr("alice"); // 出题人
    address internal bob = makeAddr("bob");     // 设计者
    address internal carol = makeAddr("carol"); // 作弊者
    address internal dave = makeAddr("dave");   // 挑战者
    address internal erin = makeAddr("erin");   // 组件使用者

    string internal fixtures;
    uint256 internal constant TAPEOUT_FEE = 0.0002 ether;

    function setUp() public virtual {
        fixtures = vm.readFile("test/fixtures/circuits.json");

        Transistors tImpl = new Transistors();
        Circuits cImpl = new Circuits();
        CircuitFactory fImpl = new CircuitFactory();
        factory = CircuitFactory(address(new ERC1967Proxy(
            address(fImpl),
            abi.encodeCall(CircuitFactory.initialize, (owner, address(tImpl), address(cImpl), owner, 1e7, 1e6))
        )));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
        vm.deal(dave, 100 ether);
        vm.deal(erin, 100 ether);

        vm.prank(alice);
        (address t, address c) = factory.createCPU{value: 1e7}("Arena Test CPU", "ATC", "local", 1_000_000, 0);
        tr = Transistors(t);
        cpu = Circuits(c);

        lib = new ComponentLibrary(address(factory), owner);
        arena = new TapeArena(address(factory), address(lib), treasury, 250, owner);
        vm.prank(owner);
        lib.setArena(address(arena));
    }

    function _fx(string memory key) internal view returns (bytes memory nl, uint32 nIn, uint32 nOut) {
        nl = vm.parseJsonBytes(fixtures, string.concat(".", key, ".netlist"));
        nIn = uint32(vm.parseJsonUint(fixtures, string.concat(".", key, ".nIn")));
        nOut = uint32(vm.parseJsonUint(fixtures, string.concat(".", key, ".nOut")));
    }

    function _vec(string memory key) internal view returns (bytes memory) {
        return vm.parseJsonBytes(fixtures, string.concat(".", key));
    }

    /// @dev 以 who 的身份铸晶体管并流片，返回电路号。
    function _tapeout(address who, bytes memory nl, uint32 nIn, uint32 nOut) internal returns (uint256 id) {
        (uint256 nNand, uint256 nLatch) = _burnOf(nl);
        vm.startPrank(who);
        if (nNand > 0) _mint(0, nNand);
        if (nLatch > 0) _mint(1, nLatch);
        id = _tapeoutCall(nl, nIn, nOut);
        vm.stopPrank();
    }

    function _mint(uint256 kind, uint256 amount) internal virtual {
        tr.mint{value: 1e6}(kind, amount);
    }

    function _tapeoutCall(bytes memory nl, uint32 nIn, uint32 nOut) internal virtual returns (uint256) {
        return cpu.tapeout{value: cpu.TAPEOUT_FEE()}(nl, nIn, nOut);
    }

    function _tapeoutFx(address who, string memory key) internal returns (uint256) {
        (bytes memory nl, uint32 nIn, uint32 nOut) = _fx(key);
        return _tapeout(who, nl, nIn, nOut);
    }

    function _burnOf(bytes memory nl) internal pure returns (uint256 nNand, uint256 nLatch) {
        uint256 p = 0;
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            p += 1;
            if (op == 0) { nNand++; p += 6; }
            else if (op == 1) { nLatch++; p += 3; }
            else p += 30 + uint256(uint8(nl[p + 28])) * 3;
        }
    }

    /// @dev 把网表里 REF 的占位地址替换成真实处理器地址。
    function _patchAddr(bytes memory nl, address from, address to) internal pure returns (bytes memory) {
        bytes20 f = bytes20(from);
        bytes20 t = bytes20(to);
        for (uint256 i = 0; i + 20 <= nl.length; i++) {
            bool hit = true;
            for (uint256 k = 0; k < 20; k++) if (nl[i + k] != f[k]) { hit = false; break; }
            if (hit) for (uint256 k = 0; k < 20; k++) nl[i + k] = t[k];
        }
        return nl;
    }

    function _params(uint256 reward, address refCpu, uint256 refId, uint32 nIn, uint32 nOut, bytes memory vectors, uint16 royaltyBps)
        internal view returns (TapeArena.CreateParams memory p)
    {
        p.token = address(0);
        p.reward = reward;
        p.bond = 0.01 ether;
        p.refCpu = refCpu;
        p.refId = uint64(refId);
        p.nIn = nIn;
        p.nOut = nOut;
        p.maxGates = 0;
        p.royaltyBps = royaltyBps;
        p.deadline = uint64(block.timestamp + 1 days);
        p.challengeWindow = 1 days;
        p.vectors = vectors;
        p.meta = '{"title":"full adder"}';
    }
}
