import { CurrencyPicker } from "./CurrencyPicker";
import { DurationPicker } from "./DurationPicker";
import { TokenAmountInput } from "./TokenAmountInput";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";
import { getAddress } from "viem";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import {
  ethereumClient,
  useWiseUsd,
  wiseAmount,
  usdAmount,
} from "../../lib/portfolio";
import {
  loadSignaturePortfolio,
  type SignaturePosition,
} from "../../lib/blend/live-portfolio";
import {
  stakeCollection,
  STAKE_COLLECTIONS,
} from "../../lib/blend/stake-collections";
import {
  stakeDate,
  stakeTimeline,
  stakeYield,
} from "../../lib/blend/stake-art";
import { parseAmount, formatAmount, amountInput } from "../../lib/blend/domain";
import { saleAmounts } from "../../lib/blend/seaport";
import {
  sameAddress,
  tokenSalesAbi,
  type SaleRow,
} from "../../lib/blend/sales";
import { marketApi, useMarkets } from "../../lib/market/api";
import type { MarketIntent } from "../../lib/market/types";
import { tradeInstructions } from "../../lib/market/workflow";
import { TradeCounterparty } from "./TradeCounterparty";
import { useAppToast, useErrorToast } from "../AppToast";
import { reviewReadiness } from "../../lib/market/review-readiness";

