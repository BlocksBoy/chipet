// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

interface IOpener {
    function FEE() external view returns (uint256);
    function accountOf(address circuits, uint256 id) external view returns (address);
    function isDeployed(address circuits, uint256 id) external view returns (bool);
    function open(address circuits, uint256 id) external payable returns (address);
}

interface ISiteRegistry {
    function fileInfo(address c, string calldata path) external view returns (uint32, string memory, bytes32, uint40, uint256);
    function paths(address c) external view returns (string[] memory);
    function fallbackPath(address c) external view returns (string memory);
    function putFile(address c, string calldata path, string calldata contentType, bytes32 sha256Hash, bytes calldata data) external;
    function appendChunk(address c, string calldata path, uint256 expectIndex, bytes calldata data) external;
    function removeFile(address c, string calldata path) external;
    function setFallback(address c, string calldata path) external;
}

interface IDomainBinding {
    function monthlyFee() external view returns (uint256);
    function isContainerLive(address c) external view returns (bool);
    function bind(string calldata name, address c, uint256 months) external payable;
}

/// @notice 把 deweb-pack.ts 切好的前端发布成 X Layer 链上网站 tape://<#ID>.<处理器编号>.tape。
/// 只上传哈希有变化的文件，删掉旧版本留下的文件，可重复运行。签名钱包必须持有该电路 NFT。
///   forge script script/PublishSite.s.sol --rpc-url xlayer --broadcast --slow --account <keystore> --sender <持有人>
/// 可选环境变量：MONTHS（激活月数，默认 12）、KEEP_OLD=1（不删旧文件）
contract PublishSite is Script {
    IOpener constant OPENER = IOpener(0x536adD8F30f03b69f6fbF29d425A816A0dC50106);
    ISiteRegistry constant REGISTRY = ISiteRegistry(0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6);
    IDomainBinding constant BINDING = IDomainBinding(0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9);
    string constant ENTRY = "index.html";

    function run() external {
        string memory m = vm.readFile("./deweb/manifest.json");
        address circuits = vm.parseJsonAddress(m, ".circuits");
        uint256 id = vm.parseJsonUint(m, ".id");
        string memory name = vm.parseJsonString(m, ".name");
        string[] memory paths = vm.parseJsonStringArray(m, ".paths");
        string[] memory types = vm.parseJsonStringArray(m, ".types");
        bytes32[] memory hashes = vm.parseJsonBytes32Array(m, ".hashes");
        uint256[] memory chunks = vm.parseJsonUintArray(m, ".chunks");
        address container = OPENER.accountOf(circuits, id);

        vm.startBroadcast();
        if (!OPENER.isDeployed(circuits, id)) OPENER.open{value: OPENER.FEE()}(circuits, id);

        for (uint256 f = 0; f < paths.length; f++) {
            (,, bytes32 h,, uint256 n) = REGISTRY.fileInfo(container, paths[f]);
            if (h == hashes[f] && n == chunks[f]) continue;
            REGISTRY.putFile(container, paths[f], types[f], hashes[f], _chunk(f, 0));
            for (uint256 c = 1; c < chunks[f]; c++) REGISTRY.appendChunk(container, paths[f], c, _chunk(f, c));
            console2.log("uploaded", paths[f]);
        }

        if (!vm.envOr("KEEP_OLD", false)) {
            string[] memory onchain = REGISTRY.paths(container);
            for (uint256 i = 0; i < onchain.length; i++) {
                if (!_contains(paths, onchain[i])) {
                    REGISTRY.removeFile(container, onchain[i]);
                    console2.log("removed ", onchain[i]);
                }
            }
        }

        if (keccak256(bytes(REGISTRY.fallbackPath(container))) != keccak256(bytes(ENTRY))) REGISTRY.setFallback(container, ENTRY);

        if (!_live(container)) {
            uint256 months = vm.envOr("MONTHS", uint256(12));
            BINDING.bind{value: months * BINDING.monthlyFee()}(name, container, months);
        }
        vm.stopBroadcast();

        console2.log("container", container);
        console2.log(string.concat("site      tape://", name));
    }

    function _chunk(uint256 f, uint256 c) internal view returns (bytes memory) {
        return vm.readFileBinary(string.concat("./deweb/", vm.toString(f), "-", vm.toString(c), ".bin"));
    }

    function _live(address container) internal view returns (bool) {
        try BINDING.isContainerLive(container) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    function _contains(string[] memory list, string memory s) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) {
            if (keccak256(bytes(list[i])) == keccak256(bytes(s))) return true;
        }
        return false;
    }
}
