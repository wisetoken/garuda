// Shared card descriptions and detailed explanations.
export const stakeHeading = 'Existing stakes. New possibilities.';
export const stakeIntro = 'A Signature NFT represents a WISE staking position, with its own principal, term and remaining rights. Garuda lets another person discover, inspect and acquire that position without restarting its timeline.';

export const stakeCards = [
  { key: 'wise', cardTitle: 'WISE Token', label: 'THE ASSET', icon: '/wise-token.svg', description: 'Stake WISE for a chosen term to earn rewards. Your stake stays with your wallet and cannot be transferred.', title: 'How WISE works', intro: 'Hold WISE as a liquid token, or commit it to a staking term. Standard stakes are tied to the wallet that creates them and cannot be transferred.', rows: [
    ['Permanent liquidity lock', 'The launch pool’s LP tokens were burned, so that liquidity cannot be withdrawn by a team or owner. WISE can still be traded through the pool.'],
    ['A stake has a chosen term', 'Opening a stake burns the committed WISE into shares. Closing it destroys the shares and mints the principal and accrued interest, less any early-exit penalty.'],
    ['Pending, active and mature', 'A pending stake can be cancelled without interest or penalty. Closing an active stake before maturity penalizes principal. After maturity, there is no early-exit or late-close penalty.'],
    ['Understand the early-exit cost', 'For terms of 2+ days, early-exit penalties fall from 90% to 10% of principal; active one-day stakes incur 10%. Accrued interest is unaffected.']
  ], href: 'https://docs.wisetoken.net/wise-token/wise-ethereum/wise-contract-functionality/circulation-epoch/staking/closing-stakes', link: 'Read the staking rules' },
  { key: 'signature', cardTitle: 'Signature Stakes', label: 'THE WRAPPER', icon: '/wiseone-logo.png', description: 'An NFT wrapper makes WISE stakes transferable. Ownership can change while the stake keeps its original timeline.', title: 'Signature Stakes', intro: 'Standard WISE stakes cannot be transferred. Signature stakes solve this by representing ownership of a staking position with a transferable NFT.', rows: [
    ['More than a token ID', 'Each position has its own principal, start date, maturity and remaining reward rights. Compare the underlying stake, not just the NFT collection.'],
    ['New owner, same timeline', 'Transferring or selling the NFT changes who owns the position. It does not restart the term or close the underlying stake.'],
    ['Selling is different from ending a stake', 'A sale transfers ownership at an agreed price. An early close ends the staking position and applies the contract’s penalty. A sale needs a buyer, and its price may differ from the principal.'],
    ['Check the current position', 'Previously claimed interest is no longer available to the buyer. Review remaining rewards, maturity and the live stake state before acquiring it.']
  ], href: '/garuda/?screen=how', link: 'Explore Signature stakes' },
  { key: 'garuda', cardTitle: 'Garuda Extension', label: 'THE NEW POSSIBILITIES', icon: '/garuda-emblem-v1.png', description: 'Buy, sell or bid on Signature stakes. Borrow against your stake as collateral, or lend to other stake owners.', title: 'Garuda Extension', intro: 'A marketplace and a lending and borrowing solution built around Signature stakes.', rows: [
    ['List, buy and bid', 'Set an asking price for your stake, buy a listed position, or make a purchase bid. An owner can accept a valid offer to transfer the full NFT position.'],
    ['Your wallet authorizes the trade', 'Signing a listing does not transfer the NFT. A completed settlement exchanges payment for ownership, with live checks before purchase.'],
    ['Borrow against a stake', 'Use a Signature stake as collateral to borrow funds, or lend to stake owners under agreed loan terms. Review the collateral, loan amount, repayment cost and due date before committing.'],
    ['Understand collateral', 'Unpaid loans can put collateral at risk. Review repayment terms and collateral enforcement rules before borrowing or lending.']
  ], href: '/garuda/?screen=trade&collection=signature&view=market', link: 'Open Garuda Extension' }
];
