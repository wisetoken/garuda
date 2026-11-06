import { paymentSchema } from "./payment-tokens";
import { getAddress, isAddress, parseAbi, type Address, type Hex } from "viem";
import {
  SEAPORT,
  SALES_TREASURY,
  seaportAbi,
  zoneAbi,
  seaportOrderHash,
  type SeaportDeployment,
  type SaleOrder,
} from "./seaport";
import { stakeCollection } from "./stake-collections";
import { SIGNATURE_WISE } from "./live-portfolio";
export const marketAbi = seaportAbi;
export const nftSalesAbi = parseAbi([
  "function ownerOf(uint256) view returns(address)",
  "function approve(address,uint256)",
  "function getApproved(uint256) view returns(address)",
  "function isApprovedForAll(address,address) view returns(bool)",
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
]);
export const tokenSalesAbi = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
export const adapterAbi = zoneAbi;
export type SalesDeployment = SeaportDeployment & {
  protocol: "seaport-1.6";
  purchaseRouter?: { address: Address; codeHash: Hex };
  guardian: Address;
  adapter: Address;
  marketCodeHash: Hex;
  adapterCodeHash: Hex;
  collectionCodeHash: Hex;
  currencyCodeHash: Hex;
  deploymentBlock: string;
  deploymentBlockHash: Hex;
  confirmations: number;
} & (
    | { environment: "local-fork"; chainId: 31337; rpcUrl: string }
    | {
        environment: "ethereum-mainnet";
        chainId: 1;
        guardian: Address;
        rpcUrl?: never;
      }
  );
export type WireSaleOrder = {
  [K in keyof SaleOrder]: SaleOrder[K] extends bigint ? string : SaleOrder[K];
};
export type SignedSale = { order: WireSaleOrder; signature: Hex };
export type OrderStatus =
  | "checking"
  | "available"
  | "sold"
  | "not-started"
  | "expired"
  | "cancelled-or-filled"
  | "stake-changed"
  | "owner-changed"
  | "unapproved"
  | "unfunded"
  | "paused"
  | "transferred"
  | "reorged"
  | "signature-invalid";
export type SaleRow = SignedSale & {
  arkivEntity?: string;
  arkiv?: {state: "queued" | "publishing" | "published" | "retrying" | "unavailable"; entityKey?: string; txHash?: string};
  stakeSnapshot?: import('./stake-snapshot').StakeSnapshot;
  hash: Hex;
  status: OrderStatus;
  publishedBlock: string;
  publishedBlockHash: Hex;
};
export type SalesConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      deployment: SalesDeployment;
      recoveryOnly?: boolean;
      newActivityPaused?: boolean;
    };
