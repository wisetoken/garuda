// Explicit integration check: npm run test:market:fork. Requires a disposable local Anvil mainnet fork.
import assert from "node:assert/strict";
import { parseEther } from "viem";
import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { viemAdapter } from "thirdweb/adapters/viem";
import { marketFixture } from "./fork/market-fixture.mjs";
import { publishSale, fillSale, cancelSale } from "../src/lib/blend/sales-wallet.ts";
import { parseSignedSale } from "../src/lib/blend/sales.ts";
import { verifySalesDeployment, verifySignedSale } from "../src/lib/blend/sales-chain.ts";
import { saleAmounts, zoneAbi } from "../src/lib/blend/seaport.ts";

const f = await marketFixture();
const { client, deployment: d, seller, buyer, other } = f;
try {
  // A local order catalog exercises publication and fresh chain validation without
  // publishing test signatures to the live API. Contract execution is real EVM execution.
  const catalog = new Map();
  const verify = async (signed) => verifySignedSale(client, d, signed, await verifySalesDeployment(client, d));
  const publish = async (signed) => {
    const checked = await verify(signed);
    assert.equal(checked.status, "available");
    catalog.set(checked.hash, signed);
  };
  const session = (wallet) => ({ ...f.session(wallet), validateSale: async (signed) => {
    const hash = parseSignedSale(signed, d).hash;
    assert.ok(catalog.has(hash), "Order must be published before filling");
    assert.equal((await verify(signed)).status, "available");
  }});
  // Exercise the same Thirdweb-to-viem adapter used by the browser for the buyer.
  const buyerSession = session(buyer);
  buyerSession.wallet = viemAdapter.walletClient.toViem({
    account: viemAdapter.walletClient.fromViem({ walletClient: buyer }),
    client: createThirdwebClient({ clientId: "11111111111111111111111111111111" }),
    chain: defineChain({ id: 31337, rpc: d.rpcUrl }),
  });
  const balances = async () => Promise.all([f.balance(seller.account.address), f.balance(buyer.account.address), f.balance(d.feeRecipient)]);
  const snapshot = (id) => client.readContract({ address: d.adapter, abi: zoneAbi, functionName: "snapshot", args: [id] });
  let nonce = 1n;
  const sign = (wallet, tokenId, kind, amount = parseEther("1000")) => publishSale(session(wallet), { kind, tokenId, amount, days: 7, nonce: nonce++ }, publish);
  for (const id of [20n, 53n]) {
    const stakeBefore = await snapshot(id);
    const ask = await sign(seller, id, 0);
    const before = await balances();
    const purchased = await fillSale(buyerSession, ask);
    const after = await balances();
    const { gross, fee, net } = saleAmounts(purchased.order);
    assert.equal((await f.owner(id)).toLowerCase(), buyer.account.address.toLowerCase());
    assert.equal(after[0] - before[0], net);
    assert.equal(before[1] - after[1], gross);
    assert.equal(after[2] - before[2], fee);
    assert.deepEqual(await snapshot(id), stakeBefore, "Ownership transfer preserves the underlying stake");
    await assert.rejects(fillSale(session(other), ask));
    console.log(`PASS Signature #${id}: listing purchase transfers the NFT, exact seller proceeds and fee; replay rejected`);

    // The old owner now bids to acquire it back. The new owner accepts without any WISE allowance.
    const bid = await sign(seller, id, 1, parseEther("900"));
    const beforeBid = await balances();
    const allowance = await client.readContract({ address: d.currency, abi: f.tokenAbi,
      functionName: "allowance", args: [buyer.account.address, d.market] });
    assert.equal(allowance, 0n);
    await assert.rejects(fillSale(session(other), bid), /Only the stake owner/);
    const accepted = await fillSale(buyerSession, bid);
    const afterBid = await balances();
    const bidAmounts = saleAmounts(accepted.order);
    assert.equal((await f.owner(id)).toLowerCase(), seller.account.address.toLowerCase());
    assert.equal(beforeBid[0] - afterBid[0], bidAmounts.gross);
    assert.equal(afterBid[1] - beforeBid[1], bidAmounts.net);
    assert.equal(afterBid[2] - beforeBid[2], bidAmounts.fee);
    assert.deepEqual(await snapshot(id), stakeBefore);
    await assert.rejects(fillSale(buyerSession, bid));
    console.log(`PASS Signature #${id}: owner accepts bid, receives net WISE and transfers NFT to bidder; stake terms preserved`);
  }
  const cancelled = await sign(seller, 53n, 0);
  await cancelSale(session(seller), cancelled);
  await assert.rejects(fillSale(buyerSession, cancelled));
  const unfunded = await sign(buyer, 53n, 1);
  await f.receipt(await buyer.writeContract({ address: d.currency, abi: f.tokenAbi,
    functionName: "transfer", args: [other.account.address, await f.balance(buyer.account.address)] }));
  await assert.rejects(fillSale(session(seller), unfunded));
  assert.equal((await f.owner(53n)).toLowerCase(), seller.account.address.toLowerCase());
  const expired = await sign(seller, 53n, 0);
  await client.request({ method: "evm_increaseTime", params: [8 * 86400] });
  await client.request({ method: "evm_mine" });
  await assert.rejects(fillSale(session(other), expired));
  console.log("PASS cancelled listings, unfunded bids and expired orders cannot transfer a stake");
} finally {
  await f.restore();
}
