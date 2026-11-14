// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice 扫描 TapeOut 网表里直接引用（REF）的电路，字节格式同链上 NetlistVM：
///         NAND 0x00 + 6 字节 / LATCH 0x01 + 3 字节 / REF 0x02 + addr20 + u64 + rIn + rOut + rIn×u24。
library NetlistRefs {
    function refTargets(bytes memory nl) internal pure returns (address[] memory cpus, uint256[] memory ids) {
        uint256 n = 0;
        uint256 p = 0;
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            p += 1;
            if (op == 0x00) p += 6;
            else if (op == 0x01) p += 3;
            else if (op == 0x02) { require(p + 30 <= nl.length, "netlist: truncated"); p += 30 + uint256(uint8(nl[p + 28])) * 3; n += 1; }
            else revert("netlist: bad opcode");
        }
        require(p == nl.length, "netlist: truncated");
        cpus = new address[](n);
        ids = new uint256[](n);
        p = 0;
        uint256 i = 0;
        while (p < nl.length) {
            uint8 op = uint8(nl[p]);
            p += 1;
            if (op == 0x00) p += 6;
            else if (op == 0x01) p += 3;
            else {
                uint256 a = 0;
                for (uint256 k = 0; k < 20; k++) a = (a << 8) | uint8(nl[p + k]);
                uint256 c = 0;
                for (uint256 k = 0; k < 8; k++) c = (c << 8) | uint8(nl[p + 20 + k]);
                cpus[i] = address(uint160(a));
                ids[i] = c;
                p += 30 + uint256(uint8(nl[p + 28])) * 3;
                i += 1;
            }
        }
    }
}
