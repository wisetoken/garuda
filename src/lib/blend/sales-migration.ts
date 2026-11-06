import { keccak256, type PublicClient } from "viem";
import manifest from "../../../scripts/fixtures/signature-market.json";
import { parseSalesDeployment, SalesError, type SalesDeployment } from "./sales";
import { zoneAbi } from "./seaport";
import { paymentSchema } from "./payment-tokens";

/** Preserve the previous deployment for cancellation; never reinterpret its signatures as V2. */
export const legacySignatureDeployment = parseSalesDeployment(manifest);
export async function legacyTradingRetired(client: PublicClient, d: SalesDeployment, blockNumber?: bigint) {
  if (paymentSchema(d) !== 2) return true;
  const previous = legacySignatureDeployment;
  const [code, paused] = await Promise.all([
    client.getCode({address: previous.adapter, blockNumber}),
    client.readContract({address: previous.adapter, abi: zoneAbi, functionName: "newActivityPaused", blockNumber}),
  ]);
  if (!code || keccak256(code) !== previous.adapterCodeHash)
    throw new SalesError("code-changed", "The previous validator could not be verified.");
  return paused;
}
export async function assertLegacyTradingRetired(client: PublicClient, d: SalesDeployment) {
  if (!await legacyTradingRetired(client, d))
    throw new SalesError("paused", "The previous WISE market must be paused before V2 trading opens.");
}
