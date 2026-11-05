import {
    encodeAbiParameters,
    getAddress,
    isAddress,
    keccak256,
    type Address,
    type Hex,
} from "viem";
import { DAY, UINT256_MAX } from "./domain";

// These builders do not sign or send transactions. No live verifying contract is configured.
export type MarketDeployment = {
    chainId: number;
    market: Address;
    collection: Address;
    currency: Address;
};
export type SaleOrder = {
    kind: 0 | 1;
    maker: Address;
    owner: Address;
    collection: Address;
    currency: Address;
    tokenId: bigint;
    stakeId: Hex;
    stateHash: Hex;
    amount: bigint;
    nonce: bigint;
    epoch: bigint;
    deadline: bigint;
};
export type LoanOffer = {
    lender: Address;
    borrower: Address;
    collection: Address;
    currency: Address;
    tokenId: bigint;
    stakeId: Hex;
    stateHash: Hex;
    principal: bigint;
    aprBps: number;
    duration: number;
    grace: number;
    minInterest: number;
    nonce: bigint;
    epoch: bigint;
    deadline: bigint;
};

// Discovery only. A request never grants a lender permission to originate a loan.
export type LoanRequest = Omit<LoanOffer, "lender" | "aprBps"> & {
    maxAprBps: number;
};
export const LOAN_REQUEST_PURPOSE =
    "Request lender offers only. No borrowing or collateral transfer is authorized.";

