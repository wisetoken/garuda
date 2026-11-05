/** Fixed design fixtures from the reference screenshot. Never treated as wallet data. */
export type StakeViewModel = {
  id: string;
  creationTransactionHash?: string;
  collection: 'Signature' | 'Advanced';
  principal: string;
  principalUsd: string;
  interest: string;
  interestUsd: string;
  annualYield: string;
  started: string;
  maturity: string;
  status: 'Active' | 'Mature';
  progress: number;
  caption: string;
};
// Creation hashes resolved from NFTStake(tokenId) metadata and the indexed WISE StakeStart record.
export const previewStakes: readonly StakeViewModel[] = [
  { id: '20', creationTransactionHash: '0x6f90de806826e9221f0c16bd0a736da824c62b3f1960de916bca98c347aa9e27', collection: 'Signature', principal: '10', principalUsd: '1.23', interest: '0.005831', interestUsd: '<$0.01', annualYield: '21.28', started: '2026-01-13', maturity: '2026-01-14', status: 'Mature', progress: 100, caption: 'Lock period complete' },
  { id: '53', creationTransactionHash: '0x0d4efa73e40b6ca94c9bc134dd30cd16ef98e35d086175668db236d15e586585', collection: 'Signature', principal: '1,000', principalUsd: '123.41', interest: '8.017694', interestUsd: '$0.99', annualYield: '14.63', started: '2026-10-16', maturity: '2027-10-16', status: 'Active', progress: 6, caption: '345 days to maturity' },
];
export const stakeDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
