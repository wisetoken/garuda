// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IWiseStake} from "../src/WiseSignatureAdapter.sol";
import {SignatureSeaportZone, ZoneParameters, SpentItem, ReceivedItem} from "../src/SignatureSeaportZone.sol";

interface ZoneVm {
    function etch(address, bytes calldata) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
}

contract ZoneWiseMock {
    uint256 public shares = 100;

    function change() external {
        shares = 99;
    }

    function stakes(address, bytes16) external view returns (IWiseStake.StakeView memory s) {
        s.shares = shares;
        s.principal = 1000;
        s.startDay = 1;
        s.lockDays = 365;
        s.finalDay = 366;
        s.active = true;
    }
}

contract ZoneNFTMock is ERC721 {
    address public immutable wiseToken;

    constructor(address w) ERC721("Signature", "SIG") {
        wiseToken = w;
    }

    function NFTStake(uint256) external pure returns (bytes16) {
        return bytes16(uint128(1));
    }

    function mint(address to) external {
        _mint(to, 1);
    }
}

contract SignatureSeaportZoneTest {
    ZoneVm constant vm = ZoneVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant sea = 0x0000000000000068F116a894984e2DB1123eB395;
    address constant seller = address(0x1111);
    address constant buyer = address(0x2222);
    address constant treasury = address(0x3333);
    ZoneNFTMock nft;
    ZoneWiseMock wise;
    SignatureSeaportZone zone;

    function setUp() public {
        vm.warp(1_792_000_000);
        vm.etch(sea, hex"00");
        wise = new ZoneWiseMock();
        nft = new ZoneNFTMock(address(wise));
        nft.mint(seller);
        zone = new SignatureSeaportZone(
            address(nft),
            address(wise),
            address(nft).codehash,
            address(wise).codehash,
            sea.codehash,
            address(this),
            50,
            treasury
        );
        zone.setNewActivityPaused(false);
        vm.prank(seller);
        nft.approve(sea, 1);
    }

    function parameters(uint8 kind, uint256 amount) internal view returns (ZoneParameters memory z) {
        z.orderHash = bytes32(uint256(17));
        z.fulfiller = kind == 0 ? buyer : seller;
        z.offerer = kind == 0 ? seller : buyer;
        uint256 fee = amount * 50 / 10_000;
        z.offer = new SpentItem[](1);
        z.consideration = new ReceivedItem[](fee == 0 ? 1 : 2);
        z.offer[0] = kind == 0 ? SpentItem(2, address(nft), 1, 1) : SpentItem(1, address(wise), 0, amount);
        z.consideration[0] = kind == 0
            ? ReceivedItem(1, address(wise), 0, amount - fee, payable(seller))
            : ReceivedItem(2, address(nft), 1, 1, payable(buyer));
        if (fee != 0) z.consideration[1] = ReceivedItem(1, address(wise), 0, fee, payable(treasury));
        z.extraData = abi.encode(
            kind,
            seller,
            uint256(1),
            bytes16(uint128(1)),
            zone.snapshot(1).stateHash,
            uint256(0),
            amount,
            uint256(50),
            treasury
        );
        z.zoneHash = keccak256(z.extraData);
        z.startTime = block.timestamp;
        z.endTime = block.timestamp + 1 days;
    }

    function testApprovalAndAuthorizationKeepNFTInWallet() public {
        ZoneParameters memory z = parameters(0, 1000);
        vm.prank(sea);
        require(zone.authorizeOrder(z) == zone.authorizeOrder.selector);
        require(nft.ownerOf(1) == seller);
    }

    function testSaleAdvancesEpochAndInvalidatesCompetingBid() public {
        ZoneParameters memory ask = parameters(0, 1000);
        ZoneParameters memory bid = parameters(1, 1000);
        vm.prank(sea);
        zone.authorizeOrder(ask);
        vm.prank(sea);
        nft.transferFrom(seller, buyer, 1);
        vm.prank(sea);
        require(zone.validateOrder(ask) == zone.validateOrder.selector);
        require(zone.assetEpoch(1) == 1);
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(bid);
    }

    function testChangedStakeRejectedBeforeAndAfterTransfers() public {
        ZoneParameters memory z = parameters(0, 1000);
        wise.change();
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        vm.prank(sea);
        nft.transferFrom(seller, buyer, 1);
        vm.expectRevert();
        vm.prank(sea);
        zone.validateOrder(z);
    }

    function testFeeRecipientAndPaymentCannotBeChanged() public {
        ZoneParameters memory z = parameters(0, 1000);
        z.consideration[1].recipient = payable(buyer);
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        z = parameters(0, 1000);
        z.consideration[0].amount++;
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        z = parameters(1, 1000);
        z.offer[0].token = address(nft);
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
    }

    function testMissingOrTamperedProofAndExtraRecipientsRejected() public {
        ZoneParameters memory z = parameters(0, 1000);
        z.extraData = hex"00";
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        z = parameters(0, 1000);
        z.zoneHash = bytes32(uint256(123));
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        z = parameters(0, 1000);
        z.consideration = new ReceivedItem[](3);
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
    }

    function testOnlyCanonicalSeaportAndExpectedOwnerMayValidate() public {
        ZoneParameters memory z = parameters(0, 1000);
        vm.expectRevert(SignatureSeaportZone.Unauthorized.selector);
        zone.authorizeOrder(z);
        vm.expectRevert();
        vm.prank(sea);
        zone.validateOrder(z);
        z = parameters(1, 1000);
        z.fulfiller = buyer;
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
        vm.etch(sea, hex"0000");
        vm.expectRevert(SignatureSeaportZone.Unauthorized.selector);
        vm.prank(sea);
        zone.authorizeOrder(z);
    }

    function testPauseAndOwnerCancellationRejectFreshOrders() public {
        ZoneParameters memory z = parameters(0, 1000);
        zone.setNewActivityPaused(true);
        vm.expectRevert(SignatureSeaportZone.Paused.selector);
        vm.prank(sea);
        zone.authorizeOrder(z);
        zone.setNewActivityPaused(false);
        vm.prank(seller);
        zone.invalidateAsset(1);
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
    }

    function testFuzzExactSellerProceedsAndFee(uint128 amount) public {
        if (amount == 0) amount = 1;
        ZoneParameters memory z = parameters(0, amount);
        vm.prank(sea);
        zone.authorizeOrder(z);
        uint256 fee = uint256(amount) * 50 / 10_000;
        require(z.consideration[0].amount + fee == amount);
        require(fee * 10_000 <= uint256(amount) * 50 && (fee + 1) * 10_000 > uint256(amount) * 50);
        z.consideration[0].amount++;
        vm.expectRevert();
        vm.prank(sea);
        zone.authorizeOrder(z);
    }
}
