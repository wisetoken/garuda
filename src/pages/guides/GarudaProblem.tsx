import { GarudaPageKicker } from "../../components/GarudaPageKicker";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check, Clock3, Layers, LockKeyhole } from "lucide-react";
import "./guide-base.css";
import "./garuda-problem.css";

const stakingSource = "https://github.com/wise-foundation/wise-token-contracts/blob/master/contracts/StakingToken.sol";
const closingSource = "https://teal.wise.one/#sec-2-3-5-4";
const signatureSource = "https://github.com/wisetoken/signature-stakes#integrating-both-collections";
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const ratio = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function SourceLink({ href, children }: { href: string; children: string }) {
  return <a className="gp-source" href={href} target="_blank" rel="noreferrer">{children}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}

function ShareComparison() {
  const [priceRatio, setPriceRatio] = useState(2);
  const newWeight = 100 / priceRatio;
  const fewer = 100 - newWeight;
  return <div className="gp-share-demo">
    <div className="gp-demo-heading"><Layers size={18} aria-hidden="true" /><span>Same principal. Same original term & bonuses.</span></div>
    <div className="gp-share-bars" aria-label="Illustrative relative share weight">
      <div className="gp-share-row"><div><span>Earlier stake</span><strong>100 <small>share units</small></strong></div><div className="gp-bar" aria-hidden="true"><span style={{ width: "100%" }} /></div></div>
      <div className="gp-share-row gp-share-new"><div><span>New stake</span><strong>{number.format(newWeight)} <small>share units</small></strong></div><div className="gp-bar" aria-hidden="true"><span style={{ width: `${newWeight}%` }} /></div></div>
    </div>
    <div className="gp-range-label"><label htmlFor="gp-share-price">New-stake share price</label><output htmlFor="gp-share-price">{ratio.format(priceRatio)}× <span>the earlier price</span></output></div>
    <input id="gp-share-price" name="share-price-ratio" type="range" min="1" max="3" step="0.25" value={priceRatio} onChange={event => setPriceRatio(Number(event.target.value))} aria-describedby="gp-demo-assumptions" aria-valuetext={`${ratio.format(priceRatio)} times the earlier share price`} />
    <div className="gp-range-ends" aria-hidden="true"><span>Same price</span><span>3× the price</span></div>
    <p className="gp-demo-result" aria-live="polite">{fewer === 0 ? <>Same share price, <strong>same initial share weight.</strong></> : <>The new stake gets <strong>{number.format(fewer)}% fewer shares.</strong></>}</p>
    <p className="gp-caption" id="gp-demo-assumptions">Illustration only. Earlier shares are normalized to 100; both stakes have equal principal and bonuses, with no interest scraped. These are not live share prices or a return forecast.</p>
  </div>;
}

