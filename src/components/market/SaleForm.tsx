import { paymentToken, paymentTokens, supportedPaymentTokens, parsePaymentAmount, formatPaymentAmount, paymentUsd } from "../../lib/blend/payment-tokens";
import { usePaymentPrices } from "../../lib/market/payment-prices";
import { useFundingBalances } from "../../lib/blend/wallet-funding";
import { PurchaseFunding } from "./PurchaseFunding";
import { purchaseFundingTokens } from "../../lib/market/purchase-funding";
import type { PurchasePaymentQuote, PaymentReviewState } from "../../lib/market/purchase-payment";
import { CurrencyPicker } from "./CurrencyPicker";
import { DurationPicker } from "./DurationPicker";
import { TokenAmountInput } from "./TokenAmountInput";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";
import { getAddress, type Address } from "viem";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import {
  ethereumClient,
  useWiseUsd,
} from "../../lib/portfolio";
import {
  loadSignaturePortfolio,
  type SignaturePosition,
} from "../../lib/blend/live-portfolio";
import {
  stakeCollection,
  STAKE_COLLECTIONS,
} from "../../lib/blend/stake-collections";
import { amountInput } from "../../lib/blend/domain";
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
import { CancellationOrderDetails, SaleStakeDetails } from "./SaleStakeDetails";
import { useAppToast, useErrorToast } from "../AppToast";
import { reviewReadiness } from "../../lib/market/review-readiness";

