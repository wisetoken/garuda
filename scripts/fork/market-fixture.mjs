import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseSalesDeployment } from "../../src/lib/blend/sales.ts";
import { verifySalesDeployment } from "../../src/lib/blend/sales-chain.ts";

// Mutations are restricted to a disposable Anvil fork. No browser wallet or real key is used.
export async function marketFixture() {
  const rpcUrl = process.env.GARUDA_FORK_RPC ?? "http://127.0.0.1:18749";
  const endpoint = new URL(rpcUrl);
  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.username + endpoint.password + endpoint.search + endpoint.hash, "");
  assert.equal(endpoint.pathname, "/");
  const chain = defineChain({ id: 31337, name: "Garuda test fork",
    nativeCurrency: { name: "Fork ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } } });
  const transport = http(rpcUrl, { timeout: 60_000, retryCount: 0 });
  const client = createPublicClient({ chain, transport, pollingInterval: 100, cacheTime: 0 });
  assert.match(await client.request({ method: "web3_clientVersion" }), /anvil/i);
  assert.equal(await client.getChainId(), 31337);
  const metadata = JSON.parse(await readFile(new URL("../fixtures/signature-market.json", import.meta.url)));
  const deployment = parseSalesDeployment({ ...metadata, environment: "local-fork", chainId: 31337, rpcUrl, confirmations: 1 });
  await verifySalesDeployment(client, deployment);
  const snapshot = await client.request({ method: "evm_snapshot" });
  const restore = () => client.request({ method: "evm_revert", params: [snapshot] });
  try {
    const [seller, buyer, other] = Array.from({ length: 3 }, () => createWalletClient({
      account: privateKeyToAccount(generatePrivateKey()), chain, transport,
    }));
    const receipt = async (hash) => {
      const result = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
      assert.equal(result.status, "success");
      return result;
    };
    const nftAbi = parseAbi([
      "function ownerOf(uint256) view returns(address)",
      "function safeTransferFrom(address,address,uint256)",
      "function approve(address,uint256)",
    ]);
    const tokenAbi = parseAbi([
      "function UNISWAP_PAIR() view returns(address)",
      "function transfer(address,uint256) returns(bool)",
      "function approve(address,uint256) returns(bool)",
      "function balanceOf(address) view returns(uint256)",
      "function allowance(address,address) view returns(uint256)",
    ]);
    const fundGas = (address) => client.request({ method: "anvil_setBalance", params: [address, "0x56bc75e2d63100000"] });
    const impersonate = async (address, action) => {
      await client.request({ method: "anvil_impersonateAccount", params: [address] });
      await fundGas(address);
      try { await action(createWalletClient({ account: address, chain, transport })); }
      finally { await client.request({ method: "anvil_stopImpersonatingAccount", params: [address] }); }
    };
    for (const wallet of [seller, buyer, other]) await fundGas(wallet.account.address);
    const owner = (id) => client.readContract({ address: deployment.collection, abi: nftAbi, functionName: "ownerOf", args: [id] });
    for (const id of [20n, 53n]) {
      const from = await owner(id);
      await impersonate(from, async (wallet) => receipt(await wallet.writeContract({
        address: deployment.collection, abi: nftAbi, functionName: "safeTransferFrom",
        args: [from, seller.account.address, id], gas: 500000n,
      })));
    }
    const pool = await client.readContract({ address: deployment.currency, abi: tokenAbi, functionName: "UNISWAP_PAIR" });
    await impersonate(pool, async (wallet) => {
      for (const recipient of [seller, buyer, other]) await receipt(await wallet.writeContract({
        address: deployment.currency, abi: tokenAbi, functionName: "transfer",
        args: [recipient.account.address, parseEther("20000")], gas: 200000n,
      }));
    });
    const balance = (address) => client.readContract({ address: deployment.currency, abi: tokenAbi, functionName: "balanceOf", args: [address] });
    const session = (wallet) => ({ client, wallet, deployment, address: wallet.account.address,
      assertWallet: async () => assert.equal(await wallet.getChainId(), 31337),
    });
    return { client, deployment, seller, buyer, other, owner, balance, session, receipt, nftAbi, tokenAbi, restore };
  } catch (error) { await restore(); throw error; }
}
