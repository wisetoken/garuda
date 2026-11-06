// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ICollateralAdapter} from "./ICollateralAdapter.sol";

interface ISignatureNFT {
    function NFTStake(uint256 tokenId) external view returns (bytes16);
    function wiseToken() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IWiseStake {
    struct StakeView {
        uint256 shares;
        uint256 principal;
        uint256 reward;
        uint64 startDay;
        uint64 lockDays;
        uint64 finalDay;
        uint64 closeDay;
        uint256 scrapeDay;
        uint256 daiEquivalent;
        uint256 referrerShares;
        address referrer;
        bool active;
    }
    function stakes(address staker, bytes16 stakeId) external view returns (StakeView memory);
    function currentWiseDay() external view returns (uint64);
}

/// @notice Development candidate. Deployment requires qualification of the exact code hashes.
contract WiseSignatureAdapter is ICollateralAdapter {
    uint256 public constant WISE_LAUNCH_TIME = 1_604_966_400;
    address public immutable collection;
    address public immutable WISE;
    bytes32 public immutable COLLECTION_CODE_HASH;
    bytes32 public immutable WISE_CODE_HASH;

    error InvalidCollection();
    error InvalidStake();

    constructor(address nft, address wise, bytes32 expectedNftHash, bytes32 expectedWiseHash) {
        if (
            nft.code.length == 0 || wise.code.length == 0 || nft.codehash != expectedNftHash
                || wise.codehash != expectedWiseHash || ISignatureNFT(nft).wiseToken() != wise
        ) revert InvalidCollection();
        collection = nft;
        WISE = wise;
        COLLECTION_CODE_HASH = expectedNftHash;
        WISE_CODE_HASH = expectedWiseHash;
    }

    function snapshot(uint256 tokenId) external view returns (Snapshot memory result) {
        if (collection.codehash != COLLECTION_CODE_HASH || WISE.codehash != WISE_CODE_HASH) revert InvalidCollection();
        ISignatureNFT(collection).ownerOf(tokenId); // Burned/nonexistent IDs must fail.
        result.stakeId = ISignatureNFT(collection).NFTStake(tokenId);
        IWiseStake.StakeView memory s = IWiseStake(WISE).stakes(collection, result.stakeId);
        if (
            result.stakeId == bytes16(0) || !s.active || s.closeDay != 0 || s.principal == 0 || s.shares == 0
                || s.finalDay != s.startDay + s.lockDays
        ) revert InvalidStake();
        // Rewards and penalties evolve with time. Bind the identity and mutable stake inputs instead.
        result.stateHash = keccak256(
            abi.encode(
                result.stakeId,
                s.startDay,
                s.lockDays,
                s.finalDay,
                s.closeDay,
                s.scrapeDay,
                s.principal,
                s.shares,
                s.active
            )
        );
        result.maturesAt = WISE_LAUNCH_TIME + s.finalDay * 1 days;
        result.loanEligible =
            block.timestamp >= WISE_LAUNCH_TIME + uint256(s.startDay) * 1 days && block.timestamp < result.maturesAt;
    }
}
