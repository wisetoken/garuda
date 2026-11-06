import type { Address, Hex } from 'viem';
import type { SignaturePortfolio, SignaturePosition } from './live-portfolio';

export const STAKE_SNAPSHOT_MAX_AGE = 300;
export const STAKE_SNAPSHOT_LIFETIME = 900;
export type StakeSnapshot = {
  version: 1; chainId: 1; blockNumber: string; blockHash: Hex; observedAt: number;
  collection: Address; owner: Address; tokenId: string; stakeId: Hex;
  principal: string; shares: string; startAt: number; maturesAt: number;
  status: SignaturePosition['status']; canList: boolean; unclaimedInterest?: string;
  rewardDays?: number; displayStake: NonNullable<SignaturePosition['displayStake']>;
};
export type StakeDetails = { snapshot: StakeSnapshot; source: 'arkiv' | 'ethereum' | 'cache' };
export function snapshotFromPortfolio(portfolio: SignaturePortfolio): StakeSnapshot {
  const p = portfolio.positions[0];
  if (!p?.collection || !p.displayStake || (p.status !== 'Closed' && p.unclaimedInterest === undefined))
    throw new Error('Complete stake details are required.');
  return { version: 1, chainId: 1, blockNumber: String(portfolio.blockNumber), blockHash: portfolio.blockHash,
    observedAt: portfolio.timestamp, collection: p.collection, owner: p.owner, tokenId: p.tokenId,
    stakeId: p.stakeId, principal: String(p.principal), shares: String(p.shares), startAt: p.startAt,
    maturesAt: p.maturesAt, status: p.status, canList: p.canList,
    unclaimedInterest: p.unclaimedInterest === undefined ? undefined : String(p.unclaimedInterest),
    rewardDays: p.rewardDays, displayStake: p.displayStake };
}
const uint = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(v);
const seconds = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const address = (v: unknown) => typeof v === 'string' && /^0x[0-9a-f]{40}$/i.test(v);
export function parseStakeSnapshot(raw: unknown, target: { collection: string; owner: string; tokenId: string; stakeId?: string }, now = Math.floor(Date.now()/1000), maxAge = STAKE_SNAPSHOT_MAX_AGE): StakeSnapshot {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid stake snapshot.');
  const s = raw as StakeSnapshot, d = s.displayStake;
  if (s.version !== 1 || s.chainId !== 1 || !uint(s.blockNumber) || !/^0x[0-9a-f]{64}$/i.test(s.blockHash ?? '') ||
    !seconds(s.observedAt) || s.observedAt > now + 30 || now - s.observedAt > maxAge ||
    !address(s.collection) || !address(s.owner) || !uint(s.tokenId) || !/^0x[0-9a-f]{32}$/i.test(s.stakeId ?? '') ||
    s.collection.toLowerCase() !== target.collection.toLowerCase() || s.owner.toLowerCase() !== target.owner.toLowerCase() ||
    s.tokenId !== target.tokenId || (target.stakeId && s.stakeId.toLowerCase() !== target.stakeId.toLowerCase()) ||
    !uint(s.principal) || !uint(s.shares) || !seconds(s.startAt) || !seconds(s.maturesAt) ||
    !['Pending','Active','Mature','Closed'].includes(s.status) || typeof s.canList !== 'boolean' ||
    (s.status !== 'Closed' && !uint(s.unclaimedInterest)) ||
    (s.unclaimedInterest !== undefined && !uint(s.unclaimedInterest)) ||
    (s.rewardDays !== undefined && !seconds(s.rewardDays)) ||
    !d || typeof d !== 'object' || d.id !== s.stakeId || d.stakedAmount !== s.principal || d.stakesShares !== s.shares ||
    !['startDay','lockDays','closeDay','rewardAmount','penaltyAmount','scrapedAmount','createdAtTimestamp','closedAtTimestamp'].every(k => uint(d[k as keyof typeof d])) ||
    typeof d.isActive !== 'boolean' || d.isActive !== (s.status !== 'Closed') ||
    d.rewardAmount !== (s.unclaimedInterest ?? '0')) throw new Error('Invalid or stale stake snapshot.');
  return s;
}
export function positionFromSnapshot(s: StakeSnapshot): SignaturePosition {
  return { ...s, principal: BigInt(s.principal), shares: BigInt(s.shares),
    unclaimedInterest: s.unclaimedInterest === undefined ? undefined : BigInt(s.unclaimedInterest) };
}