export function GarudaProblem() {
  return <article className="garuda-problem" aria-labelledby="problem-title">
    <header className="gp-hero">
      <div className="gp-hero-copy">
        <GarudaPageKicker label="THE PROBLEM" description="Staking WISE is a commitment to time. Needing your capital sooner can mean giving up principal and ending a position you may not be able to recreate on the same terms." />
        <h1 id="problem-title">Your plans can change.<br /><span>Your stake’s term doesn’t.</span></h1>
        <a className="gp-jump" href="#problem-solution">A different way to exit <ArrowRight size={17} aria-hidden="true" /></a>
      </div>
      <div className="gp-position" aria-label="A Signature stake can change owners while retaining its maturity date">
        <div className="gp-position-heading"><img className="wiseone-stake-mark" src="/wiseone-logo.png" width="48" height="48" alt="" /><div><span>THE POSITION CONTINUES</span><strong>Signature stake</strong></div><LockKeyhole size={18} aria-hidden="true" /></div>
        <div className="gp-position-line" aria-hidden="true"><i /><span /><i /><span /><i /></div>
        <div className="gp-position-dates"><span>Created</span><span>Sold</span><span>Matures</span></div>
        <div className="gp-owner-transfer"><span>Owner A</span><ArrowRight size={18} aria-hidden="true" /><span>Owner B</span></div>
        <div className="gp-position-foot"><Check size={15} aria-hidden="true" /> Same stake. Same maturity.</div>
      </div>
    </header>

    <section className="gp-section gp-exit" aria-labelledby="problem-exit-title">
      <div className="gp-section-copy"><span className="gp-section-number">01 / THE EXIT PROBLEM</span><h2 id="problem-exit-title">Leaving early<br />has a cost.</h2><p>You can close an active WISE stake before maturity. But the contract deducts a penalty from its principal and ends its future earning life.</p><p>Waiting until maturity avoids that penalty. Cancelling a pending stake, before it starts, is also penalty-free.</p><SourceLink href={closingSource}>WISE early-exit rules</SourceLink></div>
      <div className="gp-exit-example">
        <div className="gp-demo-heading"><Clock3 size={18} aria-hidden="true" /><span>Example: a 100-day WISE stake</span></div>
        <h3>Principal lost if you end the stake</h3>
        <div className="gp-penalties"><div><strong>90<small>%</small></strong><span>First active day</span></div><ArrowRight size={18} aria-hidden="true" /><div><strong>10<small>%</small></strong><span>Last day before maturity</span></div><ArrowRight size={18} aria-hidden="true" /><div className="gp-no-penalty"><strong>0<small>%</small></strong><span>At maturity</span></div></div>
        <p className="gp-caption">The active-stake penalty falls with time, but does not reach zero until maturity. Remaining accrued interest is paid separately; shares are destroyed when the stake ends.</p>
        <div className="gp-exit-insight"><LockKeyhole size={18} aria-hidden="true" /><p>The problem is access to principal while the stake is still earning.</p></div>
      </div>
    </section>

    <section className="gp-section gp-shares" aria-labelledby="problem-shares-title">
      <div className="gp-section-copy"><span className="gp-section-number">02 / THE REPLACEMENT PROBLEM</span><h2 id="problem-shares-title">The same WISE<br />can buy fewer shares.</h2><p>Shares determine a stake’s weight in WISE’s daily reward pool. New stakes receive shares based on principal, term bonuses, eligible referral bonuses, and the protocol’s share price.</p><p>That share price can rise and does not fall. If it has risen, the same principal with the same bonuses buys fewer shares today.</p><p>An earlier stake can therefore earn more WISE per day than that equivalent new stake while both are active. Its age alone is not the advantage—its remaining shares are.</p><SourceLink href={stakingSource}>WISE share & reward calculations</SourceLink></div>
      <ShareComparison />
    </section>

    <section className="gp-solution" id="problem-solution" aria-labelledby="problem-solution-title">
      <div className="gp-solution-heading"><span className="gp-section-number">03 / WHAT GARUDA ADDS</span><h2 id="problem-solution-title">Let the stake continue.<br /><span>Let its owner move on.</span></h2><p>Signature NFTs make stake ownership transferable. Garuda brings sellers and buyers together around those existing positions.</p></div>
      <div className="gp-two-sides"><div><span className="gp-side-label">FOR THE SELLER</span><h3>Sell the position you hold.</h3><p>Set an asking price or accept a bid. A completed sale pays you for the NFT without ending its underlying stake, so the sale itself triggers no WISE early-end penalty.</p></div><div><span className="gp-side-label">FOR THE BUYER</span><h3>Take over what already exists.</h3><p>Acquire the stake’s current shares, remaining reward rights, and original maturity. Ownership changes without creating a new stake at today’s share price.</p></div></div>
      <div className="gp-solution-limit"><p>A sale still needs a willing buyer. Your net proceeds depend on the agreed price, marketplace fees, and gas; they can be below the stake’s principal.</p><SourceLink href={signatureSource}>How Signature ownership works</SourceLink></div>
    </section>

    <section className="gp-compare" aria-labelledby="problem-compare-title">
      <div><span className="gp-section-number">LOOK AT THE WHOLE POSITION</span><h2 id="problem-compare-title">Earlier isn’t automatically better.</h2><p>Compare what you pay with what the stake can still deliver.</p></div>
      <dl className="gp-checks"><div><dt>Current shares</dt><dd>Scraping interest during an active stake reduces its shares. Check what remains, not only what was issued.</dd></div><div><dt>Time left to earn</dt><dd>More shares help on overlapping earning days. A shorter remaining term can still mean less total future interest; a mature stake has no earning days left.</dd></div><div><dt>Price & remaining rights</dt><dd>Asking price is separate from principal. Consider unclaimed rewards, fees, gas, and the price you actually pay.</dd></div><div><dt>Changing rewards</dt><dd>Daily payouts depend on the reward pool and competing active shares. Historical APY does not lock in a future rate.</dd></div></dl>
    </section>

    <footer className="gp-footer"><div><h2>A new owner. An uninterrupted stake.</h2><p>Explore the market, or see how ownership changes.</p></div><div className="gp-footer-links"><Link className="ba-primary" to="/market">Explore the market <ArrowRight size={17} aria-hidden="true" /></Link><Link className="gp-jump" to="/solution">The Solution <ArrowUpRight size={16} aria-hidden="true" /></Link></div></footer>
  </article>;
}