export const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
export function deploymentScope(d: SalesDeployment) {
  return `${d.protocol}:${d.chainId}:${d.market.toLowerCase()}:${d.adapter.toLowerCase()}:${d.adapterCodeHash}:${d.deploymentBlockHash}`;
}
export function parseSalesDeployment(raw: unknown): SalesDeployment {
  if (!raw || typeof raw !== "object")
    throw new Error("Invalid market deployment.");
  const d = raw as SalesDeployment;
  const version = paymentSchema(d);
  if (d.purchaseRouter && (version !== 2 || !isAddress(d.purchaseRouter.address, {strict:false}) || /^0x0{40}$/i.test(d.purchaseRouter.address) || !/^0x[0-9a-f]{64}$/i.test(d.purchaseRouter.codeHash))) throw new Error("Invalid purchase router configuration.");
  if (version === 2 && stakeCollection(d.collection).id !== "signature") throw new Error("V2 supports Signature stakes only.");
  if (d.protocol !== "seaport-1.6" || !sameAddress(d.market ?? "", SEAPORT))
    throw new Error("Canonical Seaport 1.6 configuration is required.");
  if (
    !Number.isInteger(d.feeBps) ||
    d.feeBps < 0 ||
    d.feeBps > 1000 ||
    !isAddress(d.feeRecipient ?? "", { strict: false }) ||
    /^0x0{40}$/i.test(d.feeRecipient)
  )
    throw new Error("Invalid sale fee configuration.");
  if (
    d.environment === "ethereum-mainnet" &&
    (d.feeBps !== stakeCollection(d.collection).purchaseFeeBps || !sameAddress(d.feeRecipient, SALES_TREASURY))
  )
    throw new Error("Unexpected production fee or treasury.");
  if (d.environment === "local-fork" && d.chainId === 31337) {
    const url = new URL(d.rpcUrl);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Local fork RPC must be loopback.");
  } else if (d.environment === "ethereum-mainnet" && d.chainId === 1) {
    if ("rpcUrl" in d)
      throw new Error(
        "Mainnet RPC credentials must stay in server configuration.",
      );
    if (
      !isAddress(d.guardian, { strict: false }) ||
      /^0x0{40}$/i.test(d.guardian)
    )
      throw new Error("A mainnet guardian address is required.");
    if (d.confirmations < 2)
      throw new Error("Mainnet requires at least two confirmations.");
  } else {
    throw new Error("Unsupported market network.");
  }
  if (
    !sameAddress(d.currency, SIGNATURE_WISE)
  )
    throw new Error("Unsupported collection or currency.");
  stakeCollection(d.collection);
  if (stakeCollection(d.collection).id === "advanced" && d.feeBps !== 200)
    throw new Error("Advanced stake sales require a 2% purchase fee.");
  for (const key of [
    "market",
    "adapter",
    "collection",
    "currency",
    "guardian",
  ] as const) {
    if (!isAddress(d[key], { strict: false }) || /^0x0{40}$/i.test(d[key]))
      throw new Error("Invalid deployment address.");
  }
  for (const key of [
    "marketCodeHash",
    "adapterCodeHash",
    "collectionCodeHash",
    "currencyCodeHash",
    "deploymentBlockHash",
  ] as const) {
    if (!/^0x[0-9a-f]{64}$/i.test(d[key]))
      throw new Error("Invalid deployment hash.");
  }
  if (
    !/^[0-9]{1,16}$/.test(d.deploymentBlock) ||
    !Number.isInteger(d.confirmations) ||
    d.confirmations < 1 ||
    d.confirmations > 64
  )
    throw new Error("Invalid deployment block or finality.");
  return d;
}
export function serializeSale(order: SaleOrder): WireSaleOrder {
  return Object.fromEntries(
    Object.entries(order).map(([key, value]) => [
      key,
      typeof value === "bigint" ? String(value) : value,
    ]),
  ) as WireSaleOrder;
}
export function parseSignedSale(
  raw: unknown,
  deployment: SeaportDeployment,
): { order: SaleOrder; signed: SignedSale; hash: Hex } {
  if (!raw || typeof raw !== "object") throw new Error("Invalid signed order.");
  const value = raw as SignedSale;
  if (
    typeof value.signature !== "string" ||
    !/^0x(?:[0-9a-f]{2}){1,4096}$/i.test(value.signature) ||
    !value.order ||
    typeof value.order !== "object"
  )
    throw new Error("Invalid signed order.");
  const keys = [
    "kind",
    "maker",
    "owner",
    "collection",
    "currency",
    "tokenId",
    "stakeId",
    "stateHash",
    "amount",
    "nonce",
    "epoch",
    "deadline",
    "counter",
    "startTime",
    "feeBps",
    "feeRecipient",
  ];
  if (Object.keys(value.order).sort().join() !== keys.sort().join())
    throw new Error("Unexpected order fields.");
  const order = { ...value.order } as unknown as SaleOrder;
  for (const key of [
    "tokenId",
    "amount",
    "nonce",
    "epoch",
    "deadline",
    "counter",
    "startTime",
  ] as const) {
    const v = value.order[key];
    if (typeof v !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(v))
      throw new Error("Amounts must be exact base-unit strings.");
    order[key] = BigInt(v);
  }
  for (const key of [
    "maker",
    "owner",
    "collection",
    "currency",
    "feeRecipient",
  ] as const) {
    if (
      typeof order[key] !== "string" ||
      !isAddress(order[key], { strict: false })
    )
      throw new Error("Invalid order address.");
    order[key] = getAddress(order[key].toLowerCase());
  }
  order.stakeId = order.stakeId.toLowerCase() as Hex;
  order.stateHash = order.stateHash.toLowerCase() as Hex;
  const hash = seaportOrderHash(deployment, order);
  return {
    order,
    signed: { order: serializeSale(order), signature: value.signature },
    hash,
  };
}
export class SalesError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
