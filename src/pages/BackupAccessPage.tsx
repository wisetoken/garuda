import { useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { Download, ExternalLink, ShieldCheck, Unplug, FileSearch, KeyRound, ArrowUpRight } from 'lucide-react';
import { downloadOrderBackup } from '../lib/backup/export';
import './backup-access.css';

export function BackupAccessPage() {
  const account = useActiveAccount();
  const [notice, setNotice] = useState('');
  return <section className="backup-access">
    <title>Backup access | WiseOne | Garuda Extension</title>
    <header className="ba-hero">
      <div className="ba-kicker">CROPS · BACKUP ACCESS</div>
      <h1>If Garuda goes away,<br />your access stays with you.</h1>
      <p className="backup-access-intro">Keep a small, independent tool that lets you cancel orders, remove market permissions, and redeem matured Signature stakes—even when this website or our server is unavailable.</p>
      <div className="backup-access-links">
        <a className="ba-primary" href="/garuda-backup.html" download><Download size={18} aria-hidden="true" /> Save backup tool</a>
        <a className="ba-secondary" href="/garuda-backup.html" target="_blank" rel="noreferrer"><ExternalLink size={17} aria-hidden="true" /> Try the tool</a>
      </div>
      <p className="ba-save-note">Save it while Garuda is available. You’ll still need your external wallet, an Ethereum connection, and ETH for transaction fees.</p>
    </header>

    <section className="ba-scenarios" aria-labelledby="ba-scenarios-title">
      <div className="ba-section-heading"><span className="ba-kicker">WHEN IT HELPS</span><h2 id="ba-scenarios-title">A way forward when something stops working.</h2></div>
      <div className="ba-scenario-grid">
        <article><Unplug size={22} aria-hidden="true" /><h3>Garuda won’t open</h3><p>Run your saved copy from your computer. It talks to Ethereum without Garuda’s website, API, or sign-in service.</p><span className="ba-outcome">Keep access to supported stakes</span></article>
        <article><ArrowUpRight size={22} aria-hidden="true" /><h3>Your connection stops responding</h3><p>Choose another Ethereum read provider in the tool. If sending transactions fails, change the connection in your wallet too.</p><span className="ba-outcome">Choose a working connection</span></article>
        <article><FileSearch size={22} aria-hidden="true" /><h3>Your saved orders are missing</h3><p>Find still-published orders directly on Arkiv. The tool checks the maker’s signature and Ethereum status before offering cancellation of your orders.</p><span className="ba-outcome">Recover orders without our database</span></article>
      </div>
    </section>

    <div className="backup-access-grid ba-prepare">
      <article>
        <div className="ba-kicker">PREPARE ONCE</div><h2>Keep two things somewhere safe.</h2>
        <ol className="ba-steps">
          <li><strong>Save the backup tool.</strong><p>The HTML file includes the interface and code it needs. Keep a copy outside this website.</p></li>
          <li><strong>Export your signed orders.</strong><p>This browser’s saved Signature orders can be imported later to cancel them individually. Export again after signing new orders.</p></li>
        </ol>
        <button type="button" disabled={!account} onClick={() => {
          if (!account) return;
          try {
            const count = downloadOrderBackup(account.address);
            setNotice(count ? `Exported ${count} Signature orders. Keep the file safe: it contains order signatures, not wallet keys.` : 'No Signature orders were saved for this wallet in this browser. The backup tool can also search Arkiv or cancel all current Seaport orders.');
          } catch { setNotice('Saved orders could not be exported. Keep your browser data. You can still use the backup tool to cancel all orders signed with your current Seaport counter.'); }
        }}><Download size={17} aria-hidden="true" /> Export my Signature orders</button>
        <small>{account ? 'Only orders saved for this wallet and the current Signature deployment are included.' : 'Connect your wallet in Garuda to export orders saved in this browser. Saving the tool needs no wallet connection.'} Backups include signatures that may still be executable; keep them private.</small>
        <p className="ba-notice" role="status" aria-live="polite">{notice}</p>
      </article>
      <article>
        <div className="ba-kicker">WHEN YOU NEED IT</div><h2>Open your copy. Connect your wallet.</h2>
        <p>Use a browser with your external wallet installed. The tool reads your supported positions from Ethereum and asks you to review every transaction in your wallet.</p>
        <details className="ba-instructions"><summary>How to open the saved file</summary><p>Opening the file directly may prevent your wallet from connecting. Open a terminal in the folder containing <code>garuda-backup.html</code> and, with Python 3 installed, run:</p><pre><code>python3 -m http.server 8080 --bind 127.0.0.1</code></pre><p>Then open <a href="http://127.0.0.1:8080/garuda-backup.html" target="_blank" rel="noreferrer">the local backup tool <ExternalLink size={13} aria-hidden="true" /></a>. Keep the terminal running while you use it.</p></details>
        <div className="ba-wallet-note"><KeyRound size={20} aria-hidden="true" /><p>Your keys stay in your wallet. This tool never asks for a seed phrase or private key. It cannot restore a lost wallet.</p></div>
      </article>
    </div>

    <section className="ba-capabilities" aria-labelledby="ba-capabilities-title">
      <div className="ba-section-heading"><span className="ba-kicker">AVAILABLE TODAY</span><h2 id="ba-capabilities-title">Control your existing positions and permissions.</h2></div>
      <dl className="ba-capability-list">
        <div><dt>Cancel your orders</dt><dd>Import a backup or recover published orders from Arkiv. Without either, invalidate all orders signed with your current Seaport 1.6 counter—including orders from other apps.</dd></div>
        <div><dt>Remove market permissions</dt><dd>Revoke Seaport’s WISE allowance and Signature NFT permissions. Removing a permission does not cancel a signed order; reapproving can make it usable again.</dd></div>
        <div><dt>Redeem matured Signature stakes</dt><dd>End a verified, matured Signature stake and receive its WISE in your connected wallet. Redemption burns the NFT. Early ending is disabled here.</dd></div>
      </dl>
      <p className="ba-scope">This release supports Ethereum Signature stakes. New trades, Advanced stake redemption, loans, ordinary WISE stake redemption, and embedded-wallet recovery are outside its scope.</p>
    </section>

    <section className="ba-capabilities" aria-labelledby="ba-sources-title">
      <div className="ba-section-heading"><span className="ba-kicker">MORE THAN ONE COPY</span><h2 id="ba-sources-title">Your orders should have a life beyond our server.</h2></div>
      <p>We believe useful data should be accessible beyond a single service. Garuda keeps accepted orders in its catalog and publishes signed listings and bids to Arkiv. You can also export your own orders and keep a copy yourself.</p>
      <dl className="ba-capability-list">
        <div><dt>Garuda’s order catalog</dt><dd>Stores accepted orders and their original publication records. It can show orders while Arkiv publication is pending, but depends on our API and database.</dd></div>
        <div><dt>Published copies on Arkiv</dt><dd>Make listings and bids queryable outside our database. The saved backup tool can read them directly when Garuda is unavailable, check signatures and Ethereum status, and let you cancel your own orders.</dd></div>
        <div><dt>A copy you control</dt><dd>An exported order file stays with you even if a service stops responding or an Arkiv record expires. Import it into the saved tool to cancel individual orders.</dd></div>
      </dl>
      <p className="ba-scope">More copies help when they remain available and can be checked. Arkiv records can expire or be deleted, and publication can fail. Ethereum remains the authority for ownership, permissions and settlement; discovery data does not guarantee that an order can trade.</p>
      <details><summary>Where does Graph fit?</summary><p>The market currently labels its service-catalog option “Graph,” but that option reads Garuda’s database through our API. The actual subgraph supplies stake creation details; it is not currently a separate backup of signed offers. Both normal market source options use our API. The saved tool’s direct Arkiv reads and local-file import provide the independent recovery paths.</p></details>
    </section>

    <section className="ba-trust" aria-labelledby="ba-trust-title">
      <ShieldCheck size={24} aria-hidden="true" /><div><h2 id="ba-trust-title">What CROPS means here</h2><p>Censorship resistant, open source, private, secure. Our upgrade focuses on access that does not depend on Garuda staying online. It does not make your transactions or reads anonymous.</p></div>
      <dl className="ba-crops-grid">
        <div><dt>C · Access without our server</dt><dd>The saved tool works without our domain or API. Ethereum, a reachable provider, your external wallet, and transaction fees remain necessary.</dd></div>
        <div><dt>O · Open code</dt><dd>The tool is MIT licensed and buildable from the repository. Its code and styles are included in the saved file.</dd></div>
        <div><dt>P · Clear data boundaries</dt><dd>No trackers or analytics in the standalone tool. Selected Ethereum and Arkiv providers can see your IP and queried addresses. Orders and transactions are public.</dd></div>
        <div><dt>S · Your wallet approves</dt><dd>The tool checks contracts and current state, simulates actions, and checks confirmed results. You still trust your wallet, the provider’s answers, the downloaded file, and the deployed contracts.</dd></div>
      </dl>
      <details><summary>Arkiv availability and file verification</summary><p>Arkiv only returns records that are still published and available. Records may expire, be deleted, or be omitted; no search result does not mean no orders exist. File import and current-counter cancellation work without Arkiv. Incoming bids belong to their signers and cannot be cancelled by you.</p><p>A valid signature and uncancelled status do not prove that an order can trade. This tool does not buy or accept bids. Longer storage retention never extends a signed order’s trading deadline.</p><p>Check a downloaded tool against a release checksum obtained from a source you trust. A checksum from the same compromised source does not establish authenticity.</p><a href="/garuda-backup.sha256" download>Download release checksum</a></details>
    </section>
  </section>;
}
