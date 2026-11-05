import test from "node:test";
import assert from "node:assert/strict";
import { parseEther, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
    SEAPORT,
    SALES_FEE_BPS,
    SALES_TREASURY,
    saleAmounts,
    seaportComponents,
    seaportDigest,
    seaportOrderHash,
    seaportTypedData,
} from "../src/lib/blend/seaport.ts";
import { parseSignedSale, serializeSale } from "../src/lib/blend/sales.ts";
import { readOrderStatus } from "../src/lib/blend/sales-chain.ts";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const d = {
    chainId: 1,
    market: SEAPORT,
    adapter: `0x${"22".repeat(20)}`,
    collection: `0x${"33".repeat(20)}`,
    currency: `0x${"44".repeat(20)}`,
    feeBps: SALES_FEE_BPS,
    feeRecipient: SALES_TREASURY,
};
const order = {
    kind: 0,
    maker: account.address,
    owner: account.address,
    collection: d.collection,
    currency: d.currency,
    tokenId: 4n,
    stakeId: `0x${"55".repeat(16)}`,
    stateHash: `0x${"66".repeat(32)}`,
    amount: parseEther("3000"),
    nonce: 1n,
    epoch: 0n,
    counter: 0n,
    startTime: 1000n,
    deadline: 1000n + 7n * 86400n,
    feeBps: d.feeBps,
    feeRecipient: d.feeRecipient,
};
test("Seaport fee rounding conserves exact base units, including dust", () => {
    for (const amount of [
        1n,
        199n,
        200n,
        201n,
        parseEther("3000"),
        (1n << 128n) - 1n,
    ]) {
        const { fee, net, gross } = saleAmounts({ ...order, amount });
        assert.equal(fee + net, gross);
        assert.equal(fee, amount / 200n);
    }
    assert.deepEqual(saleAmounts(order), {
        gross: parseEther("3000"),
        fee: parseEther("15"),
        net: parseEther("2985"),
    });
});
test("Seaport signatures bind chain, validator, counter, fees and stake state", async () => {
    const signature = await account.signTypedData(seaportTypedData(d, order));
    assert.equal(
        await recoverTypedDataAddress({
            ...seaportTypedData(d, order),
            signature,
        }),
        account.address,
    );
    const signed = { order: serializeSale(order), signature };
    assert.equal(parseSignedSale(signed, d).hash, seaportOrderHash(d, order));
    assert.notEqual(seaportOrderHash(d, order), seaportDigest(d, order));
    for (const changed of [
        { counter: 1n },
        { epoch: 1n },
        { stateHash: `0x${"77".repeat(32)}` },
        { amount: order.amount + 1n },
    ]) {
        assert.notEqual(
            seaportOrderHash(d, { ...order, ...changed }),
            seaportOrderHash(d, order),
        );
    }
    for (const changed of [
        { chainId: 31337 },
        { adapter: `0x${"88".repeat(20)}` },
    ]) {
        assert.notEqual(
            await recoverTypedDataAddress({
                ...seaportTypedData({ ...d, ...changed }, order),
                signature,
            }),
            account.address,
        );
    }
    for (const changed of [
        { feeBps: 0 },
        { feeRecipient: account.address },
        { counter: undefined },
    ]) {
        assert.throws(() =>
            parseSignedSale(
                { ...signed, order: { ...signed.order, ...changed } },
                d,
            ),
        );
    }
});
test("Restricted orders pay only seller and approved treasury and forbid partial fills", () => {
    const ask = seaportComponents(d, order);
    assert.equal(ask.orderType, 2);
    assert.deepEqual(
        ask.consideration.map((i) => [i.recipient, i.startAmount]),
        [
            [account.address, parseEther("2985")],
            [SALES_TREASURY, parseEther("15")],
        ],
    );
    assert.equal(
        seaportComponents(d, { ...order, amount: 1n }).consideration.length,
        1,
    );
    for (const changed of [
        { amount: 1n << 128n },
        { amount: 0n },
        { deadline: order.startTime + 31n * 86400n },
        { startTime: order.deadline },
        { kind: 2 },
    ])
        assert.throws(() => seaportComponents(d, { ...order, ...changed }));
});
test("Future orders are unavailable before any RPC or allowance checks", async () => {
    assert.equal(
        await readOrderStatus({}, d, order, { number: 1n, timestamp: 999n }),
        "not-started",
    );
});
