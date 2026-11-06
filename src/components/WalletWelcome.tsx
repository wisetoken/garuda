import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CalendarDays, Layers, ShieldCheck, Wallet } from "lucide-react";
import { useWalletAccess } from "../lib/wallet";
import { screenHref } from "../navigation";
import "./wallet-welcome.css";

const features = [
  { Icon: Layers, title: "See the whole position", description: "Principal, unclaimed interest, and maturity in one view." },
  { Icon: CalendarDays, title: "Follow its timeline", description: "Understand the remaining term before your next decision." },
  { Icon: ShieldCheck, title: "Set your own price", description: "List an eligible stake. Ownership changes only when a trade settles." },
];

export function WalletWelcome() {
  const titleId = useId();
  const { connect, connecting } = useWalletAccess();

  return (
    <div className="wallet-welcome">
      <section className="garuda-wallet-start" aria-labelledby={titleId}>
        <div className="garuda-wallet-intro">
          <span className="garuda-feature-icon"><Wallet size={25} aria-hidden="true" /></span>
          <h2 id={titleId}>Your positions.<br />One place.</h2>
          <p>Connect the wallet holding your Signature or Advanced NFTs to see your stakes and decide what comes next.</p>
          <div className="garuda-start-actions">
            <button className="wallet-welcome-connect" type="button" disabled={connecting} onClick={() => void connect()}>
              {connecting ? "Connecting…" : "Connect wallet"}<ArrowRight size={17} aria-hidden="true" />
            </button>
            <Link to={screenHref("trade")}>Browse market <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </div>
          <small>Connecting lets Garuda read your positions. Transactions still need your approval.</small>
        </div>
        <div className="garuda-wallet-features">
          {features.map(({ Icon, title, description }) => (
            <div key={title}>
              <Icon size={20} aria-hidden="true" />
              <div><h3>{title}</h3><p>{description}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
