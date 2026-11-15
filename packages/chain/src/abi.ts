import { parseAbi } from 'viem';

export const cpuAbi = parseAbi([
  'function eval(uint256 circuitId, bytes inputs) view returns (bytes)',
  'function step(uint256 circuitId, bytes state, bytes inputs) view returns (bytes newState, bytes outputs)',
  'function circuitInfo(uint256 circuitId) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)',
  'function netlist(uint256 circuitId) view returns (bytes)',
  'function transistors() view returns (address)',
  'function nextId() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function name() view returns (string)',
  'function TAPEOUT_FEE() view returns (uint256)',
  'function tapeout(bytes nl, uint32 nIn, uint32 nOut) payable returns (uint256)',
  'event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState)',
]);

export const transistorsAbi = parseAbi([
  // X Layer 主网已升级：mint 用 BEM（ERC20）支付，需先 approve 给本合约
  'function mint(uint256 id, uint256 amount)',
  'function BEM() view returns (address)',
  'function mintPrice() view returns (uint256)',
  'function protocolFee() view returns (uint256)',
  'function supplyCap() view returns (uint256)',
  'function minted() view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function cpuName() view returns (string)',
  'function creator() view returns (address)',
]);

export const factoryAbi = parseAbi([
  'function isCPU(address) view returns (bool)',
  'function cpuCount() view returns (uint256)',
  'function cpuAt(uint256 i) view returns (address)',
  'function deployFee() view returns (uint256)',
  // deployFee 以 BEM 支付，需先 approve 给工厂
  'function createCPU(string name, string symbol, string story, uint256 transistorSupply, uint256 mintPrice) returns (address transistorsAddr, address circuitsAddr)',
  'function bem() view returns (address)',
  'event CPUCreated(address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice)',
]);

const bountyTuple =
  '(address poster, address token, uint256 reward, uint256 bond, address refCpu, uint64 refId, uint32 nIn, uint32 nOut, uint32 maxGates, uint16 royaltyBps, uint16 feeBps, uint16 sampleSize, uint64 deadline, uint64 challengeEnd, bool finalized, uint32 best, string meta)';
const submissionTuple =
  '(address solver, address cpu, uint64 circuitId, uint32 gateCount, uint64 submittedAt, bool disqualified, bool bondClaimed)';
const createTuple =
  '(address token, uint256 reward, uint256 bond, address refCpu, uint64 refId, uint32 nIn, uint32 nOut, uint32 maxGates, uint16 royaltyBps, uint16 sampleSize, uint64 deadline, uint64 challengeWindow, bytes vectors, string meta)';

export const arenaAbi = parseAbi([
  `function createBounty(${createTuple} p) payable returns (uint256 id)`,
  'function addReward(uint256 id, uint256 amount) payable',
  'function cancel(uint256 id)',
  'function submit(uint256 id, address cpu, uint256 circuitId) payable returns (uint256 index)',
  'function check(uint256 id, address cpu, uint256 circuitId) view returns (bool ok, uint256 failedIndex, uint32 gates, string reason)',
  'function challenge(uint256 id, uint256 index, bytes input)',
  'function challengeVector(uint256 id, uint256 index, uint256 vectorIndex)',
  'function finalize(uint256 id)',
  'function claimBond(uint256 id, uint256 index)',
  'function withdraw(address token)',
  'function credit(address token, address account) view returns (uint256)',
  'function bountyCount() view returns (uint256)',
  `function getBounty(uint256 id) view returns (${bountyTuple})`,
  'function vectorsOf(uint256 id) view returns (bytes)',
  'function submissionCount(uint256 id) view returns (uint256)',
  `function getSubmissions(uint256 id) view returns (${submissionTuple}[])`,
  'function feeBps() view returns (uint16)',
  'function treasury() view returns (address)',
  'event BountyCreated(uint256 indexed id, address indexed poster, address token, uint256 reward, uint32 nIn, uint32 nOut, uint64 deadline, uint64 challengeEnd)',
  'event Submitted(uint256 indexed id, uint256 indexed index, address indexed solver, address cpu, uint256 circuitId, uint32 gateCount)',
  'event Challenged(uint256 indexed id, uint256 indexed index, address indexed challenger, bytes input)',
  'event Finalized(uint256 indexed id, address winner, uint256 winnerIndex, uint256 prize, uint256 royalty, uint256 fee)',
  'error BadParams()',
  'error NotCPU()',
  'error NotCircuitOwner()',
  'error PinMismatch()',
  'error HasState()',
  'error TooManyGates()',
  'error Closed()',
  'error AlreadySubmitted()',
  'error VectorFailed(uint256 index)',
  'error BadBond()',
  'error NotDifferent()',
  'error NoReference()',
  'error NotYet()',
]);

const componentTuple =
  '(address cpu, uint64 circuitId, uint64 registeredAt, address registrant, uint32 nIn, uint32 nOut, uint32 gateCount, uint32 uses, uint32 verifiedBounty, string name, string meta)';

export const libraryAbi = parseAbi([
  'function register(address cpu, uint256 circuitId, string name, string meta) returns (bytes32)',
  'function updateMeta(bytes32 key, string name, string meta)',
  'function recordUse(address childCpu, uint256 childId) returns (uint256)',
  'function registeredRefs(address childCpu, uint256 childId) view returns (bytes32[] comps, address[] owners)',
  'function tip(bytes32 key) payable',
  'function keyOf(address cpu, uint256 circuitId) pure returns (bytes32)',
  `function get(bytes32 key) view returns (${componentTuple})`,
  'function count() view returns (uint256)',
  `function list(uint256 offset, uint256 limit) view returns (${componentTuple}[])`,
  'error NotCPU()',
  'error NotOwner()',
  'error AlreadyRegistered()',
  'error UnknownComponent()',
  'error OnlyArena()',
]);

const chipetPetTuple =
  '(address cpu, uint64 circuitId, uint8 rarity, uint16 energy, uint16 mood, uint32 intimacy, uint16 level, uint64 lastFeed, uint64 lastPlay, string name)';

export const chipetAbi = parseAbi([
  'function hatch(string name) payable returns (uint256 petId)',
  'function feed(uint256 petId)',
  'function play(uint256 petId)',
  'function rename(uint256 petId, string name)',
  'function hatchPrice() view returns (uint256)',
  'function feedCooldown() view returns (uint64)',
  'function playCooldown() view returns (uint64)',
  'function nextId() view returns (uint256)',
  'function templateCount() view returns (uint256)',
  'function addTemplate(address cpu, uint64 circuitId, uint8 rarity, uint16 weight) returns (uint256 index)',
  `function petOf(uint256 petId) view returns (${chipetPetTuple})`,
  'function petsOfOwner(address owner) view returns (uint256[])',
  'function geneHint(uint256 petId) view returns (address cpu, uint64 circuitId, uint8 rarity, uint32 gates, uint32 nIn, uint32 nOut)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Hatched(uint256 indexed petId, address indexed owner, address cpu, uint64 circuitId, uint8 rarity, string name)',
  'event Fed(uint256 indexed petId, uint16 energy, uint32 intimacy)',
  'event Played(uint256 indexed petId, uint16 mood, uint32 intimacy)',
]);

export const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);
