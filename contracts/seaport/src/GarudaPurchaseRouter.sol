// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

struct OfferItem { uint8 itemType; address token; uint256 identifierOrCriteria; uint256 startAmount; uint256 endAmount; }
struct ConsiderationItem { uint8 itemType; address token; uint256 identifierOrCriteria; uint256 startAmount; uint256 endAmount; address payable recipient; }
struct OrderParameters { address offerer; address zone; OfferItem[] offer; ConsiderationItem[] consideration; uint8 orderType; uint256 startTime; uint256 endTime; bytes32 zoneHash; uint256 salt; bytes32 conduitKey; uint256 totalOriginalConsiderationItems; }
struct AdvancedOrder { OrderParameters parameters; uint120 numerator; uint120 denominator; bytes signature; bytes extraData; }
struct OrderComponents { address offerer; address zone; OfferItem[] offer; ConsiderationItem[] consideration; uint8 orderType; uint256 startTime; uint256 endTime; bytes32 zoneHash; uint256 salt; bytes32 conduitKey; uint256 counter; }
struct CriteriaResolver { uint256 orderIndex; uint8 side; uint256 index; uint256 identifier; bytes32[] criteriaProof; }
interface IPurchaseSeaport {
    function fulfillAdvancedOrder(AdvancedOrder calldata, CriteriaResolver[] calldata, bytes32, address) external payable returns (bool);
    function getCounter(address) external view returns (uint256);
    function getOrderHash(OrderComponents calldata) external view returns (bytes32);
}
interface IPurchaseZone {
    function collection() external view returns (address);
    function WISE() external view returns (address);
    function PAYMENT_SCHEMA_VERSION() external view returns (uint256);
    function SEAPORT_CODE_HASH() external view returns (bytes32);
}
interface IExactOutputRouter {
    function WETH() external view returns (address);
    function factory() external view returns (address);
    function swapETHForExactTokens(uint256, address[] calldata, address, uint256) external payable returns (uint256[] memory);
    function swapTokensForExactTokens(uint256, uint256, address[] calldata, address, uint256) external returns (uint256[] memory);
}
interface IPurchaseWETH { function deposit() external payable; }