export const loanRequestTypes = {
    LoanRequest: [
        { name: "purpose", type: "string" },
        { name: "borrower", type: "address" },
        { name: "collection", type: "address" },
        { name: "currency", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "stakeId", type: "bytes16" },
        { name: "stateHash", type: "bytes32" },
        { name: "principal", type: "uint128" },
        { name: "maxAprBps", type: "uint16" },
        { name: "duration", type: "uint32" },
        { name: "grace", type: "uint32" },
        { name: "minInterest", type: "uint32" },
        { name: "nonce", type: "uint256" },
        { name: "epoch", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

export const saleOrderTypes = {
    SaleOrder: [
        { name: "kind", type: "uint8" },
        { name: "maker", type: "address" },
        { name: "owner", type: "address" },
        { name: "collection", type: "address" },
        { name: "currency", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "stakeId", type: "bytes16" },
        { name: "stateHash", type: "bytes32" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "epoch", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

export const loanOfferTypes = {
    LoanOffer: [
        { name: "lender", type: "address" },
        { name: "borrower", type: "address" },
        { name: "collection", type: "address" },
        { name: "currency", type: "address" },
        { name: "tokenId", type: "uint256" },
        { name: "stakeId", type: "bytes16" },
        { name: "stateHash", type: "bytes32" },
        { name: "principal", type: "uint128" },
        { name: "aprBps", type: "uint16" },
        { name: "duration", type: "uint32" },
        { name: "grace", type: "uint32" },
        { name: "minInterest", type: "uint32" },
        { name: "nonce", type: "uint256" },
        { name: "epoch", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

function address(value: string): Address {
    if (!isAddress(value) || /^0x0{40}$/i.test(value))
        throw new Error("A nonzero address is required.");
    return getAddress(value);
}
function uint(value: bigint, max = UINT256_MAX) {
    if (typeof value !== "bigint" || value < 0n || value > max)
        throw new Error("Invalid unsigned base-unit value.");
}
function domain(deployment: MarketDeployment) {
    if (!Number.isSafeInteger(deployment.chainId) || deployment.chainId <= 0)
        throw new Error("Invalid chain ID.");
    return {
        name: "WiseOne Signature Market",
        version: "1",
        chainId: deployment.chainId,
        verifyingContract: address(deployment.market),
    } as const;
}
function asset(
    deployment: MarketDeployment,
    order: SaleOrder | LoanOffer | LoanRequest,
) {
    if (
        address(order.collection) !== address(deployment.collection) ||
        address(order.currency) !== address(deployment.currency)
    )
        throw new Error(
            "Order belongs to a different collection or settlement currency.",
        );
    for (const value of [
        order.tokenId,
        order.nonce,
        order.epoch,
        order.deadline,
    ])
        uint(value);
    if (
        order.deadline === 0n ||
        !/^0x[\da-f]{32}$/i.test(order.stakeId) ||
        /^0x0{32}$/i.test(order.stakeId) ||
        !/^0x[\da-f]{64}$/i.test(order.stateHash)
    )
        throw new Error("Invalid collateral identity or deadline.");
}

export function saleOrderTypedData(
    deployment: MarketDeployment,
    order: SaleOrder,
) {
    const typedDomain = domain(deployment);
    asset(deployment, order);
    uint(order.amount);
    const maker = address(order.maker);
    const owner = address(order.owner);
    if (
        order.amount === 0n ||
        (order.kind !== 0 && order.kind !== 1) ||
        (order.kind === 0 ? maker !== owner : maker === owner)
    )
        throw new Error("Invalid purchase or sale order.");
    return {
        domain: typedDomain,
        types: saleOrderTypes,
        primaryType: "SaleOrder",
        message: order,
    } as const;
}

export function loanOfferTypedData(
    deployment: MarketDeployment,
    offer: LoanOffer,
) {
    const typedDomain = domain(deployment);
    asset(deployment, offer);
    uint(offer.principal, (1n << 128n) - 1n);
    if (
        address(offer.lender) === address(offer.borrower) ||
        offer.principal === 0n ||
        ![offer.aprBps, offer.duration, offer.grace, offer.minInterest].every(
            Number.isSafeInteger,
        ) ||
        offer.aprBps < 0 ||
        offer.aprBps > 10_000 ||
        offer.duration < DAY ||
        offer.duration > 90 * DAY ||
        offer.grace !== DAY ||
        offer.minInterest !== DAY
    )
        throw new Error("Invalid fixed-term loan terms.");
    return {
        domain: typedDomain,
        types: loanOfferTypes,
        primaryType: "LoanOffer",
        message: offer,
    } as const;
}

export function loanRequestTypedData(
    deployment: MarketDeployment,
    request: LoanRequest,
) {
    const typedDomain = domain(deployment);
    asset(deployment, request);
    address(request.borrower);
    uint(request.principal, (1n << 128n) - 1n);
    if (
        request.principal === 0n ||
        ![
            request.maxAprBps,
            request.duration,
            request.grace,
            request.minInterest,
        ].every(Number.isSafeInteger) ||
        request.maxAprBps < 0 ||
        request.maxAprBps > 10_000 ||
        request.duration < DAY ||
        request.duration > 90 * DAY ||
        request.grace !== DAY ||
        request.minInterest !== DAY
    )
        throw new Error("Invalid loan request terms.");
    return {
        domain: { ...typedDomain, name: "WiseOne Signature Loan Requests" },
        types: loanRequestTypes,
        primaryType: "LoanRequest",
        message: { ...request, purpose: LOAN_REQUEST_PURPOSE },
    } as const;
}

export type SignatureStakeInputs = {
    stakeId: Hex;
    startDay: bigint;
    lockDays: bigint;
    finalDay: bigint;
    closeDay: bigint;
    scrapeDay: bigint;
    principal: bigint;
    shares: bigint;
    active: boolean;
};

/** Matches WiseSignatureAdapter.snapshot. Read these together at one block, never from cached display rows. */
export function signatureStakeStateHash(stake: SignatureStakeInputs): Hex {
    return keccak256(
        encodeAbiParameters(
            [
                { type: "bytes16" },
                { type: "uint64" },
                { type: "uint64" },
                { type: "uint64" },
                { type: "uint64" },
                { type: "uint256" },
                { type: "uint256" },
                { type: "uint256" },
                { type: "bool" },
            ],
            [
                stake.stakeId,
                stake.startDay,
                stake.lockDays,
                stake.finalDay,
                stake.closeDay,
                stake.scrapeDay,
                stake.principal,
                stake.shares,
                stake.active,
            ],
        ),
    );
}
