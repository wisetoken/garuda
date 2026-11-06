import test from "node:test";
import assert from "node:assert/strict";
import {
  keccak256,
  parseEther,
  encodeAbiParameters,
  encodeEventTopics,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  publishSale,
  fillSale,
  cancelSale,
} from "../src/lib/blend/sales-wallet.ts";
import { parseSignedSale } from "../src/lib/blend/sales.ts";
import {
  SEAPORT,
  SALES_TREASURY,
  saleAmounts,
  zoneAbi,
  seaportAbi,
} from "../src/lib/blend/seaport.ts";
import { STAKE_COLLECTIONS } from "../src/lib/blend/stake-collections.ts";
import {
  prepareRecovery,
  readRecovery,
  rememberOrder,
  recoveryKey,
} from "../src/lib/market/recovery.ts";
import { orderAvailable, parseBook } from "../src/lib/market/api.ts";

// Synthetic accounts and an in-memory chain. These tests never use a network or wallet extension.
const seller = privateKeyToAccount(`0x${"11".repeat(32)}`);
const buyer = privateKeyToAccount(`0x${"22".repeat(32)}`);
const blockHash = `0x${"33".repeat(32)}`;
const d = {
  protocol: "seaport-1.6",
  environment: "ethereum-mainnet",
  chainId: 1,
  market: SEAPORT,
  adapter: `0x${"44".repeat(20)}`,
  collection: STAKE_COLLECTIONS.signature.address,
  currency: "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6",
  feeBps: 50,
  feeRecipient: SALES_TREASURY,
  guardian: seller.address,
  confirmations: 12,
  deploymentBlock: "1",
  deploymentBlockHash: blockHash,
  ...Object.fromEntries(
    [
      "marketCodeHash",
      "adapterCodeHash",
      "collectionCodeHash",
      "currencyCodeHash",
    ].map((k) => [k, keccak256("0x01")]),
  ),
};
const input = {
  kind: 0,
  tokenId: 40n,
  amount: parseEther("3000.000000000000000001"),
  days: 7,
  nonce: 1n,
};
function memory() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
}
function fixture(account = seller) {
  const state = {
    owner: seller.address,
    approved: false,
    allowance: 0n,
    balance: parseEther("50000"),
    paused: false,
    connected: true,
    writes: [],
    events: [],
    cancelled: false,
    order: undefined,
    logs: [],
    afterSimulation: () => {},
    afterWrite: () => {},
  };
  const client = {
    getChainId: async () => 1,
    getBlock: async () => ({ number: 100n, hash: blockHash, timestamp: 2000n }),
    getCode: async ({ address }) =>
      [seller.address, buyer.address].includes(address) ? "0x" : "0x01",
    readContract: async ({ functionName: n }) => {
      switch (n) {
        case "SEAPORT":
          return d.market;
        case "collection":
          return d.collection;
        case "WISE":
          return d.currency;
        case "FEE_BPS":
          return 50n;
        case "FEE_RECIPIENT":
          return d.feeRecipient;
        case "owner":
          return d.guardian;
        case "information":
          return ["1.6"];
        case "newActivityPaused":
          return state.paused;
        case "ownerOf":
          return state.owner;
        case "snapshot":
          return {
            stakeId: `0x${"55".repeat(16)}`,
            stateHash: `0x${"66".repeat(32)}`,
            maturesAt: 999999n,
            loanEligible: true,
          };
        case "assetEpoch":
          return 0n;
        case "getApproved":
          return state.approved ? d.market : zeroAddress;
        case "isApprovedForAll":
          return false;
        case "getCounter":
          return 0n;
        case "balanceOf":
          return state.balance;
        case "allowance":
          return state.allowance;
        case "getOrderStatus":
          return [false, state.cancelled, 0n, 1n];
        case "getOrderHash":
          return parseSignedSale(state.order, d).hash;
        default:
          throw new Error(`Unexpected read ${n}`);
      }
    },
    simulateContract: async (request) => {
      state.afterSimulation();
      return { request };
    },
    waitForTransactionReceipt: async ({ confirmations }) => {
      assert.equal(confirmations, 12);
      return { status: "success", logs: state.logs };
    },
  };
  const session = {
    client,
    deployment: d,
    address: account.address,
    assertWallet: async () => {
      if (!state.connected) throw new Error("Wallet changed");
    },
    wallet: {
      account,
      chain: { id: 1 },
      getChainId: async () => 1,
      signTypedData: async (args) => {
        state.events.push("signed");
        return account.signTypedData(args);
      },
      writeContract: async (call) => {
        state.writes.push(call);
        if (call.functionName === "approve") {
          if (call.address === d.collection) state.approved = true;
          else state.allowance = call.args[1];
        }
        if (call.functionName === "cancel") state.cancelled = true;
        state.afterWrite();
        return blockHash;
      },
    },
    rememberSignature: () => state.events.push("saved"),
    validateSale: async () => state.events.push("validated"),
  };
  return { state, session };
}
const publish = async (f) => {
  const signed = await publishSale(f.session, input, async () =>
    f.state.events.push("published"),
  );
  f.state.order = signed;
  return signed;
};
function eventLog(abi, eventName, address, args) {
  const item = abi.find((x) => x.type === "event" && x.name === eventName);
  const plain = item.inputs.filter((i) => !i.indexed);
  return {
    address,
    topics: encodeEventTopics({ abi, eventName, args }),
    data: encodeAbiParameters(
      plain,
      plain.map((i) => args[i.name]),
    ),
  };
}

