import { legacyTradingRetired } from "./sales-migration";
import { paymentSchema } from "./payment-tokens";
import {
    BaseError,
    ContractFunctionRevertedError,
    getAddress,
    keccak256,
    recoverTypedDataAddress,
    parseAbi,
    type Address,
    type PublicClient,
} from "viem";
import {
    adapterAbi,
    marketAbi,
    nftSalesAbi,
    tokenSalesAbi,
    sameAddress,
    type SalesDeployment,
    type OrderStatus,
    type SignedSale,
    parseSignedSale,
    SalesError,
} from "./sales";
import {
    seaportTypedData,
    seaportDigest,
    seaportComponents,
    zoneAbi,
    type SaleOrder,
} from "./seaport";

export async function verifySalesDeployment(
    client: PublicClient,
    d: SalesDeployment,
) {
    if ((await client.getChainId()) !== d.chainId)
        throw new SalesError(
            "wrong-chain",
            d.chainId === 1
                ? "Switch to Ethereum mainnet."
                : "Switch to the configured local fork network.",
        );
    const block = await client.getBlock();
    if (block.number === null || !block.hash)
        throw new SalesError("chain-unavailable", "Chain data is unavailable.");
    const [anchor, ...codes] = await Promise.all([
        client.getBlock({ blockNumber: BigInt(d.deploymentBlock) }),
        ...[d.market, d.adapter, d.collection, d.currency].map((address) =>
            client.getCode({ address, blockNumber: block.number! }),
        ),
    ]);
    if (anchor.hash !== d.deploymentBlockHash)
        throw new SalesError(
            "deployment-changed",
            "The market deployment changed. Reload the market.",
        );
    const hashes = [
        d.marketCodeHash,
        d.adapterCodeHash,
        d.collectionCodeHash,
        d.currencyCodeHash,
    ];
    if (
        codes.some(
            (code, i) =>
                !code || code === "0x" || keccak256(code) !== hashes[i],
        )
    )
        throw new SalesError(
            "code-changed",
            "The market contract could not be verified.",
        );
    const [seaport, nft, currency, fee, recipient, guardian] =
        await Promise.all(
            [
                "SEAPORT",
                "collection",
                "WISE",
                "FEE_BPS",
                "FEE_RECIPIENT",
                "owner",
            ].map((functionName) =>
                client.readContract({
                    address: d.adapter,
                    abi: zoneAbi,
                    functionName: functionName as
                        | "SEAPORT"
                        | "collection"
                        | "WISE"
                        | "FEE_BPS"
                        | "FEE_RECIPIENT"
                        | "owner",
                    blockNumber: block.number!,
                }),
            ),
        );
    if (
        !sameAddress(seaport as string, d.market) ||
        !sameAddress(nft as string, d.collection) ||
        !sameAddress(currency as string, d.currency) ||
        fee !== BigInt(d.feeBps) ||
        !sameAddress(recipient as string, d.feeRecipient) ||
        !sameAddress(guardian as string, d.guardian)
    )
        throw new SalesError(
            "binding-changed",
            "Unexpected market contract bindings.",
        );
    if (paymentSchema(d) === 2 && await client.readContract({address:d.adapter,abi:zoneAbi,functionName:"PAYMENT_SCHEMA_VERSION",blockNumber:block.number}) !== 2n)
        throw new SalesError("binding-changed", "The configured validator does not support V2 payments.");
    const [version] = await client.readContract({
        address: d.market,
        abi: marketAbi,
        functionName: "information",
        blockNumber: block.number,
    });
    if (version !== "1.6")
        throw new SalesError("binding-changed", "Unexpected Seaport version.");
    if (d.environment === "ethereum-mainnet") {
        if (
            block.number <
            BigInt(d.deploymentBlock) + BigInt(d.confirmations - 1)
        )
            throw new SalesError(
                "deployment-pending",
                "The Ethereum deployment is awaiting confirmations.",
            );
    }
    return block as typeof block & { number: bigint };
}
export async function readSaleAsset(
    client: PublicClient,
    d: SalesDeployment,
    tokenId: bigint,
    blockNumber?: bigint,
) {
    const [owner, snapshot, epoch] = await Promise.all([
        client.readContract({
            address: d.collection,
            abi: nftSalesAbi,
            functionName: "ownerOf",
            args: [tokenId],
            blockNumber,
        }),
        client.readContract({
            address: d.adapter,
            abi: adapterAbi,
            functionName: "snapshot",
            args: [tokenId],
            blockNumber,
        }),
        client.readContract({
            address: d.adapter,
            abi: zoneAbi,
            functionName: "assetEpoch",
            args: [tokenId],
            blockNumber,
        }),
    ]);
    return { owner: getAddress(owner), ...snapshot, epoch, locked: 0n };
}
export async function nftApproved(
    client: PublicClient,
    d: SalesDeployment,
    owner: Address,
    tokenId: bigint,
    blockNumber?: bigint,
) {
    const [one, all] = await Promise.all([
        client.readContract({
            address: d.collection,
            abi: nftSalesAbi,
            functionName: "getApproved",
            args: [tokenId],
            blockNumber,
        }),
        client.readContract({
            address: d.collection,
            abi: nftSalesAbi,
            functionName: "isApprovedForAll",
            args: [owner, d.market],
            blockNumber,
        }),
    ]);
    return all || sameAddress(one, d.market);
}
export async function readOrderStatus(
    client: PublicClient,
    d: SalesDeployment,
    order: SaleOrder,
    block: { number: bigint; timestamp: bigint },
): Promise<OrderStatus> {
    if (order.startTime > block.timestamp) return "not-started";
    if (
        order.deadline <= block.timestamp ||
        order.deadline > block.timestamp + 30n * 86400n
    )
        return "expired";
    const components = seaportComponents(d, order);
    const orderHash = await client.readContract({
        address: d.market,
        abi: marketAbi,
        functionName: "getOrderHash",
        args: [components],
        blockNumber: block.number,
    });
    const [legacyRetired, state, counter, paused] = await Promise.all([
        legacyTradingRetired(client, d, block.number),
        client.readContract({
            address: d.market,
            abi: marketAbi,
            functionName: "getOrderStatus",
            args: [orderHash],
            blockNumber: block.number,
        }),
        client.readContract({
            address: d.market,
            abi: marketAbi,
            functionName: "getCounter",
            args: [order.maker],
            blockNumber: block.number,
        }),
        client.readContract({
            address: d.adapter,
            abi: zoneAbi,
            functionName: "newActivityPaused",
            blockNumber: block.number,
        }),
    ]);
    if (state[1] || state[2] > 0n || counter !== order.counter)
        return "cancelled-or-filled";
    if (paused || !legacyRetired) return "paused";
    // Failed RPC/contract reads propagate. They never masquerade as a verified empty book.
    let asset;
    try {
        asset = await readSaleAsset(client, d, order.tokenId, block.number);
    } catch (error) {
        if (
            error instanceof BaseError &&
            error.walk(
                (e) => e instanceof ContractFunctionRevertedError,
            ) instanceof ContractFunctionRevertedError
        )
            return "stake-changed";
        throw error;
    }
    if (!sameAddress(asset.owner, order.owner)) return "owner-changed";
    if (
        asset.locked !== 0n ||
        asset.epoch !== order.epoch ||
        asset.stakeId !== order.stakeId ||
        asset.stateHash !== order.stateHash
    )
        return "stake-changed";
    if (order.kind === 0)
        return (await nftApproved(
            client,
            d,
            order.owner,
            order.tokenId,
            block.number,
        ))
            ? "available"
            : "unapproved";
    const [balance, allowance] = await Promise.all([
        client.readContract({
            address: order.currency,
            abi: tokenSalesAbi,
            functionName: "balanceOf",
            args: [order.maker],
            blockNumber: block.number,
        }),
        client.readContract({
            address: order.currency,
            abi: tokenSalesAbi,
            functionName: "allowance",
            args: [order.maker, d.market],
            blockNumber: block.number,
        }),
    ]);
    return balance < order.amount
        ? "unfunded"
        : allowance < order.amount
          ? "unapproved"
          : "available";
}
export async function verifySignedSale(
    client: PublicClient,
    d: SalesDeployment,
    raw: SignedSale,
    block: { number: bigint; timestamp: bigint },
) {
    const parsed = parseSignedSale(raw, d);
    // Same EOA/ERC-1271 semantics as SignatureChecker; counterfactual signatures are not accepted.
    const makerCode = await client.getCode({
        address: parsed.order.maker,
        blockNumber: block.number,
    });
    let valid = false;
    if (makerCode && makerCode !== "0x") {
        let magic;
        try {
            magic = await client.readContract({
                address: parsed.order.maker,
                abi: parseAbi([
                    "function isValidSignature(bytes32,bytes) view returns(bytes4)",
                ]),
                functionName: "isValidSignature",
                args: [seaportDigest(d, parsed.order), parsed.signed.signature],
                blockNumber: block.number,
            });
        } catch (error) {
            if (
                !(
                    error instanceof BaseError &&
                    error.walk(
                        (e) => e instanceof ContractFunctionRevertedError,
                    ) instanceof ContractFunctionRevertedError
                )
            )
                throw error;
        }
        valid = magic === "0x1626ba7e";
    } else {
        try {
            valid = sameAddress(
                await recoverTypedDataAddress({
                    ...seaportTypedData(d, parsed.order),
                    signature: parsed.signed.signature,
                }),
                parsed.order.maker,
            );
        } catch {
            valid = false;
        }
    }
    if (!valid)
        throw new SalesError(
            "invalid-signature",
            "The order signature could not be verified.",
        );
    const digest = await client.readContract({
        address: d.market,
        abi: marketAbi,
        functionName: "getOrderHash",
        args: [seaportComponents(d, parsed.order)],
        blockNumber: block.number,
    });
    if (digest !== parsed.hash)
        throw new SalesError(
            "domain-mismatch",
            "The order does not match this market.",
        );
    return {
        ...parsed,
        status: await readOrderStatus(client, d, parsed.order, block),
    };
}
