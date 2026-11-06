// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Each collection requires its own independently qualified adapter.
interface ICollateralAdapter {
    struct Snapshot {
        bytes16 stakeId;
        bytes32 stateHash;
        uint256 maturesAt;
        bool loanEligible;
    }

    function collection() external view returns (address);
    function snapshot(uint256 tokenId) external view returns (Snapshot memory);
}