test("listing approves only the selected NFT and persists before publication", async () => {
  const f = fixture();
  const signed = await publish(f);
  assert.deepEqual(f.state.events, ["signed", "saved", "published"]);
  assert.equal(f.state.writes.length, 1);
  assert.deepEqual(f.state.writes[0].args, [SEAPORT, 40n]);
  assert.equal(signed.order.amount, input.amount.toString());
  assert.equal(signed.order.deadline, String(2000 + 7 * 86400));
});
test("bids reset insufficient allowance and approve only the exact WISE amount", async () => {
  const f = fixture(buyer);
  f.state.allowance = 10n;
  await publishSale(f.session, { ...input, kind: 1 }, async () => {});
  assert.deepEqual(
    f.state.writes.map((x) => x.args),
    [
      [SEAPORT, 0n],
      [SEAPORT, input.amount],
    ],
  );
});
test("wallet change after simulation prevents the transaction", async () => {
  const f = fixture();
  f.state.afterSimulation = () => {
    f.state.connected = false;
  };
  await assert.rejects(() => publish(f), /Wallet changed/);
  assert.equal(f.state.writes.length, 0);
  assert.deepEqual(f.state.events, []);
});
test("ownership change during approval prevents an obsolete listing signature", async () => {
  const f = fixture();
  f.state.afterWrite = () => {
    f.state.owner = buyer.address;
  };
  await assert.rejects(() => publish(f), /Stake changed/);
  assert.deepEqual(f.state.events, []);
});
test("insufficient WISE prevents bid approval and signature", async () => {
  const f = fixture(buyer);
  f.state.balance = 1n;
  await assert.rejects(
    () => publishSale(f.session, { ...input, kind: 1 }, async () => {}),
    /Insufficient WISE/,
  );
  assert.equal(f.state.writes.length, 0);
  assert.deepEqual(f.state.events, []);
});
test("failed publication retains the signed order for cancellation", async () => {
  const f = fixture(),
    storage = memory();
  prepareRecovery(storage, d, seller.address);
  f.session.rememberSignature = (s) =>
    rememberOrder(storage, d, seller.address, s);
  await assert.rejects(
    () =>
      publishSale(f.session, input, async () => {
        throw new Error("API unavailable");
      }),
    /API unavailable/,
  );
  const [signed] = readRecovery(storage, d, seller.address);
  assert.equal(signed.order.tokenId, "40");
  await cancelSale(f.session, signed);
  assert.equal(f.state.writes.at(-1).functionName, "cancel");
  assert.equal(f.state.cancelled, true);
});
test("corrupt or inaccessible recovery storage blocks new signatures without overwriting", () => {
  const storage = memory(),
    key = recoveryKey(d, seller.address);
  storage.setItem(key, "invalid");
  assert.throws(() => prepareRecovery(storage, d, seller.address));
  assert.equal(storage.getItem(key), "invalid");
  assert.throws(
    () =>
      prepareRecovery(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Storage denied");
          },
        },
        d,
        seller.address,
      ),
    /Storage denied/,
  );
});
test("saved orders are deduplicated and scoped to their signing wallet", async () => {
  const f = fixture(),
    signed = await publish(f),
    storage = memory();
  rememberOrder(storage, d, seller.address, signed);
  rememberOrder(storage, d, seller.address, signed);
  assert.equal(readRecovery(storage, d, seller.address).length, 1);
  assert.deepEqual(readRecovery(storage, d, buyer.address), []);
  assert.throws(
    () => rememberOrder(storage, d, buyer.address, signed),
    /another wallet/,
  );
});
test("fills require current service validation and matching settlement events", async () => {
  const listing = fixture(),
    signed = await publish(listing),
    f = fixture(buyer);
  f.state.order = signed;
  f.state.approved = true;
  const { order, hash } = parseSignedSale(signed, d);
  const args = {
    orderHash: hash,
    tokenId: 40n,
    seller: seller.address,
    buyer: buyer.address,
    amount: input.amount,
    fee: saleAmounts(order).fee,
    kind: 0,
  };
  f.state.logs = [
    eventLog(zoneAbi, "SaleValidated", d.adapter, args),
    eventLog(seaportAbi, "OrderFulfilled", d.market, {
      orderHash: hash,
      offerer: seller.address,
      zone: d.adapter,
      recipient: buyer.address,
      offer: [],
      consideration: [],
    }),
  ];
  const receipt = await fillSale(f.session, signed);
  assert.equal(receipt.hash, hash);
  assert.equal(f.state.events.filter((x) => x === "validated").length, 2);
  assert.equal(f.state.writes.at(-1).functionName, "fulfillAdvancedOrder");
  const blocked = fixture(buyer);
  delete blocked.session.validateSale;
  await assert.rejects(
    () => fillSale(blocked.session, signed),
    /validation is required/,
  );
  assert.equal(blocked.state.writes.length, 0);
  f.state.logs = [];
  await assert.rejects(
    () => fillSale(f.session, signed),
    /No matching sale event/,
  );
});
test("only the signing wallet can cancel an order", async () => {
  const f = fixture(),
    signed = await publish(f),
    other = fixture(buyer);
  await assert.rejects(
    () => cancelSale(other.session, signed),
    /Only the signing wallet/,
  );
  assert.equal(other.state.writes.length, 0);
});
test("market hides expired and future orders and rejects mismatched identities", async () => {
  const f = fixture(),
    signed = await publish(f);
  const row = {
    ...signed,
    hash: parseSignedSale(signed, d).hash,
    status: "available",
  };
  assert.equal(orderAvailable(row, 1999), false);
  assert.equal(orderAvailable(row, 2000), true);
  assert.equal(orderAvailable(row, Number(row.order.deadline)), false);
  assert.throws(
    () =>
      parseBook({ orders: [{ ...row, hash: blockHash }], nextCursor: null }, d),
    /identity mismatch/,
  );
});

