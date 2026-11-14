// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice TapeOut 处理器（Circuits 合约）的永久接口，签名与链上 ICPU 一致。
interface ICPU {
    function eval(uint256 circuitId, bytes calldata inputs) external view returns (bytes memory outputs);
    function step(uint256 circuitId, bytes calldata state, bytes calldata inputs)
        external view returns (bytes memory newState, bytes memory outputs);
    function circuitInfo(uint256 circuitId)
        external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
    function netlist(uint256 circuitId) external view returns (bytes memory);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice TapeOut 工厂：isCPU 是官方登记的处理器名单。
interface ICircuitFactory {
    function isCPU(address) external view returns (bool);
}
