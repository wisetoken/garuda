import { formatUnits } from 'viem';

export function displayTokenAmount(value: bigint, decimals = 18) {
  const amount = Number(formatUnits(value, decimals));
  if (amount > 0 && amount < 0.000001) return '<0.000001';
  return amount.toLocaleString('en-US', { maximumFractionDigits: amount >= 1000 ? 2 : 6 });
}

export function displayUsd(value: bigint | undefined, decimals: number, price: number) {
  if (value === undefined || !Number.isFinite(price) || price <= 0) return 'USD unavailable';
  const amount = Number(formatUnits(value, decimals)) * price;
  if (amount > 0 && amount < 0.01) return '≈ <$0.01';
  return `≈ ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
}

export function FundingTokenIcon({ symbol }: { symbol: string }) {
  const name = symbol === 'WETH' ? 'eth' : symbol.toLowerCase();
  return <img className="funding-wallet-token-icon" src={symbol === "WISE" ? "/wise-token.svg" : `/images/icons/${name}.svg`} alt="" width="44" height="44" />;
}
