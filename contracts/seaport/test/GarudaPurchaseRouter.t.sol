// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {GarudaPurchaseRouter, AdvancedOrder, OrderParameters, OrderComponents, OfferItem, ConsiderationItem, CriteriaResolver} from "../src/GarudaPurchaseRouter.sol";
interface RouterVm { function etch(address,bytes calldata) external; function deal(address,uint256) external; function prank(address) external; function expectRevert() external; function warp(uint256) external; }
contract RouterToken is ERC20 {
    constructor() ERC20("Test","TEST") {}
    function mint(address to,uint256 n) external { _mint(to,n); }
    function deposit() external payable { _mint(msg.sender,msg.value); }
}
contract RouterNFT is ERC721 {
    constructor() ERC721("Test","TEST") {}
    function mint(address to) external { _mint(to,1); }
}
contract RouterZone {
    address public collection; address public WISE;
    constructor(address n,address w){collection=n;WISE=w;}
    function PAYMENT_SCHEMA_VERSION() external pure returns(uint256){return 2;}
    function SEAPORT_CODE_HASH() external view returns(bytes32){return address(0x0000000000000068F116a894984e2DB1123eB395).codehash;}
}
contract RouterUniswap {
    function WETH() external pure returns(address){return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;}
    function factory() external pure returns(address){return 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;}
    function swapETHForExactTokens(uint256 amount,address[] calldata path,address to,uint256) external payable returns(uint256[] memory result){
        require(msg.value>=amount);RouterToken(path[path.length-1]).mint(to,amount);
        (bool ok,)=msg.sender.call{value:msg.value-amount}("");require(ok);result=new uint256[](2);result[0]=amount;result[1]=amount;
    }
    function swapTokensForExactTokens(uint256 amount,uint256 maximum,address[] calldata path,address to,uint256) external returns(uint256[] memory result){
        require(maximum>=amount);RouterToken(path[0]).transferFrom(msg.sender,address(this),amount);RouterToken(path[path.length-1]).mint(to,amount);
        result=new uint256[](2);result[0]=amount;result[1]=amount;
    }
}
contract RouterSeaport {
    bool public fail;
    function setFail(bool value) external {fail=value;}
    function getCounter(address) external pure returns(uint256){return 0;}
    function getOrderHash(OrderComponents calldata o) external pure returns(bytes32){return keccak256(abi.encode(o));}
    function fulfillAdvancedOrder(AdvancedOrder calldata order,CriteriaResolver[] calldata,bytes32,address to) external payable returns(bool){
        OrderParameters calldata p=order.parameters;
        for(uint256 i;i<p.consideration.length;++i){ConsiderationItem calldata item=p.consideration[i];RouterToken(item.token).transferFrom(msg.sender,item.recipient,item.startAmount);}
        RouterNFT(p.offer[0].token).transferFrom(p.offerer,to,p.offer[0].identifierOrCriteria);
        require(!fail,"unavailable listing");return true;
    }
}
contract GarudaPurchaseRouterTest {
    RouterVm constant vm=RouterVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant SEA=0x0000000000000068F116a894984e2DB1123eB395;
    address constant UNI=0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address constant USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address constant SELLER=address(0x1111);address constant BUYER=address(0x2222);
    RouterToken wise;RouterNFT nft;RouterZone zone;GarudaPurchaseRouter router;
    function setUp() public {
        vm.warp(1792000000);vm.etch(SEA,address(new RouterSeaport()).code);vm.etch(UNI,address(new RouterUniswap()).code);
        RouterToken token=new RouterToken();vm.etch(WETH,address(token).code);vm.etch(USDC,address(token).code);
        wise=new RouterToken();nft=new RouterNFT();nft.mint(SELLER);zone=new RouterZone(address(nft),address(wise));router=new GarudaPurchaseRouter(address(zone));
        vm.prank(SELLER);nft.approve(SEA,1);vm.deal(BUYER,10000);
        RouterToken(USDC).mint(BUYER,10000);vm.prank(BUYER);RouterToken(USDC).approve(address(router),1200);
    }
    function order(address currency) internal view returns(AdvancedOrder memory o){
        OfferItem[] memory offer=new OfferItem[](1);offer[0]=OfferItem(2,address(nft),1,1,1);
        ConsiderationItem[] memory consideration=new ConsiderationItem[](1);consideration[0]=ConsiderationItem(1,currency,0,1000,1000,payable(SELLER));
        o=AdvancedOrder(OrderParameters(SELLER,address(zone),offer,consideration,2,block.timestamp,block.timestamp+1 days,0,0,0,1),1,1,hex"00",hex"00");
    }
    function testNativePaymentRefundsAndDeliversInOneTransaction() public {
        vm.prank(BUYER);router.buy{value:1200}(order(address(wise)),address(0),1200,block.timestamp+100);
        require(BUYER.balance==9000 && address(router).balance==0 && nft.ownerOf(1)==BUYER && wise.balanceOf(SELLER)==1000);
        require(wise.allowance(address(router),SEA)==0);
    }
    function testTokenPaymentOnlySpendsActualInputAndClearsApprovals() public {
        vm.prank(BUYER);router.buy(order(address(wise)),USDC,1200,block.timestamp+100);
        require(RouterToken(USDC).balanceOf(BUYER)==9000 && RouterToken(USDC).balanceOf(address(router))==0);
        require(RouterToken(USDC).allowance(address(router),UNI)==0 && wise.allowance(address(router),SEA)==0 && nft.ownerOf(1)==BUYER);
    }
    function testSeaportFailureRollsBackSwapPaymentAndNFT() public {
        RouterSeaport(SEA).setFail(true);
        vm.expectRevert();vm.prank(BUYER);router.buy(order(address(wise)),USDC,1200,block.timestamp+100);
        require(RouterToken(USDC).balanceOf(BUYER)==10000 && RouterToken(USDC).balanceOf(UNI)==0 && wise.balanceOf(SELLER)==0 && nft.ownerOf(1)==SELLER);
        require(RouterToken(USDC).allowance(BUYER,address(router))==1200);
        vm.expectRevert();vm.prank(BUYER);router.buy{value:1200}(order(address(wise)),address(0),1200,block.timestamp+100);
        require(BUYER.balance==10000 && address(router).balance==0);
    }
    function testExpiredOrInsufficientMaximumCannotSwap() public {
        vm.expectRevert();vm.prank(BUYER);router.buy(order(address(wise)),USDC,1200,block.timestamp-1);
        vm.expectRevert();vm.prank(BUYER);router.buy(order(address(wise)),USDC,999,block.timestamp+100);
        require(RouterToken(USDC).balanceOf(BUYER)==10000 && nft.ownerOf(1)==SELLER);
    }
    function testWrongZoneTipsAndPartialOrdersRejected() public {
        AdvancedOrder memory o=order(address(wise));o.parameters.zone=BUYER;
        vm.expectRevert();vm.prank(BUYER);router.buy(o,USDC,1200,block.timestamp+100);
        o=order(address(wise));o.denominator=2;
        vm.expectRevert();vm.prank(BUYER);router.buy(o,USDC,1200,block.timestamp+100);
        o=order(address(wise));o.parameters.totalOriginalConsiderationItems=0;
        vm.expectRevert();vm.prank(BUYER);router.buy(o,USDC,1200,block.timestamp+100);
    }
    function testNativeWrapAndExistingDustArePreserved() public {
        RouterToken(WETH).mint(address(router),7);vm.deal(address(router),9);
        vm.prank(BUYER);router.buy{value:1200}(order(WETH),address(0),1200,block.timestamp+100);
        require(RouterToken(WETH).balanceOf(SELLER)==1000 && RouterToken(WETH).balanceOf(address(router))==7);
        require(BUYER.balance==9000 && address(router).balance==9 && nft.ownerOf(1)==BUYER);
    }
    function testFuzzExcessInputIsRefunded(uint128 extra) public {
        uint256 maximum=1000+uint256(extra);vm.deal(BUYER,maximum);
        vm.prank(BUYER);router.buy{value:maximum}(order(address(wise)),address(0),maximum,block.timestamp+100);
        require(BUYER.balance==extra && address(router).balance==0);
    }
}