export function SaleForm({
  intent,
  busy,
  busyLabel,
  blocked,
  execute,
  connect,
  switchChain,
  correctChain,
  onBid,
}: {
  intent: MarketIntent;
  busy: boolean;
  busyLabel: string;
  blocked: boolean;
  execute: (price: string, days: number, approvalOnly?: boolean, fundingQuote?: PurchasePaymentQuote, currency?: Address) => Promise<boolean | void>;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  correctChain: boolean;
  onBid: (position: SignaturePosition) => void;
}) {
  const { showToast } = useAppToast();
  const account = useActiveAccount(),
    { data: usd } = useWiseUsd(),
    markets = useMarkets();
  const prices = usePaymentPrices(), tokenBalances = useFundingBalances(account?.address);
  const [selectedCurrency, setCurrency] = useState<Address>(paymentTokens[0].address);
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
    // Cancellation details refresh independently of permission to cancel.
    staleTime: 0,
  });
  const position =
    live.data ?? ("position" in intent ? intent.position : intent.initialPosition);
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
  const tokens = supportedPaymentTokens(config.data?.enabled ? config.data.deployment : {});
  const currency = "row" in intent ? getAddress(intent.row.order.currency) : tokens.some(token => token.address === selectedCurrency) ? selectedCurrency : paymentTokens[0].address;
  const [selectedPayWith, setPayWith] = useState<Address>();
  const [paymentReview,setPaymentReview] = useState<PaymentReviewState>({});
  const payWith = selectedPayWith ?? currency;
  const converting = intent.kind === "fill" && intent.row.order.kind === 0 && payWith !== currency;
  const token = paymentToken(currency);
  const tokenAmount = (amount: bigint) => formatPaymentAmount(amount, currency);
  const tokenUsd = (amount: bigint) => paymentUsd(amount, currency, prices);
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
  const spender = config.data?.enabled ? config.data.deployment.market : undefined;
  const allowance = useQuery({
    queryKey: ["bid-allowance", account?.address.toLowerCase(), currency, spender],
    queryFn: () => ethereumClient.readContract({
      address: currency, abi: tokenSalesAbi, functionName: "allowance",
      args: [getAddress(account!.address), spender!],
    }),
    enabled: intent.kind === "bid" && !!account && !!spender && correctChain,
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const balanceLabel = balance.data !== undefined
    ? `${tokenAmount(balance.data)} ${token.symbol}`
    : account && balance.isFetching ? "Loading…" : "—";
  let amount: bigint | undefined,
    amountError = "";
  try {
    amount =
      "row" in intent ? BigInt(intent.row.order.amount) : parsePaymentAmount(price, currency);
  } catch (error) {
    amount = undefined;
    amountError = error instanceof Error ? error.message : "Enter a valid amount.";
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
  const insufficient = paying && amount !== undefined && balance.data !== undefined &&
    amount > balance.data;
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
  const needsApproval = intent.kind === "bid" && amount !== undefined && allowance.data !== undefined && allowance.data < amount;
  const allowanceBlocked = intent.kind === "bid" && (allowance.data === undefined || allowance.isError);
  useErrorToast("bid-allowance", intent.kind === "bid" && allowance.isError && !allowance.isFetching && `Could not check ${token.symbol} approval. Please try again.`, () => void allowance.refetch());
  const action =
    intent.kind === "list"
      ? "Sign & publish listing"
      : intent.kind === "bid"
        ? (needsApproval ? `Approve ${token.symbol}` : "Sign & publish bid")
        : intent.kind === "cancel"
          ? (intent.row.order.kind === 0 ? "Cancel Sale" : "Cancel")
          : buy
            ? "Confirm purchase"
            : "Accept bid";
  const readiness = reviewReadiness({ kind: intent.kind, paying: paying && !!account, config, live, availability, balance });
  const retryReview = () => {
    void config.refetch();
    if (intent.kind !== "cancel") void live.refetch();
    if (intent.kind === "fill") void availability.refetch();
    if (account && intent.kind !== "cancel") void balance.refetch();
  };
  useErrorToast("sale-review", !busy && readiness.failure, retryReview);
  useErrorToast("sale-wallet-read", !paying && intent.kind !== "cancel" && balance.isError && !balance.isFetching && `Could not read your ${token.symbol} balance. Please try again.`, () => void balance.refetch());
  useErrorToast("sale-owner", !!wrongOwner && "Connect the appropriate owner or buyer wallet for this action.");
  const showInsufficientBalance = !converting && !!account && insufficient && !balance.isError &&
    !busy && !readiness.checking;
  const paymentBlocked = converting && (!paymentReview.quote || paymentReview.loading || paymentReview.insufficient || paymentReview.unknownBalance || paymentReview.expired);
  const submitBlocked = paymentBlocked || !account || !correctChain || busy || blocked || !!wrongOwner ||
    readiness.blocked || allowanceBlocked || (!converting && insufficient) || amount === undefined;
  function validateAmount() {
    setTouched(true);
    if (price.trim() && amount === undefined) showToast(amountError || `Enter a valid ${token.symbol} amount.`, { id: "sale-amount", tone: "error" });
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!submitBlocked) void execute(price, days, needsApproval, converting ? paymentReview.quote : undefined, currency);
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
                : `Review the position and the exact ${token.symbol} payment.`}
        </p>
      </header>
      <div className={`sale-layout${"row" in intent ? " sale-layout--review" : ""}`}>
        <SaleStakeDetails
          name={meta.name}
          tokenId={tokenId}
          position={position}
          usd={usd}
          fallback={intent.kind === "cancel" ? <CancellationOrderDetails order={intent.row.order} /> : undefined}
        />
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
                <CurrencyPicker disabled={busy} value={currency} tokens={tokens} balances={tokenBalances.data} prices={prices}
                  onChange={value => { if(value !== currency) { setCurrency(value); setPrice(""); setTouched(false); } }} />
              </div>
              <p className="sale-amount-usd" id="sale-price-usd">
                <span>{amount === undefined ? "USD estimate" : tokenUsd(amount)}</span>
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
          ) : buy && amount !== undefined ? (
            <PurchaseFunding key={`${account?.address ?? "disconnected"}:${intent.row.hash}`} buyer={account ? getAddress(account.address) : undefined}
              currency={currency} payWith={payWith} onPayWithChange={token => {setPaymentReview({});setPayWith(token);}} orderHash={intent.row.hash} price={amount}
              busy={busy} deployment={config.data?.enabled ? config.data.deployment : undefined} blocked={!correctChain || blocked || !!wrongOwner || readiness.blocked}
              onReviewChange={setPaymentReview} />
          ) : (
            <div className="sale-price-summary">
              <div className="sale-price-heading">
                <span className="sale-label">
                  {buy ||
                  (intent.kind === "cancel" && intent.row.order.kind === 0)
                    ? "Asking price"
                    : "Bid price"}
                </span>
              </div>
              <p className="sale-total">
                {amount === undefined ? "—" : tokenAmount(amount)}{" "}
                <small>{token.symbol}</small>
              </p>
            </div>
          )}
          <div className="sale-terms-details">
            {amounts && (
              <dl className="sale-breakdown">
                <div>
                  <dt>Buyer pays</dt>
                  <dd>{tokenAmount(amounts.gross)} {token.symbol}</dd>
                </div>
                <div>
                  <dt>Marketplace fee ({feeBps / 100}%)</dt>
                  <dd>{tokenAmount(amounts.fee)} {token.symbol}</dd>
                </div>
                <div>
                  <dt>Seller receives</dt>
                  <dd>{tokenAmount(amounts.net)} {token.symbol}</dd>
                </div>
              </dl>
            )}
            {buy && (
              <button
                className="sale-bid-link"
                type="button"
                disabled={busy || !position}
                onClick={() => { if (position) onBid(position); }}
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
                    : `${tokenAmount(balance.data)} ${token.symbol}`}
                </strong>
              </div>
            )}
            {intent.kind === "fill" && <TradeCounterparty row={intent.row} />}
            {(intent.kind === "cancel" || (intent.kind === "fill" && !buy)) && (
              <p className="sale-fineprint">{tradeInstructions(intent)}</p>
            )}
          </div>
        </section>
      </div>
      <footer className="sale-footer">
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
            className={`stake-primary${showInsufficientBalance ? " sale-insufficient-balance" : ""}`}
            type="submit"
            disabled={submitBlocked}
            aria-busy={busy || readiness.checking}
          >
            {(busy || readiness.checking) && <LoaderCircle className="sale-loading" size={18} aria-hidden="true" />}
            <span aria-live="polite">{
              busy ? busyLabel : readiness.checking || (allowanceBlocked && allowance.isFetching) ? "Checking…" :
                converting ? paymentReview.loading ? "Getting payment quote…" : paymentReview.insufficient ? "Insufficient payment balance" : !config.data?.enabled || !config.data.deployment.purchaseRouter ? "Payment option unavailable" : !paymentReview.quote ? "Refresh payment quote" : `Buy with ${purchaseFundingTokens.find(t => t.address === payWith)?.symbol ?? "tokens"}` : showInsufficientBalance ? `Insufficient ${token.symbol} balance` : action
            }</span>
          </button>
        )}
      </footer>
    </form>
  );
}
