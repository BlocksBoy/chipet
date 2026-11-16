// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICPU, ICircuitFactory} from "./interfaces/ITapeOut.sol";

/// @title Chipet · 芯宠
/// @notice 每只宠物绑定一枚 TapeOut 电路。孵化从官方模板池抽取；喂食/玩耍有冷却；对战（Arena）后续迭代。
contract Chipet is ERC721, Ownable, ReentrancyGuard {
    struct Template {
        address cpu;
        uint64 circuitId;
        uint8 rarity; // 0 普通 / 1 稀有 / 2 传说
        uint16 weight;
        bool active;
    }

    struct Pet {
        address cpu;
        uint64 circuitId;
        uint8 rarity;
        uint16 energy; // 0..100
        uint16 mood; // 0..100
        uint32 intimacy;
        uint16 level;
        uint64 lastFeed;
        uint64 lastPlay;
        string name;
    }

    ICircuitFactory public immutable factory;

    Template[] public templates;
    mapping(uint256 => Pet) public pets;
    /// @notice 名字字节哈希 → petId；0 表示未占用。精确匹配（"Q" ≠ "q"）。
    mapping(bytes32 => uint256) public nameToPetId;
    uint256 public nextId = 1;

    uint256 public hatchPrice;
    address public treasury;
    uint64 public feedCooldown = 5 minutes;
    uint64 public playCooldown = 3 minutes;
    uint16 public feedEnergy = 25;
    uint16 public playMood = 20;

    event TemplateAdded(uint256 indexed index, address cpu, uint64 circuitId, uint8 rarity, uint16 weight);
    event TemplateToggled(uint256 indexed index, bool active);
    event Hatched(uint256 indexed petId, address indexed owner, address cpu, uint64 circuitId, uint8 rarity, string name);
    event Fed(uint256 indexed petId, uint16 energy, uint32 intimacy);
    event Played(uint256 indexed petId, uint16 mood, uint32 intimacy);
    event Renamed(uint256 indexed petId, string name);
    event HatchPriceSet(uint256 price);
    event TreasurySet(address treasury);

    error EmptyName();
    error NameTooLong();
    error NameTaken();
    error BadPayment();
    error NoTemplate();
    error NotPetOwner();
    error CoolingDown();
    error BadCpu();
    error BadRarity();
    error BadWeight();

    constructor(address factory_, address treasury_, uint256 hatchPrice_, address owner_)
        ERC721("Chipet", "CHIPET")
        Ownable(owner_)
    {
        factory = ICircuitFactory(factory_);
        treasury = treasury_;
        hatchPrice = hatchPrice_;
    }

    // ─── admin ───────────────────────────────────────────────

    function setHatchPrice(uint256 price) external onlyOwner {
        hatchPrice = price;
        emit HatchPriceSet(price);
    }

    function setTreasury(address t) external onlyOwner {
        treasury = t;
        emit TreasurySet(t);
    }

    function setCooldowns(uint64 feedCd, uint64 playCd) external onlyOwner {
        feedCooldown = feedCd;
        playCooldown = playCd;
    }

    function addTemplate(address cpu, uint64 circuitId, uint8 rarity, uint16 weight) external onlyOwner returns (uint256 index) {
        if (!factory.isCPU(cpu)) revert BadCpu();
        if (rarity > 2) revert BadRarity();
        if (weight == 0) revert BadWeight();
        // 确认电路存在（ownerOf 对未铸造 id 会 revert）
        ICPU(cpu).ownerOf(circuitId);
        templates.push(Template({cpu: cpu, circuitId: circuitId, rarity: rarity, weight: weight, active: true}));
        index = templates.length - 1;
        emit TemplateAdded(index, cpu, circuitId, rarity, weight);
    }

    function toggleTemplate(uint256 index, bool active) external onlyOwner {
        templates[index].active = active;
        emit TemplateToggled(index, active);
    }

    function templateCount() external view returns (uint256) {
        return templates.length;
    }

    // ─── hatch ───────────────────────────────────────────────

    function hatch(string calldata name) external payable nonReentrant returns (uint256 petId) {
        _validateName(name);
        if (msg.value != hatchPrice) revert BadPayment();
        bytes32 key = _nameKey(name);
        if (nameToPetId[key] != 0) revert NameTaken();

        (, Template memory t) = _pick();
        petId = nextId++;
        nameToPetId[key] = petId;
        pets[petId] = Pet({
            cpu: t.cpu,
            circuitId: t.circuitId,
            rarity: t.rarity,
            energy: 80,
            mood: 70,
            intimacy: 0,
            level: 1,
            lastFeed: 0,
            lastPlay: 0,
            name: name
        });
        _safeMint(msg.sender, petId);

        if (msg.value > 0) {
            (bool ok,) = treasury.call{value: msg.value}("");
            require(ok, "treasury");
        }
        emit Hatched(petId, msg.sender, t.cpu, t.circuitId, t.rarity, name);
    }

    // ─── care ────────────────────────────────────────────────

    function feed(uint256 petId) external {
        Pet storage p = _owned(petId);
        if (p.lastFeed != 0 && block.timestamp < uint256(p.lastFeed) + feedCooldown) revert CoolingDown();
        p.lastFeed = uint64(block.timestamp);
        p.energy = _cap100(p.energy + feedEnergy);
        p.intimacy += 1;
        emit Fed(petId, p.energy, p.intimacy);
    }

    function play(uint256 petId) external {
        Pet storage p = _owned(petId);
        if (p.lastPlay != 0 && block.timestamp < uint256(p.lastPlay) + playCooldown) revert CoolingDown();
        p.lastPlay = uint64(block.timestamp);
        p.mood = _cap100(p.mood + playMood);
        if (p.energy >= 5) p.energy -= 5;
        p.intimacy += 1;
        emit Played(petId, p.mood, p.intimacy);
    }

    function rename(uint256 petId, string calldata name) external {
        _validateName(name);
        Pet storage p = _owned(petId);
        bytes32 oldKey = _nameKey(p.name);
        bytes32 newKey = _nameKey(name);
        if (oldKey != newKey) {
            if (nameToPetId[newKey] != 0) revert NameTaken();
            delete nameToPetId[oldKey];
            nameToPetId[newKey] = petId;
        }
        p.name = name;
        emit Renamed(petId, name);
    }

    /// @dev 对战结算预留：仅 owner（后续换成 Arena 合约）可改等级/能量。
    function applyBattle(uint256 petId, bool won, uint16 energyCost) external onlyOwner {
        Pet storage p = pets[petId];
        require(_ownerOf(petId) != address(0), "no pet");
        if (p.energy >= energyCost) p.energy -= energyCost;
        else p.energy = 0;
        if (won) {
            p.level += 1;
            p.intimacy += 3;
            p.mood = _cap100(p.mood + 10);
        } else if (p.mood >= 10) {
            p.mood -= 10;
        }
    }

    // ─── views ───────────────────────────────────────────────

    /// @notice 名字是否可占用（合法长度且未被占用）。精确字节匹配。
    function nameAvailable(string calldata name) external view returns (bool) {
        bytes memory b = bytes(name);
        if (b.length == 0 || b.length > 32) return false;
        return nameToPetId[keccak256(b)] == 0;
    }

    function petOf(uint256 petId) external view returns (Pet memory) {
        require(_ownerOf(petId) != address(0), "no pet");
        return pets[petId];
    }

    function petsOfOwner(address owner_) external view returns (uint256[] memory ids) {
        uint256 n = balanceOf(owner_);
        ids = new uint256[](n);
        uint256 filled;
        for (uint256 id = 1; id < nextId && filled < n; id++) {
            if (_ownerOf(id) == owner_) ids[filled++] = id;
        }
    }

    function geneHint(uint256 petId) external view returns (address cpu, uint64 circuitId, uint8 rarity, uint32 gates, uint32 nIn, uint32 nOut) {
        Pet memory p = pets[petId];
        require(_ownerOf(petId) != address(0), "no pet");
        cpu = p.cpu;
        circuitId = p.circuitId;
        rarity = p.rarity;
        (nIn, nOut,, gates) = ICPU(p.cpu).circuitInfo(p.circuitId);
    }

    // ─── internal ────────────────────────────────────────────

    function _owned(uint256 petId) internal view returns (Pet storage p) {
        if (ownerOf(petId) != msg.sender) revert NotPetOwner();
        p = pets[petId];
    }

    function _nameKey(string memory name) internal pure returns (bytes32) {
        return keccak256(bytes(name));
    }

    function _validateName(string calldata name) internal pure {
        bytes memory b = bytes(name);
        if (b.length == 0) revert EmptyName();
        if (b.length > 32) revert NameTooLong();
    }

    function _cap100(uint16 v) internal pure returns (uint16) {
        return v > 100 ? 100 : v;
    }

    function _pick() internal view returns (uint256 index, Template memory t) {
        uint256 total;
        for (uint256 i; i < templates.length; i++) {
            if (templates[i].active) total += templates[i].weight;
        }
        if (total == 0) revert NoTemplate();
        uint256 roll = uint256(keccak256(abi.encodePacked(block.prevrandao, block.timestamp, msg.sender, nextId))) % total;
        uint256 acc;
        for (uint256 i; i < templates.length; i++) {
            if (!templates[i].active) continue;
            acc += templates[i].weight;
            if (roll < acc) return (i, templates[i]);
        }
        revert NoTemplate();
    }
}
