// Shared types for the Staking page (table, cards, subgraph payloads).
// Mirrors the Referrals page structure; the data is a wallet's own WISE stakes.

// Raw stake object from the wise-token subgraph (staker's own stakes).
export type SubgraphStake = {
  id: string; // bytes16 stake id
  stakedAmount: string; // principal, wei
  stakesShares: string;
  startDay: string; // WISE-day
  lockDays: string;
  rewardAmount: string; // interest, wei (0 for active until live-enriched)
  penaltyAmount: string;
  closeDay: string; // WISE-day (0 if active)
  scrapedAmount: string; // total interest already scraped, wei
  isActive: boolean;
  referrer: string | null;
  createdAtTimestamp: string;
  createdAtTransactionHash?: string | null;
  createdAtBlock?: string | null;
  closedAtTimestamp: string;
  closedAtTransactionHash?: string | null;
  closedAtBlock?: string | null;
};

// Aggregate stats for the connected staker (subgraph `staker` entity).
export type StakerInfo = {
  id: string;
  totalStaked: string;
  totalEverStaked: string;
  totalReward: string;
  totalPenalty: string;
  totalScraped: string;
  activeStakeCount: string;
  totalStakeCount: string;
} | null;

// Four status buckets (active/mature/closed/terminated); `pending` is a sub-flag
// of active (confirmation phase before the stake's start day).
export type StakeStatusKind = "active" | "mature" | "closed" | "terminated";
export type StakeStatusKey = StakeStatusKind;
export type StakeTypeKey = "transferable" | "regular";
export type StakeRewardKey = "has" | "none";
export type StatusToggles = Record<StakeStatusKey, boolean>;
export type TypeToggles = Record<StakeTypeKey, boolean>;
export type StakeRewardToggles = Record<StakeRewardKey, boolean>;

export type StakeSortKey = "type" | "created" | "progress" | "status" | "amount" | "apy" | "reward" | "duration" | "shares" | "scraped" | "referrer" | "penalty" | "payout";

// An enriched, display-ready stake row.
export type StakeRow = {
  id: string;
  status: StakeStatusKind;
  isActive: boolean;
  pendingStake: boolean;
  matureStake: boolean;
  isTransferable: boolean; // NFT stake
  nftId?: string;
  isScrapable: boolean;
  contractAddress?: string;
  startedTs: number;
  startDay: number;
  daysAgo: number;
  lockDays: number;
  finalDay: number;
  closeDay: number;
  daysLeft: number;
  servedDays: number;
  apy: number; // annualized %, 0 until reward is known (live-enriched for active stakes)
  /** True when `apy` is the create-stake forecast (no served-days reward data yet). */
  apyIsForecasted: boolean;
  pctExpired: number;
  expiresTs: number;
  opensDayLabel: string;
  finalDayLabel: string;
  closeDayLabel: string;
  /** Unix seconds from subgraph/local close — prefer over wise-day for timeline dates. */
  closedAtTs: number;
  principalNum: number; // WISE staked
  rewardNum: number; // WISE interest earned/available
  scrapedNum: number; // WISE already scraped
  penaltyNum: number;
  /** Current stake shares (earning power). Reduced when interest is scraped. */
  sharesNum: number;
  referrer: string | null;
  createdTxHash: string | null;
  closedTxHash: string | null;
};

/** Rewards shown for closed/terminated stakes = scraped + residual at close. */
export function stakeRewardsDisplayWise(
  row: Pick<StakeRow, "isActive" | "rewardNum" | "scrapedNum">,
) {
  if (row.isActive) return row.rewardNum;
  return Math.max(0, row.rewardNum + row.scrapedNum);
}

export type PageItem = { type: "page"; page: number } | { type: "dots"; key: string };
