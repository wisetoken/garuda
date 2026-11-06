import { acceptsPayment, paymentSchema } from "./payment-tokens";
import {
    encodeAbiParameters,
    getAddress,
    hashStruct,
    hashTypedData,
    isAddress,
    keccak256,
    parseAbi,
    zeroHash,
    type Address,
    type Hex,
} from "viem";
import type { SaleOrder as LegacySaleOrder } from "./protocol";

export const SEAPORT = getAddress("0x0000000000000068f116a894984e2db1123eb395");
export const SEAPORT_CODE_HASH =
    "0x74499ac0cce14428e4b41541d5e44f28f5a6882a1051d0118867c2a93cd5aec0";
export const SALES_FEE_BPS = 50;
export const SALES_TREASURY = getAddress(
    "0xb8d92f2e8d1a98c18cde85e49a0f11e3c64d0a68",
);
export type SeaportDeployment = {
    paymentSchemaVersion?: 1 | 2;
    chainId: number;
    market: Address;
    adapter: Address;
    collection: Address;
    currency: Address;
    feeBps: number;
    feeRecipient: Address;
};
export type SaleOrder = LegacySaleOrder & {
    counter: bigint;
    startTime: bigint;
    feeBps: number;
    feeRecipient: Address;
};

// Seaport 1.6 ABI subset; canonical interface: ProjectOpenSea/seaport-types.
export const seaportStructs = [
    "struct OfferItem { uint8 itemType; address token; uint256 identifierOrCriteria; uint256 startAmount; uint256 endAmount; }",
    "struct ConsiderationItem { uint8 itemType; address token; uint256 identifierOrCriteria; uint256 startAmount; uint256 endAmount; address recipient; }",
    "struct OrderComponents { address offerer; address zone; OfferItem[] offer; ConsiderationItem[] consideration; uint8 orderType; uint256 startTime; uint256 endTime; bytes32 zoneHash; uint256 salt; bytes32 conduitKey; uint256 counter; }",
    "struct OrderParameters { address offerer; address zone; OfferItem[] offer; ConsiderationItem[] consideration; uint8 orderType; uint256 startTime; uint256 endTime; bytes32 zoneHash; uint256 salt; bytes32 conduitKey; uint256 totalOriginalConsiderationItems; }",
    "struct AdvancedOrder { OrderParameters parameters; uint120 numerator; uint120 denominator; bytes signature; bytes extraData; }",
    "struct CriteriaResolver { uint256 orderIndex; uint8 side; uint256 index; uint256 identifier; bytes32[] criteriaProof; }",
    "struct FulfillmentComponent { uint256 orderIndex; uint256 itemIndex; }",
    "struct Fulfillment { FulfillmentComponent[] offerComponents; FulfillmentComponent[] considerationComponents; }",
    "struct SpentItem { uint8 itemType; address token; uint256 identifier; uint256 amount; }",
    "struct ReceivedItem { uint8 itemType; address token; uint256 identifier; uint256 amount; address recipient; }",
] as const;
export const seaportAbi = parseAbi([
    ...seaportStructs,
    "function information() view returns(string version,bytes32 domainSeparator,address conduitController)",
    "function getCounter(address) view returns(uint256)",
    "function getOrderHash(OrderComponents) view returns(bytes32)",
    "function getOrderStatus(bytes32) view returns(bool isValidated,bool isCancelled,uint256 totalFilled,uint256 totalSize)",
    "function cancel(OrderComponents[]) returns(bool)",
    "function incrementCounter() returns(uint256)",
    "function fulfillAdvancedOrder(AdvancedOrder,CriteriaResolver[],bytes32,address) payable returns(bool)",
    "function matchAdvancedOrders(AdvancedOrder[],CriteriaResolver[],Fulfillment[],address) payable",
    "event OrderFulfilled(bytes32 orderHash,address indexed offerer,address indexed zone,address recipient,SpentItem[] offer,ReceivedItem[] consideration)",
    "event OrderCancelled(bytes32 orderHash,address indexed offerer,address indexed zone)",
    "event CounterIncremented(uint256 newCounter,address indexed offerer)",
]);
export const zoneAbi = parseAbi([
    "function SEAPORT() view returns(address)",
    "function collection() view returns(address)",
    "function WISE() view returns(address)",
    "function FEE_BPS() view returns(uint256)",
    "function FEE_RECIPIENT() view returns(address)",
    "function owner() view returns(address)",
    "function newActivityPaused() view returns(bool)",
    "function setNewActivityPaused(bool)",
    "function assetEpoch(uint256) view returns(uint256)",
    "function invalidateAsset(uint256)",
    "function PAYMENT_SCHEMA_VERSION() view returns(uint256)",
    "function snapshot(uint256) view returns((bytes16 stakeId,bytes32 stateHash,uint256 maturesAt,bool loanEligible))",
    "event SaleValidated(bytes32 indexed orderHash,uint256 indexed tokenId,address indexed seller,address buyer,uint256 amount,uint256 fee,uint8 kind)",
    "event SaleValidated(bytes32 indexed orderHash,uint256 indexed tokenId,address indexed seller,address buyer,address currency,uint256 amount,uint256 fee,uint8 kind)",
    "event AssetEpochUpdated(uint256 indexed tokenId,uint256 epoch)",
]);
const itemFields = [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
] as const;
export const seaportTypes = {
    OfferItem: itemFields,
    ConsiderationItem: [...itemFields, { name: "recipient", type: "address" }],
    OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" },
    ],
} as const;
const proofTypes = [
    { type: "uint8" },
    { type: "address" },
    { type: "uint256" },
    { type: "bytes16" },
    { type: "bytes32" },
    { type: "uint256" },
    { type: "uint256" },
    { type: "uint256" },
    { type: "address" },
] as const;
export function zoneProof(o: SaleOrder, version: 1 | 2 = 1) {
    const values = [
        o.kind,
        o.owner,
        o.tokenId,
        o.stakeId,
        o.stateHash,
        o.epoch,
        o.amount,
        BigInt(o.feeBps),
        o.feeRecipient,
    ] as const;
    return version === 2 ? encodeAbiParameters([...proofTypes, {type: "address"}], [...values, o.currency]) : encodeAbiParameters(proofTypes, values);
}
export function saleAmounts(o: Pick<SaleOrder, "amount" | "feeBps">) {
    const fee = (o.amount * BigInt(o.feeBps)) / 10_000n;
    return { gross: o.amount, fee, net: o.amount - fee };
}
export function seaportComponents(d: SeaportDeployment, o: SaleOrder) {
    const address = (x: string) => {
        if (!isAddress(x, { strict: false }) || /^0x0{40}$/i.test(x))
            throw new Error("Invalid order address.");
        return getAddress(x.toLowerCase());
    };
    for (const x of [
        o.tokenId,
        o.amount,
        o.nonce,
        o.epoch,
        o.counter,
        o.startTime,
        o.deadline,
    ])
        if (typeof x !== "bigint" || x < 0n || x >= 1n << 256n)
            throw new Error("Invalid unsigned order value.");
    const owner = address(o.owner),
        maker = address(o.maker);
    if (
        address(o.collection) !== address(d.collection) ||
        !acceptsPayment(d, address(o.currency)) ||
        address(o.feeRecipient) !== address(d.feeRecipient) ||
        o.feeBps !== d.feeBps ||
        !Number.isInteger(o.feeBps) ||
        o.feeBps < 0 ||
        o.feeBps > 1000 ||
        ![0, 1].includes(o.kind) ||
        (o.kind === 0 ? owner !== maker : owner === maker) ||
        o.amount === 0n ||
        o.amount >= 1n << 128n ||
        o.deadline <= o.startTime ||
        o.deadline - o.startTime > 30n * 86400n ||
        !/^0x[0-9a-f]{32}$/i.test(o.stakeId) ||
        /^0x0{32}$/i.test(o.stakeId) ||
        !/^0x[0-9a-f]{64}$/i.test(o.stateHash)
    )
        throw new Error("Invalid Seaport sale terms.");
    const { fee, net } = saleAmounts(o);
    const nft = {
        itemType: 2,
        token: o.collection,
        identifierOrCriteria: o.tokenId,
        startAmount: 1n,
        endAmount: 1n,
    };
    const wise = (amount: bigint) => ({
        itemType: 1,
        token: o.currency,
        identifierOrCriteria: 0n,
        startAmount: amount,
        endAmount: amount,
    });
    return {
        offerer: maker,
        zone: address(d.adapter),
        offer: o.kind === 0 ? [nft] : [wise(o.amount)],
        consideration:
            o.kind === 0
                ? [
                      { ...wise(net), recipient: owner },
                      ...(fee > 0n
                          ? [{ ...wise(fee), recipient: o.feeRecipient }]
                          : []),
                  ]
                : [
                      { ...nft, recipient: maker },
                      ...(fee > 0n
                          ? [{ ...wise(fee), recipient: o.feeRecipient }]
                          : []),
                  ],
        orderType: 2,
        startTime: o.startTime,
        endTime: o.deadline,
        zoneHash: keccak256(zoneProof(o, paymentSchema(d))),
        salt: o.nonce,
        conduitKey: zeroHash,
        counter: o.counter,
    };
}
export function seaportTypedData(d: SeaportDeployment, o: SaleOrder) {
    return {
        domain: {
            name: "Seaport",
            version: "1.6",
            chainId: d.chainId,
            verifyingContract: d.market,
        },
        types: seaportTypes,
        primaryType: "OrderComponents",
        message: seaportComponents(d, o),
    } as const;
}
export function seaportOrderHash(d: SeaportDeployment, o: SaleOrder) {
    return hashStruct({
        data: seaportComponents(d, o),
        types: seaportTypes,
        primaryType: "OrderComponents",
    });
}
export function seaportDigest(d: SeaportDeployment, o: SaleOrder) {
    return hashTypedData(seaportTypedData(d, o));
}
export function advancedSale(
    d: SeaportDeployment,
    o: SaleOrder,
    signature: Hex,
) {
    const { counter: _, ...parameters } = seaportComponents(d, o);
    return {
        parameters: {
            ...parameters,
            totalOriginalConsiderationItems: BigInt(
                parameters.consideration.length,
            ),
        },
        numerator: 1n,
        denominator: 1n,
        signature,
        extraData: zoneProof(o, paymentSchema(d)),
    };
}
export function saleSettlement(
    d: SeaportDeployment,
    o: SaleOrder,
    signature: Hex,
    buyerOrSeller: Address,
) {
    const order = advancedSale(d, o, signature);
    if (o.kind === 0)
        return {
            address: d.market,
            abi: seaportAbi,
            functionName: "fulfillAdvancedOrder",
            args: [order, [], zeroHash, buyerOrSeller],
        } as const;
    // Match the bidder's WISE directly to the seller and treasury. The seller's
    // unsigned mirror is valid only when the seller submits this transaction.
    const { net, fee } = saleAmounts(o);
    const mirror = {
        parameters: {
            offerer: o.owner,
            zone: "0x0000000000000000000000000000000000000000" as Address,
            offer: [
                {
                    itemType: 2,
                    token: o.collection,
                    identifierOrCriteria: o.tokenId,
                    startAmount: 1n,
                    endAmount: 1n,
                },
            ],
            consideration: [
                {
                    itemType: 1,
                    token: o.currency,
                    identifierOrCriteria: 0n,
                    startAmount: net,
                    endAmount: net,
                    recipient: o.owner,
                },
            ],
            orderType: 0,
            startTime: o.startTime,
            endTime: o.deadline,
            zoneHash: zeroHash,
            salt: o.nonce,
            conduitKey: zeroHash,
            totalOriginalConsiderationItems: 1n,
        },
        numerator: 1n,
        denominator: 1n,
        signature: "0x" as Hex,
        extraData: "0x" as Hex,
    };
    return {
        address: d.market,
        abi: seaportAbi,
        functionName: "matchAdvancedOrders",
        args: [
            [order, mirror],
            [],
            [
                {
                    offerComponents: [{ orderIndex: 1n, itemIndex: 0n }],
                    considerationComponents: [
                        { orderIndex: 0n, itemIndex: 0n },
                    ],
                },
                {
                    offerComponents: [{ orderIndex: 0n, itemIndex: 0n }],
                    considerationComponents: [
                        { orderIndex: 1n, itemIndex: 0n },
                    ],
                },
                ...(fee > 0n
                    ? [
                          {
                              offerComponents: [
                                  { orderIndex: 0n, itemIndex: 0n },
                              ],
                              considerationComponents: [
                                  { orderIndex: 0n, itemIndex: 1n },
                              ],
                          },
                      ]
                    : []),
            ],
            buyerOrSeller,
        ],
    } as const;
}
