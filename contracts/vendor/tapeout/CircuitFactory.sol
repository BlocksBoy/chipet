// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {Transistors} from "./Transistors.sol";
import {Circuits} from "./Circuits.sol";

/// @title CircuitFactory — 唯一的工厂，用 BeaconProxy 克隆每台 CPU（技术文档 §2/§5）。
/// @notice 工厂自身 UUPS 可升级；两个 UpgradeableBeacon 已放弃所有权（freezeBeacons），
///         所有已部署 CPU 的晶体管/电路代码永久固定，任何人都改不了。
///
///         封印 seal()：一条指令放弃所有管理权 —— 冻结信标 + renounceOwnership() + isSealed=true，
///         此后工厂自身升级以及所有费率 setter 全部永久失效。
///         工厂变无主、逻辑冻结、永不可改。这是把"没人能改"变成链上可验证事实的唯一办法。
///         未来需要新元件：部署 v2 工厂与 v1 并存，旧的永远不变。
contract CircuitFactory is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    UpgradeableBeacon public transistorBeacon;
    UpgradeableBeacon public circuitBeacon;

    address public protocolWallet; // 协议收款钱包
    uint256 public deployFee;      // 创建一台 CPU 的费用
    uint256 public protocolFee;    // 每笔 mint 的协议费（传入每台 CPU 克隆）

    bool public isSealed;            // 一旦为 true，一切管理权限永久失效

    address[] public cpus;         // 所有 CPU（Circuits 地址）
    mapping(address => bool) public isCPU; // REF 白名单：本工厂登记过的 Circuits 克隆（审计 H-2）
    mapping(address => uint256) public owed; // 拉取式分账（deployFee 记给协议钱包，多付退回买家；审计 M-1）

    event CPUCreated(address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice);
    event Sealed();
    event Withdrawn(address indexed to, uint256 amount);
    event DeployFeeSet(uint256 value);
    event ProtocolFeeSet(uint256 value);
    event ProtocolWalletSet(address value);

    modifier notSealed() { require(!isSealed, "isSealed: immutable forever"); _; }

    // 极简可升级安全的重入锁（审计二轮 R2-2 对称性/纵深防御）。_entered 声明在合约末尾（append-only）。
    modifier nonReentrant() {
        require(_entered != 2, "reentrant");
        _entered = 2;
        _;
        _entered = 1;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    function initialize(
        address owner_,
        address transistorImpl,
        address circuitImpl,
        address protocolWallet_,
        uint256 deployFee_,
        uint256 protocolFee_
    ) external initializer {
        __Ownable_init(owner_);
        transistorBeacon = new UpgradeableBeacon(transistorImpl, address(this));
        circuitBeacon = new UpgradeableBeacon(circuitImpl, address(this));
        protocolWallet = protocolWallet_;
        deployFee = deployFee_;
        protocolFee = protocolFee_;
    }

    // ------------------------------------------------------------------ 创建 CPU

    function createCPU(
        string calldata name,
        string calldata symbol,
        string calldata story,
        uint256 transistorSupply,
        uint256 mintPrice
    ) external payable returns (address transistorsAddr, address circuitsAddr) {
        require(msg.value >= deployFee, "deploy fee");

        transistorsAddr = address(new BeaconProxy(address(transistorBeacon), ""));
        circuitsAddr = address(new BeaconProxy(address(circuitBeacon), ""));

        Transistors(transistorsAddr).initialize(
            name, symbol, story, msg.sender, transistorSupply, mintPrice, protocolWallet, protocolFee, circuitsAddr
        );
        Circuits(circuitsAddr).initialize(name, symbol, transistorsAddr, address(this));

        cpus.push(circuitsAddr);
        isCPU[circuitsAddr] = true; // 登记，供 REF 白名单校验（审计 H-2）

        // 拉取式分账：deployFee 记给协议钱包，多付退回买家（审计 M-1/L-6，避免 push 卡死）
        owed[protocolWallet] += deployFee;
        uint256 refund = msg.value - deployFee;
        if (refund > 0) owed[msg.sender] += refund;

        emit CPUCreated(circuitsAddr, transistorsAddr, msg.sender, name, transistorSupply, mintPrice);
    }

    /// @notice 提取应得余额（拉取式）。CEI + 重入锁双保险。
    function withdraw() external nonReentrant {
        uint256 amt = owed[msg.sender];
        require(amt > 0, "nothing owed");
        owed[msg.sender] = 0; // effects before interaction
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "withdraw failed");
        emit Withdrawn(msg.sender, amt);
    }

    function cpuCount() external view returns (uint256) { return cpus.length; }
    function cpuAt(uint256 i) external view returns (address) { return cpus[i]; }

    // ------------------------------------------------------------------ 冻结已建成的处理器
    //
    //  这里原来是 upgradeTransistors / upgradeCircuits。全网处理器共用这两个信标，所以那两个
    //  函数等于「随时改写每一台已建成处理器的代码」。现在删掉它们，并放弃两个信标的所有权：
    //  BeaconProxy 的信标地址是 immutable（刻在每台处理器的字节码里），信标又已无主，
    //  此后所有处理器的代码永久固定，owner、多签、工厂自己，谁都改不了。
    //  工厂本身仍可升级，但改不了任何已建成处理器的代码。唯一的残留：已建成的电路合约在验证
    //  跨处理器引用（REF）时会查工厂的 isCPU 官方名单，所以将来的工厂升级仍可能影响
    //  「新的跨处理器引用能否流片」；已有电路、余额、转账、铸造、提现都不受影响。

    event BeaconFrozen(address indexed beacon);

    /// @notice 放弃两个信标的所有权，永久冻结所有处理器的代码。不可撤销。
    ///         上线时经 upgradeToAndCall 与升级放在同一笔交易里执行；可重复调用，已冻结的直接跳过。
    function freezeBeacons() external onlyOwner {
        _freezeBeacons();
    }

    function _freezeBeacons() private {
        _freeze(transistorBeacon);
        _freeze(circuitBeacon);
    }

    function _freeze(UpgradeableBeacon beacon) private {
        if (beacon.owner() == address(0)) return; // 已冻结
        beacon.renounceOwnership(); // 主人若不是本工厂会直接 revert，绝不静默跳过
        emit BeaconFrozen(address(beacon));
    }

    function setDeployFee(uint256 v) external onlyOwner notSealed { deployFee = v; emit DeployFeeSet(v); }
    function setProtocolFee(uint256 v) external onlyOwner notSealed { protocolFee = v; emit ProtocolFeeSet(v); }
    function setProtocolWallet(address v) external onlyOwner notSealed { protocolWallet = v; emit ProtocolWalletSet(v); }

    // ------------------------------------------------------------------ 一键放弃所有管理权

    /// @notice 放弃一切控制权，永久冻结。执行后不可撤销。
    function seal() external onlyOwner {
        // 先冻结信标。否则封印后 owner 归零，信标就永远挂在工厂名下：虽然已无人能动，
        // 但外界从链上读到 beacon.owner() 非零，无法确认处理器已冻结。
        _freezeBeacons();
        isSealed = true;
        renounceOwnership(); // owner 归零；此后所有 onlyOwner 函数（含升级）不可达
        emit Sealed();
    }

    /// @dev UUPS 升级鉴权：仅 owner，且未封印。封印后 owner=0 且 notSealed 双重锁死。
    function _authorizeUpgrade(address) internal override onlyOwner notSealed {}

    // ---- 追加式存储（append-only，审计二轮 R2-1）----
    uint256 private _entered; // 重入锁存储槽（R2-2）
    /// @dev 预留存储槽，供开发期升级新增状态变量而不错位（审计 L-3）。
    uint256[43] private __gap;
}