test("oversized amounts are rejected before any approval or signature", async () => {
  for (const kind of [0, 1]) {
    const f = fixture(kind === 0 ? seller : buyer);
    await assert.rejects(
      () => publishSale(f.session, { ...input, kind, amount: 1n << 128n }, async () => {}),
      /Invalid price or duration/,
    );
    assert.equal(f.state.writes.length, 0);
    assert.deepEqual(f.state.events, []);
  }
});


test("accepting a bid approves the owner's NFT, not the owner's WISE", async () => {
  const bidder = fixture(buyer);
  const signed = await publishSale(bidder.session, { ...input, kind: 1 }, async () => {});
  const owner = fixture(seller);
  owner.state.order = signed;
  owner.state.allowance = input.amount; // The bidder's WISE allowance.
  const { order, hash } = parseSignedSale(signed, d);
  owner.state.logs = [
    eventLog(zoneAbi, "SaleValidated", d.adapter, {
      orderHash: hash, tokenId: 40n, seller: seller.address, buyer: buyer.address,
      amount: input.amount, fee: saleAmounts(order).fee, kind: 1,
    }),
    eventLog(seaportAbi, "OrderFulfilled", d.market, {
      orderHash: hash, offerer: buyer.address, zone: d.adapter,
      recipient: seller.address, offer: [], consideration: [],
    }),
  ];
  await fillSale(owner.session, signed);
  assert.deepEqual(owner.state.writes.map(({ address, functionName }) => ({ address, functionName })), [
    { address: d.collection, functionName: "approve" },
    { address: d.market, functionName: "matchAdvancedOrders" },
  ]);
  assert.deepEqual(owner.state.writes[0].args, [d.market, 40n]);
  const wrongOwner = fixture(buyer);
  wrongOwner.state.order = signed;
  wrongOwner.state.allowance = input.amount;
  await assert.rejects(fillSale(wrongOwner.session, signed), /Only the stake owner/);
  assert.equal(wrongOwner.state.writes.length, 0);
});

test("an order becoming unavailable during approval prevents settlement", async () => {
  const listing = fixture(), signed = await publish(listing), f = fixture(buyer);
  f.state.order = signed;
  f.state.approved = true;
  let validations = 0;
  f.session.validateSale = async () => {
    if (++validations > 1) throw new Error("Order no longer available");
  };
  await assert.rejects(fillSale(f.session, signed), /Order no longer available/);
  assert.equal(f.state.writes.length, 1);
  assert.equal(f.state.writes[0].functionName, "approve");
  assert.equal(f.state.writes[0].address, d.currency);
});


test("success receipts use the accepted signed terms without exposing the signature", async () => {
  const {orderSuccess} = await import('../src/lib/market/success.ts');
  for(const kind of [0,1]) {
    const f=fixture(kind===0?seller:buyer);
    const signed=await publishSale(f.session,{...input,kind},async()=>{});
    const receipt=orderSuccess(signed,d,'/garuda/?screen=trade');
    assert.equal(receipt.hash,parseSignedSale(signed,d).hash);
    assert.equal(receipt.order.amount,String(input.amount));
    assert.equal(receipt.order.kind,kind);assert.equal(receipt.order.deadline,signed.order.deadline);
    assert.equal(receipt.signature,undefined);
  }
});
test("a failed publication keeps the recoverable signature and never produces a success result", async () => {
  const f=fixture();let succeeded=false;
  await assert.rejects(async()=>{
    await publishSale(f.session,input,async()=>{throw Error('publication offline')});
    succeeded=true;
  },/publication offline/);
  assert.equal(succeeded,false);assert.ok(f.state.events.includes('saved'));
});
