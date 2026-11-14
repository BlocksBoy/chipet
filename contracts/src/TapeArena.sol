// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICPU, ICircuitFactory} from "./interfaces/ITapeOut.sol";
import {ComponentLibrary} from "./ComponentLibrary.sol";

/// @title TapeArena — TapeOut 电路悬赏擂台
/// @notice 出题人托管奖金、写明引脚与测试向量（可附一枚参考电路）；设计者把自己流片的电路
///         提交上来，合约当场调用 TapeOut 处理器的 eval 跑完全部向量，全部通过才入榜，按门数排名
///         （少者胜，同门数先到先得）。挑战期内任何人都能拿一组输入证明某个参赛电路与参考电路
///         不一致，直接取消其资格并拿走它的保证金。截止后结算：协议费 → 国库，分润 → 冠军电路所
///         引用的已登记组件作者，其余 → 冠军；冠军电路自动进入组件库并打上认证。
///         整个评判没有任何链下裁判：正确性与门数都由 TapeOut 电路自己在链上给出。
contract TapeArena is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 1000;     // 协议费上限 10%
    uint16 public constant MAX_ROYALTY_BPS = 3000; // 上游分润上限 30%
    uint256 public constant MAX_VECTORS = 512;
    uint256 public constant MAX_SUBMISSIONS = 200;

    struct Bounty {
        address poster;
        address token;          // address(0) = 原生币（X Layer 上为 OKB）
        uint256 reward;
        uint256 bond;           // 每次提交需缴的保证金（原生币），被挑战成功则归挑战者
        address refCpu;         // 参考电路，可为空；有它才能发起反例挑战
        uint64 refId;
        uint32 nIn;
        uint32 nOut;
        uint32 maxGates;        // 门数上限，0 = 不限
        uint16 royaltyBps;
        uint16 feeBps;          // 发布时锁定的协议费率
        uint16 sampleSize;      // 0 = 提交时跑全部向量；>0 = 只随机抽检这么多条，其余交给挑战期（乐观验证）
        uint64 deadline;        // 提交截止
        uint64 challengeEnd;    // 挑战截止 = 可结算时间
        bool finalized;
        uint32 best;            // 当前最优提交下标 + 1；0 = 暂无
        string meta;            // JSON：标题、题面、引脚名、参考 HDL 等
    }

    struct Submission {
        address solver;
        address cpu;
        uint64 circuitId;
        uint32 gateCount;
        uint64 submittedAt;
        bool disqualified;
        bool bondClaimed;
    }

    ICircuitFactory public immutable factory;
    ComponentLibrary public immutable components;
    address public treasury;
    uint16 public feeBps;

    Bounty[] internal _bounties;
    mapping(uint256 => bytes) internal _vectors;
    mapping(uint256 => Submission[]) internal _subs;
    mapping(uint256 => mapping(bytes32 => bool)) public submitted;   // bounty => 电路 => 已提交
    mapping(address => mapping(address => uint256)) public credit;  // token => 账户 => 可提取

    event BountyCreated(uint256 indexed id, address indexed poster, address token, uint256 reward, uint32 nIn, uint32 nOut, uint64 deadline, uint64 challengeEnd);
    event RewardAdded(uint256 indexed id, address indexed from, uint256 amount);
    event Submitted(uint256 indexed id, uint256 indexed index, address indexed solver, address cpu, uint256 circuitId, uint32 gateCount);
    event LeaderChanged(uint256 indexed id, uint256 index, uint32 gateCount);
    event Challenged(uint256 indexed id, uint256 indexed index, address indexed challenger, bytes input);
    event Finalized(uint256 indexed id, address winner, uint256 winnerIndex, uint256 prize, uint256 royalty, uint256 fee);
    event RoyaltyPaid(uint256 indexed id, bytes32 indexed component, address indexed to, uint256 amount);
    event Cancelled(uint256 indexed id);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event FeeSet(uint16 feeBps, address treasury);

    error BadParams();
    error NotCPU();
    error NotCircuitOwner();
    error PinMismatch();
    error HasState();
    error TooManyGates();
    error Closed();
    error AlreadySubmitted();
    error VectorFailed(uint256 index);
    error BadBond();
    error NotDifferent();
    error NoReference();
    error NotYet();

    constructor(address factory_, address components_, address treasury_, uint16 feeBps_, address owner_) Ownable(owner_) {
        if (feeBps_ > MAX_FEE_BPS || treasury_ == address(0)) revert BadParams();
        factory = ICircuitFactory(factory_);
        components = ComponentLibrary(components_);
        treasury = treasury_;
        feeBps = feeBps_;
    }

    function setFee(uint16 feeBps_, address treasury_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS || treasury_ == address(0)) revert BadParams();
        feeBps = feeBps_;
        treasury = treasury_;
        emit FeeSet(feeBps_, treasury_);
    }

    // ------------------------------------------------------------------ 出题

    struct CreateParams {
        address token;
        uint256 reward;
        uint256 bond;
        address refCpu;
        uint64 refId;
        uint32 nIn;
        uint32 nOut;
        uint32 maxGates;
        uint16 royaltyBps;
        uint16 sampleSize;
        uint64 deadline;
        uint64 challengeWindow;
        bytes vectors; // 每条 = ceil(nIn/8) 字节输入 + ceil(nOut/8) 字节期望输出，位序同 TapeOut
        string meta;
    }

    function createBounty(CreateParams calldata p) external payable nonReentrant returns (uint256 id) {
        if (p.nIn == 0 || p.nOut == 0 || p.nIn > 65536 || p.nOut > 65536) revert BadParams();
        if (p.royaltyBps > MAX_ROYALTY_BPS || p.reward == 0) revert BadParams();
        if (p.deadline <= block.timestamp || p.challengeWindow > 30 days) revert BadParams();
        uint256 w = _inBytes(p.nIn) + _outBytes(p.nOut);
        uint256 n = p.vectors.length / w;
        if (n == 0 || n > MAX_VECTORS || p.vectors.length % w != 0) revert BadParams();

        if (p.refCpu != address(0)) {
            if (!factory.isCPU(p.refCpu)) revert NotCPU();
            (uint32 rIn, uint32 rOut, uint32 rState,) = ICPU(p.refCpu).circuitInfo(p.refId);
            if (rIn != p.nIn || rOut != p.nOut) revert PinMismatch();
            if (rState != 0) revert HasState();
            // 参考电路本身必须通过全部向量，避免题目自相矛盾
            _runVectors(p.refCpu, p.refId, p.vectors, p.nIn, p.nOut);
        }

        _collect(p.token, p.reward);

        id = _bounties.length;
        Bounty storage b = _bounties.push();
        b.poster = msg.sender;
        b.token = p.token;
        b.reward = p.reward;
        b.bond = p.bond;
        b.refCpu = p.refCpu;
        b.refId = p.refId;
        b.nIn = p.nIn;
        b.nOut = p.nOut;
        b.maxGates = p.maxGates;
        b.royaltyBps = p.royaltyBps;
        b.feeBps = feeBps;
        b.sampleSize = p.sampleSize;
        b.deadline = p.deadline;
        b.challengeEnd = p.deadline + p.challengeWindow;
        b.meta = p.meta;
        _vectors[id] = p.vectors;
        emit BountyCreated(id, msg.sender, p.token, p.reward, p.nIn, p.nOut, p.deadline, b.challengeEnd);
    }

    /// @notice 任何人都可以给进行中的擂台加奖金（赞助方、社区加码）。
    function addReward(uint256 id, uint256 amount) external payable nonReentrant {
        Bounty storage b = _bounties[id];
        if (b.finalized || block.timestamp >= b.deadline) revert Closed();
        if (amount == 0) revert BadParams();
        _collect(b.token, amount);
        b.reward += amount;
        emit RewardAdded(id, msg.sender, amount);
    }

    /// @notice 还没有人提交时，出题人可以撤回。
    function cancel(uint256 id) external nonReentrant {
        Bounty storage b = _bounties[id];
        if (msg.sender != b.poster) revert BadParams();
        if (b.finalized || _subs[id].length != 0) revert Closed();
        b.finalized = true;
        credit[b.token][b.poster] += b.reward;
        emit Cancelled(id);
    }

    // ------------------------------------------------------------------ 打擂

    /// @notice 提交自己持有的已流片电路。合约现场跑完全部测试向量。
    function submit(uint256 id, address cpu, uint256 circuitId) external payable nonReentrant returns (uint256 index) {
        Bounty storage b = _bounties[id];
        if (b.finalized || block.timestamp >= b.deadline) revert Closed();
        if (msg.value != b.bond) revert BadBond();
        if (_subs[id].length >= MAX_SUBMISSIONS) revert Closed();
        bytes32 ck = keccak256(abi.encode(cpu, circuitId));
        if (submitted[id][ck]) revert AlreadySubmitted();
        if (ICPU(cpu).ownerOf(circuitId) != msg.sender) revert NotCircuitOwner();

        uint32 gates = _qualify(b, cpu, circuitId);
        _verifyOnSubmit(id, b, cpu, circuitId);

        submitted[id][ck] = true;
        index = _subs[id].length;
        _subs[id].push(Submission({
            solver: msg.sender,
            cpu: cpu,
            circuitId: uint64(circuitId),
            gateCount: gates,
            submittedAt: uint64(block.timestamp),
            disqualified: false,
            bondClaimed: false
        }));
        emit Submitted(id, index, msg.sender, cpu, circuitId, gates);

        if (b.best == 0 || gates < _subs[id][b.best - 1].gateCount) {
            b.best = uint32(index + 1);
            emit LeaderChanged(id, index, gates);
        }
    }

    /// @notice 只读预检：前端在提交前告诉用户能否通过、门数多少。
    function check(uint256 id, address cpu, uint256 circuitId)
        external view returns (bool ok, uint256 failedIndex, uint32 gates, string memory reason)
    {
        Bounty storage b = _bounties[id];
        (gates, reason) = _precheck(b, cpu, circuitId);
        if (bytes(reason).length != 0) return (false, 0, gates, reason);
        (ok, failedIndex) = _tryVectors(cpu, circuitId, _vectors[id], b.nIn, b.nOut);
        if (!ok) reason = "vector failed";
    }

    function _precheck(Bounty storage b, address cpu, uint256 circuitId)
        internal view returns (uint32 gates, string memory reason)
    {
        if (!factory.isCPU(cpu)) return (0, "not a TapeOut processor");
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 g) = ICPU(cpu).circuitInfo(circuitId);
        if (nIn != b.nIn || nOut != b.nOut) return (g, "pin mismatch");
        if (nState != 0) return (g, "sequential circuit");
        if (b.maxGates != 0 && g > b.maxGates) return (g, "too many gates");
        return (g, "");
    }

    /// @notice 反例挑战：给出一组输入，证明某参赛电路与参考电路输出不同。
    function challenge(uint256 id, uint256 index, bytes calldata input) external nonReentrant {
        Bounty storage b = _bounties[id];
        if (b.refCpu == address(0)) revert NoReference();
        if (b.finalized || block.timestamp >= b.challengeEnd) revert Closed();
        Submission storage s = _subs[id][index];
        if (s.disqualified) revert Closed();
        if (input.length != _inBytes(b.nIn)) revert BadParams();

        bytes memory got = ICPU(s.cpu).eval(s.circuitId, input);
        bytes memory want = ICPU(b.refCpu).eval(b.refId, input);
        if (_sameOutputs(got, 0, want, 0, b.nOut)) revert NotDifferent();

        _disqualify(id, b, index, input);
    }

    /// @notice 向量挑战：指出某参赛电路没通过第 vectorIndex 条公开向量（乐观验证模式下未被抽检到的那些）。
    function challengeVector(uint256 id, uint256 index, uint256 vectorIndex) external nonReentrant {
        Bounty storage b = _bounties[id];
        if (b.finalized || block.timestamp >= b.challengeEnd) revert Closed();
        Submission storage s = _subs[id][index];
        if (s.disqualified) revert Closed();
        bytes memory vs = _vectors[id];
        uint256 ib = _inBytes(b.nIn);
        uint256 w = ib + _outBytes(b.nOut);
        if (vectorIndex >= vs.length / w) revert BadParams();
        if (_vectorPasses(s.cpu, s.circuitId, vs, vectorIndex * w, ib, b.nOut)) revert NotDifferent();
        bytes memory input = new bytes(ib);
        for (uint256 k = 0; k < ib; k++) input[k] = vs[vectorIndex * w + k];
        _disqualify(id, b, index, input);
    }

    function _disqualify(uint256 id, Bounty storage b, uint256 index, bytes memory input) internal {
        Submission storage s = _subs[id][index];
        s.disqualified = true;
        s.bondClaimed = true;
        credit[address(0)][msg.sender] += b.bond;
        emit Challenged(id, index, msg.sender, input);
        if (b.best == index + 1) _recomputeBest(id, b);
    }

    // ------------------------------------------------------------------ 结算

    function finalize(uint256 id) external nonReentrant {
        Bounty storage b = _bounties[id];
        if (b.finalized) revert Closed();
        if (block.timestamp < b.challengeEnd) revert NotYet();
        b.finalized = true;

        if (b.best == 0) {
            credit[b.token][b.poster] += b.reward;
            emit Finalized(id, address(0), 0, 0, 0, 0);
            return;
        }

        uint256 wi = b.best - 1;
        Submission storage w = _subs[id][wi];
        uint256 fee = b.reward * b.feeBps / 10_000;
        uint256 pool = b.reward * b.royaltyBps / 10_000;
        uint256 royaltyPaid = 0;

        if (pool > 0) {
            (bytes32[] memory comps, address[] memory owners) = components.registeredRefs(w.cpu, w.circuitId);
            if (owners.length > 0) {
                uint256 each = pool / owners.length;
                for (uint256 i = 0; i < owners.length; i++) {
                    credit[b.token][owners[i]] += each;
                    emit RoyaltyPaid(id, comps[i], owners[i], each);
                }
                royaltyPaid = each * owners.length;
            }
        }

        uint256 prize = b.reward - fee - royaltyPaid;
        credit[b.token][treasury] += fee;
        // 奖金发给冠军电路的当前持有人（流片 NFT 可在挑战期内转让给团队金库等）
        address winner = ICPU(w.cpu).ownerOf(w.circuitId);
        credit[b.token][winner] += prize;
        emit Finalized(id, winner, wi, prize, royaltyPaid, fee);

        try components.registerVerified(w.cpu, w.circuitId, w.solver, _winnerName(id), b.meta, id) {} catch {}
    }

    /// @notice 未被取消资格的提交在结算后取回保证金。
    function claimBond(uint256 id, uint256 index) external nonReentrant {
        Bounty storage b = _bounties[id];
        if (!b.finalized) revert NotYet();
        Submission storage s = _subs[id][index];
        if (s.bondClaimed) revert Closed();
        s.bondClaimed = true;
        credit[address(0)][s.solver] += b.bond;
    }

    function withdraw(address token) external nonReentrant {
        uint256 amt = credit[token][msg.sender];
        require(amt > 0, "nothing to withdraw");
        credit[token][msg.sender] = 0;
        if (token == address(0)) {
            (bool ok,) = msg.sender.call{value: amt}("");
            require(ok, "withdraw failed");
        } else {
            IERC20(token).safeTransfer(msg.sender, amt);
        }
        emit Withdrawn(token, msg.sender, amt);
    }

    // ------------------------------------------------------------------ 读取

    function bountyCount() external view returns (uint256) { return _bounties.length; }
    function getBounty(uint256 id) external view returns (Bounty memory) { return _bounties[id]; }
    function vectorsOf(uint256 id) external view returns (bytes memory) { return _vectors[id]; }
    function submissionCount(uint256 id) external view returns (uint256) { return _subs[id].length; }
    function getSubmissions(uint256 id) external view returns (Submission[] memory) { return _subs[id]; }

    // ------------------------------------------------------------------ 内部

    function _qualify(Bounty storage b, address cpu, uint256 circuitId) internal view returns (uint32 gates) {
        if (!factory.isCPU(cpu)) revert NotCPU();
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 g) = ICPU(cpu).circuitInfo(circuitId);
        if (nIn != b.nIn || nOut != b.nOut) revert PinMismatch();
        if (nState != 0) revert HasState();
        if (b.maxGates != 0 && g > b.maxGates) revert TooManyGates();
        return g;
    }

    function _runVectors(address cpu, uint256 circuitId, bytes memory vs, uint32 nIn, uint32 nOut) internal view {
        (bool ok, uint256 idx) = _tryVectors(cpu, circuitId, vs, nIn, nOut);
        if (!ok) revert VectorFailed(idx);
    }

    function _tryVectors(address cpu, uint256 circuitId, bytes memory vs, uint32 nIn, uint32 nOut)
        internal view returns (bool, uint256)
    {
        uint256 ib = _inBytes(nIn);
        uint256 w = ib + _outBytes(nOut);
        uint256 n = vs.length / w;
        for (uint256 i = 0; i < n; i++) {
            if (!_vectorPasses(cpu, circuitId, vs, i * w, ib, nOut)) return (false, i);
        }
        return (true, 0);
    }

    function _vectorPasses(address cpu, uint256 circuitId, bytes memory vs, uint256 o, uint256 ib, uint32 nOut)
        internal view returns (bool)
    {
        bytes memory input = new bytes(ib);
        for (uint256 k = 0; k < ib; k++) input[k] = vs[o + k];
        bytes memory got = ICPU(cpu).eval(circuitId, input);
        return _sameOutputs(got, 0, vs, o + ib, nOut);
    }

    /// @dev 全量或抽检。抽检下标由 prevrandao 与提交者、电路共同决定，提交前无法预知会抽到哪几条。
    function _verifyOnSubmit(uint256 id, Bounty storage b, address cpu, uint256 circuitId) internal view {
        bytes memory vs = _vectors[id];
        uint256 ib = _inBytes(b.nIn);
        uint256 w = ib + _outBytes(b.nOut);
        uint256 n = vs.length / w;
        if (b.sampleSize == 0 || b.sampleSize >= n) {
            _runVectors(cpu, circuitId, vs, b.nIn, b.nOut);
            return;
        }
        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, msg.sender, cpu, circuitId, id)));
        for (uint256 j = 0; j < b.sampleSize; j++) {
            uint256 vi = uint256(keccak256(abi.encode(seed, j))) % n;
            if (!_vectorPasses(cpu, circuitId, vs, vi * w, ib, b.nOut)) revert VectorFailed(vi);
        }
    }

    /// @dev 比较前 nOut 位（位打包小端），忽略末字节的填充位。
    function _sameOutputs(bytes memory a, uint256 ao, bytes memory b, uint256 bo, uint32 nOut) internal pure returns (bool) {
        uint256 full = nOut / 8;
        for (uint256 k = 0; k < full; k++) {
            if (_byteAt(a, ao + k) != _byteAt(b, bo + k)) return false;
        }
        uint256 rem = nOut % 8;
        if (rem != 0) {
            uint8 mask = uint8((1 << rem) - 1);
            if ((_byteAt(a, ao + full) & mask) != (_byteAt(b, bo + full) & mask)) return false;
        }
        return true;
    }

    function _byteAt(bytes memory a, uint256 i) private pure returns (uint8) {
        return i < a.length ? uint8(a[i]) : 0;
    }

    function _recomputeBest(uint256 id, Bounty storage b) internal {
        Submission[] storage subs = _subs[id];
        uint32 best = 0;
        for (uint256 i = 0; i < subs.length; i++) {
            if (subs[i].disqualified) continue;
            if (best == 0 || subs[i].gateCount < subs[best - 1].gateCount) best = uint32(i + 1);
        }
        b.best = best;
        if (best != 0) emit LeaderChanged(id, best - 1, subs[best - 1].gateCount);
    }

    function _collect(address token, uint256 amount) internal {
        if (token == address(0)) {
            if (msg.value != amount) revert BadParams();
        } else {
            if (msg.value != 0) revert BadParams();
            uint256 before = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
            if (IERC20(token).balanceOf(address(this)) - before != amount) revert BadParams(); // 不支持转账扣税代币
        }
    }

    function _winnerName(uint256 id) internal pure returns (string memory) {
        return string.concat("Arena #", _itoa(id), " champion");
    }

    function _itoa(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory s = new bytes(len);
        for (; v != 0; v /= 10) s[--len] = bytes1(uint8(48 + v % 10));
        return string(s);
    }

    function _inBytes(uint32 n) private pure returns (uint256) { return (uint256(n) + 7) / 8; }
    function _outBytes(uint32 n) private pure returns (uint256) { return (uint256(n) + 7) / 8; }
}
