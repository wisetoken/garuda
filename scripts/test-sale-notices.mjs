import assert from "node:assert/strict";
import test from "node:test";
import { createSaleNotice, mergeSaleNotices, saleNoticeFromActivity } from "../src/lib/market/sale-notices.ts";

const seller = "0x220700000000000000000000000000000000cF37";
const tx = "0x" + "ab".repeat(32);

test("a confirmed sale is addressed to the stake owner", () => {
    const notice = createSaleNotice({
        seller,
        collection: "0x48791dbdfb38baa58e48329148c321bf33b3c1e1",
        tokenId: "20",
        net: 1_094_500_000_000_000_000n,
        transactionHash: tx,
    });
    assert.equal(notice?.seller, seller.toLowerCase());
    assert.equal(notice?.id, `sale:${tx}`);
    assert.equal(notice?.tokenId, "20");
    assert.equal(createSaleNotice({ ...{ seller: "not-an-address", collection: "", tokenId: "1", net: 1n, transactionHash: tx } }), null);
});

test("indexed sales notify the seller, not the buyer", () => {
    const sold = saleNoticeFromActivity({
        event_name: "SaleValidated",
        tx_hash: tx,
        payload: { seller, buyer: "0x641a00000000000000000000000000000000e689", tokenId: "40", amount: "1000", fee: "5" },
    });
    assert.equal(sold?.seller, seller.toLowerCase());
    assert.equal(sold?.net, "995");
    assert.equal(saleNoticeFromActivity({
        event_name: "OrderFulfilled",
        tx_hash: tx,
        payload: { seller, tokenId: "40", amount: "1000" },
    }), null);
});

test("a local receipt keeps the collection when the same sale is also indexed", () => {
    const local = createSaleNotice({
        seller, collection: "0x48791dbdfb38baa58e48329148c321bf33b3c1e1", tokenId: "20", net: 10n, transactionHash: tx,
    });
    const indexed = saleNoticeFromActivity({
        event_name: "SaleValidated", tx_hash: tx, payload: { seller, tokenId: "20", amount: "10", fee: "0" },
    });
    const [notice] = mergeSaleNotices([local], [indexed]);
    assert.equal(notice.collection, "0x48791dbdfb38baa58e48329148c321bf33b3c1e1");
    assert.equal(mergeSaleNotices([local], [indexed]).length, 1);
});
