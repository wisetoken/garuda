import { GarudaPageKicker } from "../../components/GarudaPageKicker";
import { StakeEcosystem } from "./StakeEcosystem";
import { stakeHeading, stakeIntro } from "./stake-content";
import { ArrowUpRight, Wallet } from "lucide-react";

import { useNavigate } from "react-router-dom";
import { screenHref, type Screen } from "../../navigation";
import "./guide-base.css";
import "./garuda-guide.css";

export function GarudaGuide() {
  const navigateTo = useNavigate();
  const navigate = (screen: Screen) => navigateTo(screenHref(screen));
  return <section className="ba-guide garuda-guide" aria-labelledby="guide-title">
    <div className="ba-section-heading">
      <GarudaPageKicker label="THE SOLUTION" description={stakeIntro} />
      <h1 id="guide-title">{stakeHeading}</h1>
    </div>
    <StakeEcosystem />
    <section className="garuda-timeline-section">
    <div className="garuda-section-intro"><span className="ba-kicker">OWNERSHIP CAN CHANGE</span><h2>A new owner.<br/>The same timeline.</h2>
    <p>A sale changes who owns the position. Its original start date and maturity stay with the stake.</p></div>
    <div className="ba-explain-timeline" role="img" aria-label="Illustrative timeline: a stake starts with owner A, is sold during its term to owner B, and keeps the same maturity date. Not real position data.">
      <span className="ba-path-number">ILLUSTRATIVE STAKE LIFECYCLE</span>
      <div className="ba-timeline-track"><span>Stake starts</span><span className="ba-timeline-sale">Ownership changes</span><span>Maturity</span></div>
      <div className="ba-owner-bands"><span><Wallet size={18} /> Owner A</span><span><Wallet size={18} /> Owner B</span></div>
      <p>The position continues through the sale. Maturity follows the staking contract’s rules.</p>
    </div>
    </section>
    <section className="garuda-features-section"><div className="garuda-section-intro"><span className="ba-kicker">YOUR NEXT MOVE</span><h2>More ways to use your stake.</h2></div>
    <div className="ba-guide-grid">
      <article><span className="ba-path-number">UNDERSTAND</span><h3>See the position behind the NFT.</h3><p>Principal, lock dates, maturity status and unclaimed interest help you compare stakes. The timeline image makes the position readable at a glance.</p></article>
      <article><span className="ba-path-number">TRADE</span><h3>Find a price for ownership.</h3><p>Owners set an asking price. Buyers can purchase a listing or make a bid on a particular stake. The sale price is negotiated separately from its principal.</p></article>
      <article><span className="ba-path-number">KEEP CONTROL</span><h3>Review, sign and settle.</h3><p>Listing does not transfer your NFT. Your wallet authorizes the order, and settlement exchanges payment for ownership. You can cancel an outstanding order onchain.</p></article>
      <article><span className="ba-guide-status ba-guide-pending">LENDING PREVIEW</span><h3>Explore collateral without selling.</h3><p>The next step is borrowing against a specific stake. Lenders need enforceable terms for its value, duration and repayment. You can inspect positions today; new loans are not enabled yet.</p></article>
    </div>
    </section>
    <div className="ba-hero-links ba-guide-actions"><p>Ready to explore?</p><button className="ba-primary" onClick={() => navigate("stakes")}>Explore my stakes <ArrowUpRight size={18} /></button><button className="ba-text-button" onClick={() => navigate("trade")}>Browse the market <ArrowUpRight size={18} /></button></div>
  </section>;
}
