import { useState } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import { Download, ExternalLink, ShieldCheck, Unplug } from 'lucide-react';
import { downloadOrderBackup } from '../lib/backup/export';
import './backup-access.css';

export function BackupAccessPage() {
  const account = useActiveAccount();
  const [notice, setNotice] = useState('');
  return <section className="backup-access">
    <title>Backup access | WiseOne | Garuda Extension</title>
    <div className="ba-kicker">CROPS · INDEPENDENT ACCESS</div>
    <h1>Your access should outlast this website.</h1>
    <p className="backup-access-intro">Keep a copy that lets you manage your stakes and market permissions when Garuda is unavailable. Your wallet approves every transaction.</p>
    <div className="backup-access-grid">
      <article><Unplug size={24} aria-hidden="true" /><h2>Keep your own access</h2><p>A self-contained page for Ethereum Signature stakes. Connect an external wallet, choose a read RPC, recover published orders from Arkiv, cancel orders, remove permissions, or redeem a matured stake.</p><div className="backup-access-links"><a href="/garuda-backup.html" download><Download size={17} /> Download backup tool</a><a href="/garuda-backup.html" target="_blank" rel="noreferrer"><ExternalLink size={17} /> Open tool</a></div><small>Save the file before an outage. To run it, serve its folder locally with <code>python3 -m http.server 8080 --bind 127.0.0.1</code>, then open <code>http://127.0.0.1:8080/garuda-backup.html</code> in a wallet-enabled browser.</small></article>
      <article><Download size={24} aria-hidden="true" /><h2>Take your signed orders with you</h2><p>Export Signature orders saved by this browser. Import the file into your backup tool to cancel individual orders, even from a fresh browser.</p><button type="button" disabled={!account} onClick={() => {
        if (!account) return;
        try { setNotice(`Exported ${downloadOrderBackup(account.address)} Signature orders. Keep the file private: it contains order signatures, not wallet keys.`); }
        catch { setNotice('Saved orders could not be exported. Do not clear browser storage. The independent tool can still invalidate your current Seaport counter.'); }
      }}>Export my Signature orders</button><small>{account ? 'Only orders saved for the current Signature deployment are included.' : 'Connect your wallet in Garuda to export its saved orders. The standalone tool has its own wallet connection.'} Export again after signing new orders. Without a backup, the tool can invalidate all orders using your current Seaport 1.6 counter, including those from other apps.</small><p role="status">{notice}</p></article>
      <article><ShieldCheck size={24} aria-hidden="true" /><h2>What remains independent</h2><p>The saved tool includes its code, styles, and pinned contract configuration. It does not call Garuda’s API or a wallet login service. Optional Arkiv discovery reads published orders directly, checks signatures and Ethereum status, and exports your orders. File import and counter cancellation also work without Arkiv. It contains no trackers or analytics.</p><p>Ethereum, your external wallet, a reachable RPC, and ETH for gas are still required. RPC responses are trusted; code-hash checks do not prove chain state. Wallet transaction RPC settings are separate from the tool’s read connection.</p><a href="/garuda-backup.sha256" download>Download release checksum</a></article>
      <article><h2>A clear scope</h2><p>Redemption supports matured Signature NFT stakes only. Active stakes cannot be ended early here. Advanced stakes, loans, new trades, and lost-key recovery are outside this release.</p><p>Permission revocation does not cancel signatures. The tool explains the difference before each action. Direct Ethereum and optional Arkiv reads reveal the queried address and your connection to the chosen provider; private reads are not enabled in this release.</p><p>Use an external wallet you control. Social and embedded wallets have separate provider and recovery dependencies.</p></article>
    </div>
  </section>;
}
