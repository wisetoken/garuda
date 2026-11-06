import { paymentToken, paymentTokens } from "../blend/payment-tokens";
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
import {
  executeWiseFunding, fundingPath, fundingTokens, FUNDING_WISE, minimumFundingOutput,
  quoteFundingInput, quoteWiseFunding, type FundingQuote,
} from "../blend/wise-funding";

export const purchaseFundingTokens = [...fundingTokens.filter(token => token.symbol !== "DAI"), paymentTokens[0]];
export type PurchaseFundingQuote = {
  swap: FundingQuote;
  buyer: Address;
  orderHash: Hex;
  shortfall: bigint;
  mode?: "full";
};

export function purchaseShortfall(price: bigint, balance: bigint) {
  return price > balance ? price - balance : 0n;
}

export function purchaseFundingTarget(price: bigint, balance: bigint, mode?: "full") {
  if (mode !== undefined && mode !== "full") throw new Error("Invalid funding mode.");
  return mode === "full" ? price : purchaseShortfall(price, balance);
}

export async function quotePurchaseFunding(client: PublicClient, input: {
  token: Address; buyer: Address; orderHash: Hex; price: bigint; balance: bigint; slippage: number; currency?: Address; mode?: "full";
}): Promise<PurchaseFundingQuote> {
  if (!purchaseFundingTokens.some(token => token.address === getAddress(input.token)))
    throw new Error("Choose ETH, WETH or USDC, or fund with WISE.");
  const currency = input.currency ?? FUNDING_WISE;
  paymentToken(currency);
  const shortfall = purchaseFundingTarget(input.price, input.balance, input.mode);
  if (shortfall === 0n) throw new Error("You already have enough of the payment token. Review the purchase.");
  const amount = await quoteFundingInput(client, input.token, shortfall, input.slippage, currency);
  const swap = await quoteWiseFunding(client, input.token, amount, input.slippage, currency);
  if (swap.minimum < shortfall) throw new Error("The quote moved. Refresh it to cover the missing payment.");
  return { swap, buyer: input.buyer, orderHash: input.orderHash, shortfall, ...(input.mode ? {mode: input.mode} : {}) };
}

export function validatePurchaseFunding(quote: PurchaseFundingQuote, buyer: Address, orderHash: Hex, shortfall: bigint, currency: Address = FUNDING_WISE) {
  if (quote.mode !== undefined && quote.mode !== "full") throw new Error("Invalid funding mode.");
  if (quote.buyer.toLowerCase() !== buyer.toLowerCase() || quote.orderHash !== orderHash)
    throw new Error("Wallet or listing changed. Get a new swap quote.");
  if (shortfall === 0n || shortfall !== quote.shortfall)
    throw new Error("Your payment token balance changed. Refresh the quote before swapping.");
  const q = quote.swap;
  const wrap = fundingPath(q.token,currency).length === 1;
  if (getAddress(q.outputToken ?? FUNDING_WISE) !== getAddress(currency) || !purchaseFundingTokens.some(token => token.address === getAddress(q.token)) ||
      q.amount <= 0n || q.minimum < shortfall ||
      q.minimum !== (wrap ? q.amount : minimumFundingOutput(q.output, q.slippage)) ||
      q.path.join(":").toLowerCase() !== fundingPath(q.token,currency).join(":").toLowerCase())
    throw new Error("The swap quote cannot cover this purchase. Get a new quote.");
}

export async function executePurchaseFunding(
  session: Parameters<typeof executeWiseFunding>[0], quote: PurchaseFundingQuote,
  orderHash: Hex, readShortfall: () => Promise<bigint>, verifyOrder: () => Promise<void>, currency: Address = FUNDING_WISE,
) {
  const review = async () => {
    await session.guard();
    validatePurchaseFunding(quote, session.address, orderHash, await readShortfall(), currency);
    await verifyOrder();
  };
  await review();
  // Recheck after a token approval, before requesting the swap transaction.
  // Funding and the NFT purchase are separate, explicit wallet actions.
  return executeWiseFunding({ ...session, beforeSwap: review }, quote.swap);
}
