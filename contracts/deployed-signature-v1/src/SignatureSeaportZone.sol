// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WiseSignatureAdapter, ISignatureNFT} from "./WiseSignatureAdapter.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

// ABI-compatible Seaport 1.6 zone types (ProjectOpenSea/seaport-types, MIT).
struct SpentItem {
    uint8 itemType;
    address token;
    uint256 identifier;
    uint256 amount;
}

struct ReceivedItem {
    uint8 itemType;
    address token;
    uint256 identifier;
    uint256 amount;
    address payable recipient;
}

struct ZoneParameters {
    bytes32 orderHash;
    address fulfiller;
    address offerer;
    SpentItem[] offer;
    ReceivedItem[] consideration;
    bytes extraData;
    bytes32[] orderHashes;
    uint256 startTime;
    uint256 endTime;
    bytes32 zoneHash;
}

struct Schema {
    uint256 id;
    bytes metadata;
}

/// @notice Unaudited Signature-only validator for canonical Seaport 1.6.
/// @dev Never holds assets or executes transfers. Fee terms are immutable and bound into signed orders.
contract SignatureSeaportZone is WiseSignatureAdapter, Ownable2Step {
    address public constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;
    bytes32 public immutable SEAPORT_CODE_HASH;
    uint256 public immutable FEE_BPS;
    address public immutable FEE_RECIPIENT;
    bool public newActivityPaused = true;
    mapping(uint256 => uint256) public assetEpoch;

    struct Proof {
        uint8 kind;
        address seller;
        uint256 tokenId;
        bytes16 stakeId;
        bytes32 stateHash;
        uint256 epoch;
        uint256 amount;
        uint256 feeBps;
        address feeRecipient;
    }
    error InvalidOrder();
    error Unauthorized();
    error Paused();
    event ActivityPaused(bool paused);
    event AssetEpochUpdated(uint256 indexed tokenId, uint256 epoch);
    event SaleValidated(
        bytes32 indexed orderHash,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 amount,
        uint256 fee,
        uint8 kind
    );

    constructor(
        address nft,
        address wise,
        bytes32 nftHash,
        bytes32 wiseHash,
        bytes32 seaportHash,
        address guardian,
        uint256 feeBps,
        address recipient
    ) WiseSignatureAdapter(nft, wise, nftHash, wiseHash) Ownable(guardian) {
        if (
            SEAPORT.code.length == 0 || SEAPORT.codehash != seaportHash || feeBps > 1000 || recipient == address(0)
                || recipient == address(this) || recipient == SEAPORT
        ) revert InvalidOrder();
        SEAPORT_CODE_HASH = seaportHash;
        FEE_BPS = feeBps;
        FEE_RECIPIENT = recipient;
    }

    function setNewActivityPaused(bool paused) external onlyOwner {
        newActivityPaused = paused;
        emit ActivityPaused(paused);
    }

    function invalidateAsset(uint256 tokenId) external {
        if (ISignatureNFT(collection).ownerOf(tokenId) != msg.sender) revert Unauthorized();
        emit AssetEpochUpdated(tokenId, ++assetEpoch[tokenId]);
    }

    function authorizeOrder(ZoneParameters calldata z) external view returns (bytes4) {
        Proof memory p = _check(z);
        if (ISignatureNFT(collection).ownerOf(p.tokenId) != p.seller) revert InvalidOrder();
        return this.authorizeOrder.selector;
    }

    function validateOrder(ZoneParameters calldata z) external returns (bytes4) {
        Proof memory p = _check(z);
        address buyer = p.kind == 0 ? z.fulfiller : z.offerer;
        if (ISignatureNFT(collection).ownerOf(p.tokenId) != buyer) revert InvalidOrder();
        emit AssetEpochUpdated(p.tokenId, ++assetEpoch[p.tokenId]);
        emit SaleValidated(z.orderHash, p.tokenId, p.seller, buyer, p.amount, p.amount * FEE_BPS / 10_000, p.kind);
        return this.validateOrder.selector;
    }

    function _check(ZoneParameters calldata z) private view returns (Proof memory p) {
        if (msg.sender != SEAPORT || SEAPORT.codehash != SEAPORT_CODE_HASH) revert Unauthorized();
        if (newActivityPaused) revert Paused();
        if (z.extraData.length != 288 || keccak256(z.extraData) != z.zoneHash) revert InvalidOrder();
        p = abi.decode(z.extraData, (Proof));
        if (
            p.kind > 1 || p.amount == 0 || p.amount > type(uint128).max || p.feeBps != FEE_BPS
                || p.feeRecipient != FEE_RECIPIENT || p.seller == address(0) || p.epoch != assetEpoch[p.tokenId]
                || z.offer.length != 1 || z.startTime > block.timestamp || z.endTime <= block.timestamp
                || z.endTime - z.startTime > 30 days
                || (p.kind == 0
                        ? z.offerer != p.seller || z.fulfiller == p.seller
                        : z.fulfiller != p.seller || z.offerer == p.seller)
        ) revert InvalidOrder();
        Snapshot memory s = this.snapshot(p.tokenId);
        if (s.stakeId != p.stakeId || s.stateHash != p.stateHash) revert InvalidOrder();
        uint256 fee = p.amount * FEE_BPS / 10_000;
        if (z.consideration.length != (fee == 0 ? 1 : 2)) revert InvalidOrder();
        SpentItem calldata a = z.offer[0];
        ReceivedItem calldata b = z.consideration[0];
        if (p.kind == 0) {
            if (a.itemType != 2 || a.token != collection || a.identifier != p.tokenId || a.amount != 1) revert InvalidOrder();
            _payment(b, p.seller, p.amount - fee);
        } else {
            if (
                a.itemType != 1 || a.token != WISE || a.identifier != 0 || a.amount != p.amount || b.itemType != 2
                    || b.token != collection || b.identifier != p.tokenId || b.amount != 1 || b.recipient != z.offerer
            ) revert InvalidOrder();
        }
        if (fee != 0) _payment(z.consideration[1], FEE_RECIPIENT, fee);
    }

    function _payment(ReceivedItem calldata item, address recipient, uint256 amount) private view {
        if (
            item.itemType != 1 || item.token != WISE || item.identifier != 0 || item.amount != amount
                || item.recipient != recipient
        ) revert InvalidOrder();
    }

    function getSeaportMetadata() external pure returns (string memory, Schema[] memory schemas) {
        return ("WiseOne Signature stake validator", new Schema[](0));
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7
            || id
                == bytes4(
                    keccak256(
                    "validateOrder((bytes32,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[],bytes,bytes32[],uint256,uint256,bytes32))"
                )
                )
                    ^ bytes4(
                    keccak256(
                    "authorizeOrder((bytes32,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[],bytes,bytes32[],uint256,uint256,bytes32))"
                )
                ) ^ bytes4(keccak256("getSeaportMetadata()"));
    }
}
