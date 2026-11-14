// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICPU, ICircuitFactory} from "./interfaces/ITapeOut.sol";
import {NetlistRefs} from "./lib/NetlistRefs.sol";

/// @title ComponentLibrary — TapeOut 电路组件库
/// @notice 已流片的电路登记成可复用组件：名称、引脚说明、擂台认证与被引用次数全部上链。
///         其他电路通过 TapeOut 原生的 REF 指令引用组件；任何人都可以调用 recordUse 让合约
///         读取下游网表、核实引用关系并累计引用数。擂台结算时按这张引用图给上游作者分润。
///         收益永远归「组件电路 NFT 的当前持有人」，NFT 转手，收益权跟着走。
contract ComponentLibrary is Ownable, ReentrancyGuard {
    struct Component {
        address cpu;
        uint64 circuitId;
        uint64 registeredAt;
        address registrant;
        uint32 nIn;
        uint32 nOut;
        uint32 gateCount;
        uint32 uses;          // 被多少枚不同的下游电路引用（recordUse 核实）
        uint32 verifiedBounty; // 通过哪个擂台认证（擂台编号 + 1；0 = 未认证）
        string name;
        string meta;          // JSON：描述、引脚名、分类、HDL 源码地址等
    }

    ICircuitFactory public immutable factory;
    address public arena;

    mapping(bytes32 => Component) internal _components;
    bytes32[] public keys;
    mapping(bytes32 => mapping(bytes32 => bool)) public usedBy; // component => child => 已计数
    mapping(address => uint256) public owed;                    // 打赏转账失败时的拉取余额

    event ArenaSet(address arena);
    event Registered(bytes32 indexed key, address indexed cpu, uint256 indexed circuitId, address registrant, string name);
    event MetaUpdated(bytes32 indexed key, string name, string meta);
    event Verified(bytes32 indexed key, uint256 indexed bountyId);
    event Used(bytes32 indexed component, address indexed childCpu, uint256 indexed childId);
    event Tipped(bytes32 indexed key, address indexed from, address indexed to, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error NotCPU();
    error NotOwner();
    error AlreadyRegistered();
    error UnknownComponent();
    error OnlyArena();

    constructor(address factory_, address owner_) Ownable(owner_) {
        factory = ICircuitFactory(factory_);
    }

    /// @notice 绑定擂台合约（只能设一次，部署后即放弃修改能力）。
    function setArena(address arena_) external onlyOwner {
        require(arena == address(0) && arena_ != address(0), "arena set");
        arena = arena_;
        emit ArenaSet(arena_);
    }

    function keyOf(address cpu, uint256 circuitId) public pure returns (bytes32) {
        return keccak256(abi.encode(cpu, circuitId));
    }

    // ------------------------------------------------------------------ 登记

    /// @notice 电路 NFT 持有人把自己的电路登记成组件。
    function register(address cpu, uint256 circuitId, string calldata name, string calldata meta)
        external returns (bytes32 key)
    {
        if (ICPU(cpu).ownerOf(circuitId) != msg.sender) revert NotOwner();
        key = _register(cpu, circuitId, msg.sender, name, meta);
    }

    /// @notice 擂台冠军自动入库并打上认证。
    function registerVerified(address cpu, uint256 circuitId, address registrant, string calldata name, string calldata meta, uint256 bountyId)
        external returns (bytes32 key)
    {
        if (msg.sender != arena) revert OnlyArena();
        key = keyOf(cpu, circuitId);
        if (_components[key].cpu == address(0)) _register(cpu, circuitId, registrant, name, meta);
        _components[key].verifiedBounty = uint32(bountyId + 1);
        emit Verified(key, bountyId);
    }

    function _register(address cpu, uint256 circuitId, address registrant, string memory name, string memory meta)
        internal returns (bytes32 key)
    {
        if (!factory.isCPU(cpu)) revert NotCPU();
        key = keyOf(cpu, circuitId);
        if (_components[key].cpu != address(0)) revert AlreadyRegistered();
        (uint32 nIn, uint32 nOut,, uint32 gateCount) = ICPU(cpu).circuitInfo(circuitId);
        Component storage c = _components[key];
        c.cpu = cpu;
        c.circuitId = uint64(circuitId);
        c.registeredAt = uint64(block.timestamp);
        c.registrant = registrant;
        c.nIn = nIn;
        c.nOut = nOut;
        c.gateCount = gateCount;
        c.name = name;
        c.meta = meta;
        keys.push(key);
        emit Registered(key, cpu, circuitId, registrant, name);
    }

    /// @notice 组件电路的当前持有人可更新名称与说明。
    function updateMeta(bytes32 key, string calldata name, string calldata meta) external {
        Component storage c = _components[key];
        if (c.cpu == address(0)) revert UnknownComponent();
        if (ICPU(c.cpu).ownerOf(c.circuitId) != msg.sender) revert NotOwner();
        c.name = name;
        c.meta = meta;
        emit MetaUpdated(key, name, meta);
    }

    // ------------------------------------------------------------------ 引用图

    /// @notice 读取下游电路的网表，把它直接引用到的已登记组件各记一次引用。任何人可调，可重复调用。
    /// @return counted 本次新记入的引用数
    function recordUse(address childCpu, uint256 childId) external returns (uint256 counted) {
        if (!factory.isCPU(childCpu)) revert NotCPU();
        bytes32 child = keyOf(childCpu, childId);
        (address[] memory cpus, uint256[] memory ids) = NetlistRefs.refTargets(ICPU(childCpu).netlist(childId));
        for (uint256 i = 0; i < cpus.length; i++) {
            bytes32 k = keyOf(cpus[i], ids[i]);
            if (_components[k].cpu == address(0) || usedBy[k][child]) continue;
            usedBy[k][child] = true;
            _components[k].uses += 1;
            counted += 1;
            emit Used(k, childCpu, childId);
        }
    }

    /// @notice 某电路直接引用到的已登记组件（去重）及其当前持有人，擂台分润用。
    function registeredRefs(address childCpu, uint256 childId)
        external view returns (bytes32[] memory comps, address[] memory owners)
    {
        (address[] memory cpus, uint256[] memory ids) = NetlistRefs.refTargets(ICPU(childCpu).netlist(childId));
        bytes32[] memory tmp = new bytes32[](cpus.length);
        uint256 n = 0;
        for (uint256 i = 0; i < cpus.length; i++) {
            bytes32 k = keyOf(cpus[i], ids[i]);
            if (_components[k].cpu == address(0)) continue;
            bool dup = false;
            for (uint256 j = 0; j < n; j++) if (tmp[j] == k) { dup = true; break; }
            if (!dup) tmp[n++] = k;
        }
        comps = new bytes32[](n);
        owners = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            comps[i] = tmp[i];
            Component storage c = _components[tmp[i]];
            owners[i] = ICPU(c.cpu).ownerOf(c.circuitId);
        }
    }

    // ------------------------------------------------------------------ 打赏

    /// @notice 直接打赏组件作者（转给组件电路 NFT 的当前持有人）。
    function tip(bytes32 key) external payable nonReentrant {
        Component storage c = _components[key];
        if (c.cpu == address(0)) revert UnknownComponent();
        address to = ICPU(c.cpu).ownerOf(c.circuitId);
        (bool ok,) = to.call{value: msg.value, gas: 50_000}("");
        if (!ok) owed[to] += msg.value;
        emit Tipped(key, msg.sender, to, msg.value);
    }

    function withdraw() external nonReentrant {
        uint256 amt = owed[msg.sender];
        require(amt > 0, "nothing owed");
        owed[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amt);
    }

    // ------------------------------------------------------------------ 读取

    function get(bytes32 key) external view returns (Component memory) {
        return _components[key];
    }

    function count() external view returns (uint256) {
        return keys.length;
    }

    function list(uint256 offset, uint256 limit) external view returns (Component[] memory out) {
        uint256 n = keys.length;
        if (offset >= n) return new Component[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        out = new Component[](end - offset);
        for (uint256 i = offset; i < end; i++) out[i - offset] = _components[keys[i]];
    }
}
