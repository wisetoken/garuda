// SPDX-License-Identifier: MIT
import { createPublicClient, createWalletClient, custom, formatUnits, getAddress, http, zeroAddress,
  type Address, type EIP1193Provider, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import { createBackup, executeBackupAction, parseBackup, parseRpcUrl, readBackupState, verifyBackupContracts,
  type BackupAction, type BackupEnvelope } from '../lib/backup/core';
import { parseSignedSale, sameAddress } from '../lib/blend/sales';
import { backupDeployment } from '../lib/backup/core';
import { arkivRecovery, discoverRecoveryOrders, recoveryRequest, verifyRecoveredOrder,
  type RecoveredOrder, type RecoveryStatus } from '../lib/backup/arkiv';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const walletSelect = el<HTMLSelectElement>('wallet');
const connection = el<HTMLSelectElement>('connection');
const review = el<HTMLDialogElement>('review');
const consent = el<HTMLInputElement>('consent');
type Provider = EIP1193Provider & { on?: (event: string, callback: () => void) => void; removeListener?: (event: string, callback: () => void) => void };
const providers: { provider: Provider; name: string }[] = [];
let provider: Provider | undefined;
let account: Address | undefined;
let generation = 0;
let busy = false;
let state: Awaited<ReturnType<typeof readBackupState>> | undefined;
let backup: BackupEnvelope | undefined;
let action: BackupAction | undefined;
let recovered: (RecoveredOrder & { status: RecoveryStatus })[] = [];
type Pending = { hash: Hex; account: Address };
let pending: Pending | undefined;
try {
  const saved = JSON.parse(localStorage.getItem('garuda:backup:pending:v1') ?? 'null');
  if (saved && /^0x[0-9a-f]{64}$/i.test(saved.hash) && /^0x[0-9a-f]{40}$/i.test(saved.account)) pending = saved;
} catch { /* Storage is optional; the transaction hash remains visible in this session. */ }
const amount = (value: bigint) => {
  const [whole, decimal] = formatUnits(value, 18).split('.');
  return `${BigInt(whole).toLocaleString()}${decimal ? `.${decimal.slice(0, 6)}` : ''}`;
};
function message(text: string, error = false) {
  el('status').textContent = text;
  el('status').parentElement!.classList.toggle('error', error);
}
function describeError(error: unknown) {
  // Do not show raw provider URLs, request bodies, or arbitrary RPC HTML.
  return error instanceof Error && !('shortMessage' in error) ? error.message : 'The wallet or RPC could not complete this action. Check the selected connection and wallet network.';
}
function rememberPending(value: Pending | undefined) {
  pending = value;
  try {
    if (value) localStorage.setItem('garuda:backup:pending:v1', JSON.stringify(value));
    else localStorage.removeItem('garuda:backup:pending:v1');
  } catch { /* Visible hash is still available for manual tracking. */ }
  const link = el<HTMLAnchorElement>('tx');
  if (value) { link.href = `https://etherscan.io/tx/${value.hash}`; link.hidden = false; }
  el('pending-controls').hidden = !value;
}
function controls() {
  button('connect').disabled = busy || providers.length === 0;
  walletSelect.disabled = busy;
  connection.disabled = busy;
  el<HTMLInputElement>('rpc').disabled = busy;
  button('refresh').disabled = busy || !account;
  el<HTMLInputElement>('import').disabled = busy || !account;
  button('check-pending').disabled = busy || !account;
  button('find-orders').disabled = busy || !account;
  button('export-recovered').disabled = busy || !account || !recovered.some(order => order.relation === 'own');
  el<HTMLSelectElement>('arkiv-connection').disabled = busy;
  el<HTMLInputElement>('arkiv-rpc').disabled = busy;
  button('revoke-wise').disabled = busy || !!pending || !state || state.allowance === 0n;
  button('revoke-operator').disabled = busy || !!pending || !state?.operator;
  button('counter-action').disabled = busy || !!pending || !account;
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(node => { node.disabled = busy || !!pending || !account; });
}
function clients() {
  if (!provider || !account) throw new Error('Connect an external wallet first.');
  const rpc = connection.value;
  const transport = rpc === 'wallet' ? custom(provider, { retryCount: 0 }) : http(parseRpcUrl(rpc === 'custom' ? el<HTMLInputElement>('rpc').value : rpc), {
    retryCount: 0, timeout: 20_000, fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' },
  });
  return { client: createPublicClient({ chain: mainnet, transport, cacheTime: 0 }),
    wallet: createWalletClient({ chain: mainnet, transport: custom(provider, { retryCount: 0 }) }) };
}
function invalidate() {
  generation++;
  state = undefined;
  action = undefined;
  clearRecovered();
  review.close();
  renderState();
  controls();
}
function clearRecovered() {
  recovered = [];
  el('recovered-orders').replaceChildren();
  el('recovery-status').textContent = 'Search only runs when you choose Find my published orders.';
}
function walletChanged() {
  account = undefined; backup = undefined;
  el('account').textContent = 'Wallet changed. Connect again.';
  el('orders').replaceChildren();
  invalidate();
  message('Wallet account or network changed. Reconnect before continuing.');
}
function addProvider(candidate: Provider, name: string) {
  if (!candidate?.request || providers.some(item => item.provider === candidate)) return;
  if (providers.length === 0) walletSelect.replaceChildren();
  providers.push({ provider: candidate, name });
  const option = document.createElement('option');
  option.value = String(providers.length - 1); option.textContent = name;
  walletSelect.append(option); controls();
}
window.addEventListener('eip6963:announceProvider', event => {
  const detail = (event as CustomEvent<{ provider: Provider; info: { name: string } }>).detail;
  if (detail?.provider && typeof detail.info?.name === 'string') addProvider(detail.provider, detail.info.name.slice(0, 80));
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
const injected = (window as unknown as { ethereum?: Provider }).ethereum;
if (injected) addProvider(injected, 'Browser wallet');
button('connect').onclick = async () => {
  if (busy) return;
  busy = true; controls();
  try {
    const selected = providers[Number(walletSelect.value)];
    if (!selected) throw new Error('Install an external wallet and serve this file from localhost.');
    provider?.removeListener?.('accountsChanged', walletChanged);
    provider?.removeListener?.('chainChanged', walletChanged);
    provider = selected.provider;
    account = undefined; backup = undefined; el('orders').replaceChildren(); invalidate();
    provider.on?.('accountsChanged', walletChanged); provider.on?.('chainChanged', walletChanged);
    const addresses = await provider.request({ method: 'eth_requestAccounts' });
    const chain = await provider.request({ method: 'eth_chainId' });
    if (chain !== '0x1') throw new Error('Select Ethereum mainnet in your wallet, then connect again.');
    if (!addresses[0]) throw new Error('The wallet did not provide an account.');
    account = getAddress(addresses[0]);
    el('account').textContent = account;
    message('Connected. Loading your Signature stakes directly from Ethereum…');
  } catch (error) { account = undefined; message(describeError(error), true); }
  finally { busy = false; controls(); }
  if (account) await refresh();
};
connection.onchange = () => { el('custom-rpc').hidden = connection.value !== 'custom'; invalidate(); message('Read connection changed. Load from Ethereum to verify it.'); };
el<HTMLInputElement>('rpc').oninput = () => { invalidate(); };
walletSelect.onchange = walletChanged;
el<HTMLSelectElement>('arkiv-connection').onchange = () => {
  el('custom-arkiv-rpc').hidden = el<HTMLSelectElement>('arkiv-connection').value !== 'custom';
  clearRecovered(); controls();
};
el<HTMLInputElement>('arkiv-rpc').oninput = () => { clearRecovered(); controls(); };

function renderRecovered() {
  const container = el('recovered-orders'); container.replaceChildren();
  const labels: Record<RecoveryStatus['state'], string> = {
    open: 'Not cancelled · trade eligibility unchecked', cancelled: 'Cancelled', filled: 'Filled (fully or partly)',
    'counter-invalidated': 'Invalidated by counter', expired: 'Signed order expired', 'not-started': 'Not started',
  };
  for (const entry of recovered) {
    const item = document.createElement('article'); item.className = 'item';
    const title = document.createElement('h3');
    title.textContent = `${entry.relation === 'incoming' ? 'Incoming bid' : entry.signed.order.kind === 0 ? 'My listing' : 'My bid'} · Signature #${entry.signed.order.tokenId}`;
    const facts = document.createElement('p');
    facts.textContent = `${amount(BigInt(entry.signed.order.amount))} WISE · ${labels[entry.status.state]}`;
    const identity = document.createElement('small'); identity.className = 'address'; identity.textContent = entry.hash;
    const verification = document.createElement('small');
    verification.textContent = `Maker signature checked · Ethereum block ${entry.status.blockNumber} · Arkiv v${entry.version} record expires at Rabdi block ${entry.expiresAtBlock}.`;
    item.append(title, facts, identity, verification);
    if (entry.relation === 'own' && ['open', 'not-started'].includes(entry.status.state))
      item.append(rowButton('Review cancellation', { kind: 'cancel', signed: entry.signed }));
    if (entry.relation === 'incoming') {
      const note = document.createElement('small'); note.textContent = 'Signed by another wallet. You cannot cancel this bid; accepting bids is outside this tool.'; item.append(note);
    }
    container.append(item);
  }
}
button('find-orders').onclick = async () => {
  if (busy || !account) return;
  busy = true; clearRecovered(); controls();
  const current = generation, expected = account;
  const assertCurrent = () => { if (current !== generation || account !== expected) throw new Error('Wallet or connection changed. Search again.'); };
  const status = el('recovery-status');
  status.textContent = 'Reading published records directly from Arkiv…';
  try {
    const endpoint = el<HTMLSelectElement>('arkiv-connection').value === 'custom' ? el<HTMLInputElement>('arkiv-rpc').value : arkivRecovery.rpc;
    const found = await discoverRecoveryOrders(recoveryRequest(endpoint), expected, assertCurrent);
    assertCurrent();
    const client = clients().client, block = await verifyBackupContracts(client);
    assertCurrent();
    let next = 0, checked = 0, unverifiable = 0;
    const verified: typeof recovered = [];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < found.orders.length) {
        assertCurrent();
        const entry = found.orders[next++];
        try { verified.push({ ...entry, status: await verifyRecoveredOrder(client, entry, 1, block) }); }
        catch { unverifiable++; }
        assertCurrent(); checked++;
        status.textContent = `Checking maker signatures and Ethereum state: ${checked} of ${found.orders.length}…`;
      }
    }));
    assertCurrent();
    const unique = new Map<Hex, (typeof verified)[number]>();
    for (const entry of verified.sort((a, b) => b.version - a.version)) if (!unique.has(entry.hash)) unique.set(entry.hash, entry);
    recovered = [...unique.values()].sort((a, b) => a.hash.localeCompare(b.hash)); renderRecovered();
    const own = recovered.filter(order => order.relation === 'own').length;
    status.textContent = `${own} verified orders signed by you; ${recovered.length - own} incoming bids. ` +
      `${found.rejected} malformed records skipped; ${unverifiable} signatures or Ethereum checks could not be verified. ` +
      (found.failedSchemas ? `${found.failedSchemas} schema searches failed or stopped early. Results are incomplete. ` : '') +
      (found.truncated ? 'Search limit reached (50 records per schema). Results are incomplete. ' : '') +
      'Only live, published records can be found. Missing results never prove there are no orders. Pages read current blocks and can shift during updates.';
    message('Arkiv search finished. Review the recovery results and any incomplete-search notice.');
  } catch (error) {
    if (current === generation) { clearRecovered(); status.textContent = describeError(error); message('Order discovery could not finish. Saved-file and counter cancellation remain available.', true); }
  } finally { busy = false; controls(); }
};
button('export-recovered').onclick = () => {
  if (busy || !account) return;
  const exported = createBackup(account, recovered.filter(order => order.relation === 'own').map(order => order.signed));
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `garuda-orders-${account.toLowerCase()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(`Exported ${exported.orders.length} verified orders signed by this wallet. Keep the file safe; signatures are included.`);
};

function rowButton(label: string, selectedAction: BackupAction) {
  const node = document.createElement('button'); node.className = 'secondary'; node.textContent = label;
  node.dataset.action = selectedAction.kind; node.onclick = () => openReview(selectedAction); return node;
}
function renderState() {
  const container = el('stakes'); container.replaceChildren();
  el('permissions').textContent = state ? `WISE allowance: ${amount(state.allowance)} WISE. Signature collection permission: ${state.operator ? 'enabled' : 'not enabled'}.` : 'Not loaded';
  el('counter').textContent = `Current counter: ${state?.counter.toString() ?? 'not loaded'}`;
  if (!state) { container.textContent = 'Load from Ethereum to view your current positions.'; return; }
  if (state.portfolio.positions.length === 0) { container.textContent = 'No Signature NFTs are held by this wallet.'; return; }
  for (const position of state.portfolio.positions) {
    const node = document.createElement('article'); node.className = 'item';
    const title = document.createElement('h3'); title.textContent = `Signature #${position.tokenId}`;
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = position.status; title.append(tag);
    const facts = document.createElement('p'); facts.textContent = `${amount(position.principal)} WISE principal · Maturity: ${new Date(position.maturesAt * 1000).toLocaleDateString(undefined, { dateStyle: 'long' })}`;
    node.append(title, facts);
    if (position.status === 'Mature' && position.canList) node.append(rowButton('Review redemption', { kind: 'redeem', tokenId: BigInt(position.tokenId) }));
    const approval = state.approvals.find(item => item.tokenId === position.tokenId);
    if (approval && !sameAddress(approval.approved, zeroAddress)) {
      const text = document.createElement('small'); text.textContent = `Token approval: ${approval.approved}`; node.append(text);
      node.append(rowButton('Clear token approval', { kind: 'revoke-nft', tokenId: BigInt(position.tokenId) }));
    }
    container.append(node);
  }
}
async function refresh() {
  if (busy || !account) return;
  busy = true; const current = generation, expected = account; controls();
  try {
    const result = await readBackupState(clients().client, expected);
    if (current !== generation || account !== expected) return;
    state = result; renderState();
    message(`Verified Signature positions at Ethereum block ${result.portfolio.blockNumber}. ${pending ? 'A submitted transaction is still being tracked.' : 'Choose an action to review.'}`);
  } catch (error) { if (current === generation) { state = undefined; renderState(); message(describeError(error), true); } }
  finally { busy = false; controls(); }
}
button('refresh').onclick = refresh;
el<HTMLInputElement>('import').onchange = async event => {
  const input = event.currentTarget as HTMLInputElement, file = input.files?.[0];
  if (!file || !account || busy) return;
  const current = generation, expected = account;
  backup = undefined; el('orders').replaceChildren();
  try {
    if (file.size > 512_000) throw new Error('Backup is too large. The limit is 512 KB and 100 orders.');
    const raw = JSON.parse(await file.text());
    if (current !== generation || account !== expected) throw new Error('Wallet changed during import. Import again.');
    backup = parseBackup(raw, expected);
    for (const signed of backup.orders) {
      const { hash } = parseSignedSale(signed, backupDeployment);
      const item = document.createElement('div'); item.className = 'item';
      const description = document.createElement('p'); description.textContent = `Signature #${signed.order.tokenId} · ${signed.order.kind === 0 ? 'Listing' : 'Bid'} · ${amount(BigInt(signed.order.amount))} WISE`;
      const identity = document.createElement('small'); identity.className = 'address'; identity.textContent = hash;
      item.append(description, identity, rowButton('Review cancellation', { kind: 'cancel', signed })); el('orders').append(item);
    }
    message(`Imported ${backup.orders.length} orders for this wallet. Nothing was uploaded or submitted.`);
  } catch (error) { message(describeError(error), true); }
  finally { input.value = ''; controls(); }
};
function openReview(next: BackupAction) {
  if (busy || pending || !account) return;
  action = next; consent.checked = false; button('confirm').disabled = true;
  const descriptions: Record<BackupAction['kind'], string> = {
    cancel: 'Cancel this signed order on Seaport 1.6. Cancellation is permanent for this order and costs Ethereum gas. Your stake stays in your wallet.',
    counter: 'Invalidate ALL orders signed with your current Seaport 1.6 counter, including listings and bids from other apps. Completed trades are unaffected. Approvals remain in place.',
    'revoke-wise': 'Set the WISE allowance for Seaport 1.6 to zero. This affects all marketplaces using this deployment. Signed orders are not cancelled.',
    'revoke-operator': 'Remove Seaport 1.6 permission for your whole Signature collection. Separate token approvals may remain. Signed orders are not cancelled.',
    'revoke-nft': 'Clear the approved address for this Signature NFT. Collection-wide operator permissions may remain. Signed orders are not cancelled.',
    redeem: 'Permanently burn this matured Signature NFT and redeem its underlying stake to your connected wallet. The stake will end. Early ending is disabled; ownership and maturity are checked again before sending.',
  };
  el('review-title').textContent = next.kind === 'redeem' ? `Redeem Signature #${next.tokenId}` : next.kind === 'cancel' ? `Cancel order for Signature #${next.signed.order.tokenId}` : 'Review permission change';
  el('review-description').textContent = descriptions[next.kind];
  el('review-account').textContent = `Wallet: ${account} · Ethereum mainnet`;
  review.showModal();
}
button('revoke-wise').onclick = () => openReview({ kind: 'revoke-wise' });
button('revoke-operator').onclick = () => openReview({ kind: 'revoke-operator' });
button('counter-action').onclick = () => openReview({ kind: 'counter' });
button('dismiss').onclick = () => { review.close(); action = undefined; };
consent.onchange = () => { button('confirm').disabled = !consent.checked; };
button('confirm').onclick = async () => {
  if (!action || !account || !consent.checked || busy || pending) return;
  const selected = action, expected = account, current = generation;
  action = undefined; review.close(); busy = true; controls();
  message('Checking contract code, current ownership, and transaction simulation. Review the request in your wallet.');
  try {
    const result = await executeBackupAction({ ...clients(), account: expected, chainId: 1,
      assertCurrent: () => { if (current !== generation || account !== expected) throw new Error('Wallet or connection changed. Review again.'); },
      onSubmitted: hash => { rememberPending({ hash, account: expected }); message(`Submitted ${hash}. Waiting for two confirmations. Do not resubmit.`); },
    }, selected);
    rememberPending(undefined); state = undefined; renderState(); clearRecovered();
    message(selected.kind === 'redeem' ? `Confirmed: Signature NFT redeemed. ${amount(result.received)} WISE received by ${expected}. Load from Ethereum to refresh.` : 'Confirmed on Ethereum and the resulting state was verified. Load from Ethereum to refresh.');
  } catch (error) {
    const submitted = pending as Pending | undefined;
    message(`${describeError(error)}${submitted ? ` Submitted transaction: ${submitted.hash}. Check it before retrying.` : ' No confirmed result.'}`, true);
  }
  finally { busy = false; controls(); }
};
button('check-pending').onclick = async () => {
  if (busy || !pending || !account) return;
  busy = true; controls();
  try {
    const client = clients().client;
    if (await client.getChainId() !== 1) throw new Error('Select an Ethereum mainnet read connection.');
    const receipt = await client.getTransactionReceipt({ hash: pending.hash });
    const block = await client.getBlockNumber({ cacheTime: 0 });
    if (block < receipt.blockNumber + 1n) throw new Error('Waiting for a second confirmation. Check again shortly.');
    message(receipt.status === 'success' ? 'The tracked transaction succeeded. Load from Ethereum and verify your positions and permissions before another action.' : 'The tracked transaction reverted. You can review and retry after loading current state.');
    rememberPending(undefined); state = undefined; renderState();
  } catch { message('The transaction is not yet confirmed through this RPC. Check your wallet for replacement or cancellation and keep the transaction hash.', true); }
  finally { busy = false; controls(); }
};
rememberPending(pending); controls();