/// @notice One atomic payment: obtain the exact listing currency, settle Seaport, deliver the NFT, refund unused input.
/// @dev Fixed protocols, curated tokens, no arbitrary calls, no persistent approvals, no admin or custody between purchases.
contract GarudaPurchaseRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public constant SEAPORT = 0x0000000000000068F116a894984e2DB1123eB395;
    address public constant UNISWAP = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public immutable ZONE;
    address public immutable COLLECTION;
    address public immutable WISE;
    bytes32 public immutable ZONE_CODE_HASH;
    bytes32 public immutable SEAPORT_CODE_HASH;
    bytes32 public immutable UNISWAP_CODE_HASH;
    error InvalidPurchase();
    error RefundFailed();
    event StakePurchased(bytes32 indexed orderHash, address indexed buyer, uint256 indexed tokenId, address inputToken, uint256 inputAmount, address currency, uint256 amount);

    constructor(address zone) {
        if (zone.code.length == 0 || IPurchaseZone(zone).PAYMENT_SCHEMA_VERSION() != 2 ||
            SEAPORT.codehash != IPurchaseZone(zone).SEAPORT_CODE_HASH() || UNISWAP.code.length == 0 ||
            IExactOutputRouter(UNISWAP).WETH() != WETH || IExactOutputRouter(UNISWAP).factory() != 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f)
            revert InvalidPurchase();
        ZONE = zone; COLLECTION = IPurchaseZone(zone).collection(); WISE = IPurchaseZone(zone).WISE();
        ZONE_CODE_HASH = zone.codehash; SEAPORT_CODE_HASH = SEAPORT.codehash; UNISWAP_CODE_HASH = UNISWAP.codehash;
    }
    // Only the fixed Uniswap router may return unused ETH during a swap.
    receive() external payable { if (msg.sender != UNISWAP) revert InvalidPurchase(); }

    function buy(AdvancedOrder calldata order, address inputToken, uint256 maxInput, uint256 deadline)
        external payable nonReentrant returns (uint256 inputSpent)
    {
        (address currency, uint256 amount, uint256 tokenId, bytes32 hash) = _terms(order);
        if (ZONE.codehash != ZONE_CODE_HASH || SEAPORT.codehash != SEAPORT_CODE_HASH || UNISWAP.codehash != UNISWAP_CODE_HASH ||
            deadline < block.timestamp || deadline > block.timestamp + 30 minutes || maxInput == 0 ||
            inputToken == currency || (inputToken != address(0) && !_supported(inputToken)) ||
            (inputToken == address(0) ? msg.value != maxInput : msg.value != 0)) revert InvalidPurchase();
        uint256 ethBefore = address(this).balance - msg.value;
        uint256 outputBefore = IERC20(currency).balanceOf(address(this));
        if (inputToken != address(0)) {
            uint256 beforeInput = IERC20(inputToken).balanceOf(address(this));
            IERC20(inputToken).safeTransferFrom(msg.sender, address(this), maxInput);
            if (IERC20(inputToken).balanceOf(address(this)) != beforeInput + maxInput) revert InvalidPurchase();
        }
        inputSpent = _swap(inputToken, currency, amount, maxInput, deadline);
        if (IERC20(currency).balanceOf(address(this)) != outputBefore + amount) revert InvalidPurchase();
        IERC20(currency).forceApprove(SEAPORT, amount);
        // The zone validates the router as fulfiller; delivery to the user follows within this same transaction.
        if (!IPurchaseSeaport(SEAPORT).fulfillAdvancedOrder(order, new CriteriaResolver[](0), bytes32(0), address(this))) revert InvalidPurchase();
        IERC20(currency).forceApprove(SEAPORT, 0);
        if (IERC20(currency).balanceOf(address(this)) != outputBefore || IERC721(COLLECTION).ownerOf(tokenId) != address(this)) revert InvalidPurchase();
        IERC721(COLLECTION).safeTransferFrom(address(this), msg.sender, tokenId);
        if (inputToken == address(0)) {
            uint256 refund = maxInput - inputSpent;
            if (address(this).balance != ethBefore + refund) revert InvalidPurchase();
            if (refund > 0) { (bool ok,) = msg.sender.call{value: refund}(""); if (!ok) revert RefundFailed(); }
        } else if (maxInput > inputSpent) IERC20(inputToken).safeTransfer(msg.sender, maxInput - inputSpent);
        emit StakePurchased(hash, msg.sender, tokenId, inputToken, inputSpent, currency, amount);
    }
    function _supported(address token) private view returns (bool) { return token == WISE || token == WETH || token == USDC; }
    function _swap(address input, address output, uint256 amount, uint256 maximum, uint256 deadline) private returns (uint256 spent) {
        if (input == address(0) && output == WETH) {
            if (maximum < amount) revert InvalidPurchase();
            IPurchaseWETH(WETH).deposit{value: amount}(); return amount;
        }
        address first = input == address(0) ? WETH : input;
        address[] memory path = new address[](first == WETH || output == WETH ? 2 : 3);
        path[0] = first; path[path.length - 1] = output;
        if (path.length == 3) path[1] = WETH;
        if (input == address(0)) return IExactOutputRouter(UNISWAP).swapETHForExactTokens{value: maximum}(amount, path, address(this), deadline)[0];
        IERC20(input).forceApprove(UNISWAP, maximum);
        spent = IExactOutputRouter(UNISWAP).swapTokensForExactTokens(amount, maximum, path, address(this), deadline)[0];
        IERC20(input).forceApprove(UNISWAP, 0);
        if (spent > maximum) revert InvalidPurchase();
    }
    function _terms(AdvancedOrder calldata order) private view returns (address currency, uint256 amount, uint256 tokenId, bytes32 hash) {
        OrderParameters calldata p = order.parameters;
        if (p.zone != ZONE || p.offerer == msg.sender || p.offerer == address(this) || order.numerator != 1 || order.denominator != 1 ||
            p.orderType != 2 || p.conduitKey != bytes32(0) || p.offer.length != 1 || p.consideration.length == 0 ||
            p.consideration.length > 2 || p.totalOriginalConsiderationItems != p.consideration.length) revert InvalidPurchase();
        OfferItem calldata nft = p.offer[0];
        if (nft.itemType != 2 || nft.token != COLLECTION || nft.startAmount != 1 || nft.endAmount != 1) revert InvalidPurchase();
        tokenId = nft.identifierOrCriteria; currency = p.consideration[0].token;
        if (!_supported(currency)) revert InvalidPurchase();
        for (uint256 i; i < p.consideration.length; ++i) {
            ConsiderationItem calldata item = p.consideration[i];
            if (item.itemType != 1 || item.token != currency || item.identifierOrCriteria != 0 || item.startAmount != item.endAmount ||
                item.recipient == address(this)) revert InvalidPurchase();
            amount += item.startAmount;
        }
        if (amount == 0 || amount > type(uint128).max) revert InvalidPurchase();
        hash = IPurchaseSeaport(SEAPORT).getOrderHash(OrderComponents(p.offerer, p.zone, p.offer, p.consideration, p.orderType, p.startTime,
            p.endTime, p.zoneHash, p.salt, p.conduitKey, IPurchaseSeaport(SEAPORT).getCounter(p.offerer)));
    }
}