export function SaleForm({
  intent,
  busy,
  status,
  blocked,
  execute,
  connect,
  switchChain,
  correctChain,
  onBid,
}: {
  intent: MarketIntent;
  busy: boolean;
  status: string;
  blocked: boolean;
  execute: (price: string, days: number) => Promise<void>;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  correctChain: boolean;
  onBid: (position: SignaturePosition) => void;
}) {
  const { showToast } = useAppToast();
  const account = useActiveAccount(),
    { data: usd } = useWiseUsd(),
    markets = useMarkets();
  const [price, setPrice] = useState(() =>
      intent.kind === "list" ? amountInput(intent.position.principal) : "",
    ),
    [days, setDays] = useState(7),
    [touched, setTouched] = useState(false);
  const collection =
      "position" in intent
        ? (intent.position.collection ?? STAKE_COLLECTIONS.signature.address)
        : getAddress(intent.row.order.collection),
    meta = stakeCollection(collection);
  const tokenId =
    "position" in intent ? intent.position.tokenId : intent.row.order.tokenId;
  const owner =
    "position" in intent ? intent.position.owner : intent.row.order.owner;
  const config = markets[meta.id === "signature" ? 0 : 1];
  const live = useQuery({
    queryKey: ["market-review", collection, tokenId, owner],
    queryFn: async () => {
      const p = await loadSignaturePortfolio(
        ethereumClient,
        owner,
        1,
        collection,
        [String(tokenId)],
      );
      return p.positions[0];
    },
    enabled: intent.kind !== "cancel",
    staleTime: 0,
  });
  const position =
    live.data ?? ("position" in intent ? intent.position : undefined);
  const availability = useQuery({
    queryKey: [
      "market-order-review",
      intent.kind === "fill" ? intent.row.hash : "",
    ],
    queryFn: () =>
      marketApi<SaleRow>(
        meta.id,
        `sales/${intent.kind === "fill" ? intent.row.hash : ""}`,
      ),
    enabled: intent.kind === "fill",
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const currency = config.data?.enabled
    ? config.data.deployment.currency
    : "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6";
  const balance = useQuery({
    queryKey: ["wise-balance", account?.address.toLowerCase(), 1, currency],
    queryFn: () =>
      ethereumClient.readContract({
        address: currency,
        abi: tokenSalesAbi,
        functionName: "balanceOf",
        args: [getAddress(account!.address)],
      }),
    enabled: !!account && intent.kind !== "cancel",
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
  const balanceLabel = balance.data !== undefined
    ? `${wiseAmount(balance.data)} WISE`
    : account && balance.isFetching ? "Loading…" : "—";
  const balanceUsd = balance.data !== undefined && usd
    ? usdAmount(balance.data, usd)
    : !account ? "Connect wallet" : undefined;
  let amount: bigint | undefined,
    amountError = "";
  try {
    amount =
      "row" in intent ? BigInt(intent.row.order.amount) : parseAmount(price);
  } catch {
    amount = undefined;
  }
  if (amount !== undefined && amount >= (1n << 128n)) {
    amount = undefined;
    amountError = "This amount exceeds the supported order limit.";
  }
  const feeBps = config.data?.enabled
    ? config.data.deployment.feeBps
    : meta.purchaseFeeBps;
  const amounts =
    amount === undefined ? undefined : saleAmounts({ amount, feeBps });
  const buy = intent.kind === "fill" && intent.row.order.kind === 0;
  const paying = intent.kind === "bid" || buy;
  const wrongOwner =
    account &&
    (((intent.kind === "list" || (intent.kind === "fill" && !buy)) &&
      !sameAddress(account.address, owner)) ||
      (intent.kind === "bid" && sameAddress(account.address, owner)) ||
      (buy && sameAddress(account.address, owner)) ||
      (intent.kind === "cancel" &&
        !sameAddress(account.address, intent.row.order.maker)));
  const insufficient =
    paying &&
    amount !== undefined &&
    balance.data !== undefined &&
    balance.data < amount;
  const title =
    intent.kind === "list"
      ? "List your stake"
      : intent.kind === "bid"
        ? "Place a bid"
        : intent.kind === "cancel"
          ? "Cancel this order"
          : buy
            ? "Review purchase"
            : "Accept this bid";
  const action =
    intent.kind === "list"
      ? "Sign & publish listing"
      : intent.kind === "bid"
        ? "Sign & publish bid"
        : intent.kind === "cancel"
          ? (intent.row.order.kind === 0 ? "Cancel Sale" : "Cancel Bid")
          : buy
            ? "Confirm purchase"
            : "Accept Bid";
  const timeline = position ? stakeTimeline(position) : undefined,
    yieldValue = position ? stakeYield(position) : null;
  const readiness = reviewReadiness({ kind: intent.kind, paying: paying && !!account, config, live, availability, balance });
  const retryReview = () => {
    void config.refetch();
    if (intent.kind !== "cancel") void live.refetch();
    if (intent.kind === "fill") void availability.refetch();
    if (account && intent.kind !== "cancel") void balance.refetch();
  };
  useErrorToast("sale-review", readiness.failure, retryReview);
  useErrorToast("sale-wallet-read", !paying && intent.kind !== "cancel" && balance.isError && !balance.isFetching && "Could not read your WISE balance. Please try again.", () => void balance.refetch());
  useErrorToast("sale-owner", !!wrongOwner && "Connect the appropriate owner or buyer wallet for this action.");
  useErrorToast("sale-balance", !!insufficient && (buy || touched) && "Your WISE balance does not cover this amount.");
  const submitBlocked = !account || !correctChain || busy || blocked || !!wrongOwner ||
    readiness.blocked || insufficient || amount === undefined;
  function validateAmount() {
    setTouched(true);
    if (price.trim() && amount === undefined) showToast(amountError || "Enter a valid WISE amount.", { id: "sale-amount", tone: "error" });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!submitBlocked) void execute(price, days);
      }}
    >
      <header className="sale-heading">
        <h2 id="sale-title">{title}</h2>
        <p>
          {intent.kind === "list"
            ? "Set your asking price and how long the listing stays open."
            : intent.kind === "bid"
              ? "Choose your price for full stake ownership."
              : intent.kind === "cancel"
                ? "Cancel the signed order so it can no longer be filled."
                : "Review the position and the exact WISE payment."}
        </p>
      </header>
      <div className="sale-layout">
        <section className="sale-position">
          <div className="sale-identity">
            <img src="/wiseone-logo.png" width="40" height="48" alt="" />
            <div>
              <span>WISE / Ethereum</span>
              <h3>
                {meta.name} Stake #{tokenId}
              </h3>
            </div>
          </div>
          {position && (
            <>
              <div className="sale-status">
                <span>{timeline?.status}</span>
                <span>{timeline?.caption}</span>
              </div>
              <dl className="sale-facts">
                <div>
                  <dt>Staked principal</dt>
                  <dd>
                    {wiseAmount(position.principal)} WISE
                    <small>{usdAmount(position.principal, usd)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Unclaimed interest</dt>
                  <dd>
                    {wiseAmount(position.unclaimedInterest)} WISE
                    <small>{usdAmount(position.unclaimedInterest, usd)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Annualized yield</dt>
                  <dd>
                    {yieldValue === null ? "—" : `${yieldValue.toFixed(2)}%`}
                  </dd>
                </div>
              </dl>
              <div className="sale-dates">
                <div>
                  <span>Started / UTC</span>
                  <strong>{stakeDate(position.startAt)}</strong>
                </div>
                <div>
                  <span>Maturity / UTC</span>
                  <strong>{stakeDate(position.maturesAt)}</strong>
                </div>
              </div>
            </>
          )}
        </section>
        <section className="sale-terms">
          {intent.kind === "list" || intent.kind === "bid" ? (
            <>
              <label htmlFor="sale-price">
                {intent.kind === "list" ? "Asking price" : "Your bid"}
              </label>
              <div className="sale-amount">
                <TokenAmountInput
                  id="sale-price"
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  disabled={busy}
                  onBlur={validateAmount}
                  onValueChange={setPrice}
                  aria-invalid={touched && amount === undefined}
                  aria-describedby="sale-price-usd"
                />
                <CurrencyPicker disabled={busy} balanceLabel={balanceLabel} balanceUsd={balanceUsd} />
              </div>
              <p className="sale-amount-usd" id="sale-price-usd">
                <span>{amount === undefined ? "USD estimate" : usdAmount(amount, usd)}</span>
                <span className="sale-amount-balance">Balance: <strong>{balanceLabel}</strong></span>
              </p>
              <DurationPicker
                id="sale-days"
                label={intent.kind === "list" ? "Listing duration" : "Bid duration"}
                value={days}
                onChange={setDays}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <span className="sale-label">
                {buy ||
                (intent.kind === "cancel" && intent.row.order.kind === 0)
                  ? "Asking price"
                  : "Bid price"}
              </span>
              <p className="sale-total">
                {amount === undefined ? "—" : formatAmount(amount, 18)}{" "}
                <small>WISE</small>
              </p>
              <p className="sale-fineprint">{usdAmount(amount, usd)}</p>
            </>
          )}
          {amounts && (
            <dl className="sale-breakdown">
              <div>
                <dt>Buyer pays</dt>
                <dd>{formatAmount(amounts.gross, 18)} WISE</dd>
              </div>
              <div>
                <dt>Marketplace fee ({feeBps / 100}%)</dt>
                <dd>{formatAmount(amounts.fee, 18)} WISE</dd>
              </div>
              <div>
                <dt>Seller receives</dt>
                <dd>{formatAmount(amounts.net, 18)} WISE<small>{usdAmount(amounts.net, usd)}</small></dd>
              </div>
            </dl>
          )}
          {buy && position && (
            <button
              className="sale-bid-link"
              type="button"
              disabled={busy}
              onClick={() => onBid(position)}
            >
              Place a bid instead <ArrowUpRight size={16} />
            </button>
          )}
          {buy && account && (
            <div className="sale-wallet-balance">
              <span>Wallet balance</span>
              <strong>
                {balance.data === undefined
                  ? (balance.isFetching ? "Checking…" : "—")
                  : `${wiseAmount(balance.data)} WISE`}
              </strong>
            </div>
          )}
          {intent.kind === "fill" && <TradeCounterparty row={intent.row} />}
          {intent.kind !== "list" && intent.kind !== "bid" && (
            <p className="sale-fineprint">{tradeInstructions(intent)}</p>
          )}
        </section>
      </div>
      <footer className="sale-footer">
        {status && <p role="status">{status}</p>}
        {!account ? (
          <button
            className="stake-primary"
            type="button"
            onClick={() => void connect()}
          >
            Connect wallet
          </button>
        ) : !correctChain ? (
          <button
            className="stake-primary"
            type="button"
            disabled={busy}
            onClick={() => void switchChain()}
          >
            Switch to Ethereum
          </button>
        ) : (
          <button
            className="stake-primary"
            type="submit"
            disabled={submitBlocked}
            aria-busy={busy || readiness.checking}
          >
            {(busy || readiness.checking) && <LoaderCircle className="sale-loading" size={18} aria-hidden="true" />}
            {busy ? "Check your wallet…" : readiness.checking ? "Checking…" : action}
          </button>
        )}
      </footer>
    </form>
  );
}
