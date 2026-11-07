import {ETHEREUM_CONFIRMATIONS} from "../lib/confirmation-policy";
// SPDX-License-Identifier: MIT
import { createWalletClient, custom, formatUnits, getAddress, isAddress, zeroAddress,
  type Address, type EIP1193Provider, type Hex } from 'viem';
import { mainnet } from 'viem/chains';
import { createBackupFile, executeBackupAction, parseBackupFile, readBackupState, verifyBackupContracts,
  type BackupAction, type BackupEnvelope } from '../lib/backup/core';
import { parseSignedSale, sameAddress } from '../lib/blend/sales';
import { backupDeployments, backupDeploymentId } from '../lib/backup/core';
import { formatPaymentAmount, paymentToken } from '../lib/blend/payment-tokens';
import { canCancelRecovered, canExportRecovered, recoverySnapshots, visibleRecoveryEntries, verifyRecoveryEntries, type RecoveryEntry } from '../lib/backup/recovery-view';
import { backupReadClient } from '../lib/backup/connection';
import { privateReadSession } from '../lib/private-rpc';
import { arkivRecovery, discoverRecoveryOrders, recoveryRequest,
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
let privateTesting = false;
let privateTestAttempt = 0;
let state: Awaited<ReturnType<typeof readBackupState>> | undefined;
let backup: BackupEnvelope[] | undefined;
let action: BackupAction | undefined;
let recovered: RecoveryEntry[] = [];
let discovered: RecoveredOrder[] = [];
let searchedAccount: Address | undefined;
let discoveryNotice = '';
const lookup = el<HTMLInputElement>('lookup-account');
const validLookup = () => isAddress(lookup.value.trim(), { strict: false });
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
let toastTimer = 0;
function toast(text: string) {
  const stack = el('toasts');
  stack.replaceChildren();
  const node = document.createElement('div');
  node.className = 'toast';
  const body = document.createElement('p');
  body.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = 'Dismiss';
  const remove = () => { window.clearTimeout(toastTimer); if (node.isConnected) node.remove(); };
  close.onclick = remove;
  node.append(body, close);
  stack.append(node);
  toastTimer = window.setTimeout(remove, 8000);
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
  const locked = busy || privateTesting;
  button('connect').disabled = locked || providers.length === 0;
  walletSelect.disabled = locked;
  connection.disabled = busy;
  el<HTMLInputElement>('rpc').disabled = busy;
  button('refresh').disabled = locked || !account;
  el<HTMLInputElement>('import').disabled = locked || !account;
  button('check-pending').disabled = locked || !account;
  button('find-orders').disabled = locked || !validLookup();
  lookup.disabled = locked;
  button('verify-orders').disabled = locked || !discovered.length;
  button('export-recovered').disabled = locked || !account || !recovered.some(order => canExportRecovered(order, account));
  el<HTMLSelectElement>('arkiv-connection').disabled = busy;
  el<HTMLInputElement>('arkiv-rpc').disabled = busy;
  button('revoke-wise').disabled = locked || !!pending || !state || state.allowance === 0n;
  button('revoke-operator').disabled = locked || !!pending || !state?.operator;
  button('counter-action').disabled = locked || !!pending || !account;
  button('test-private').disabled = locked;
  button('stop-private').hidden = !privateTesting;
  button('test-private').textContent = privateTesting ? 'Testing private connection…' : privateReadSession.getSnapshot().phase === 'error' ? 'Retry private connection' : 'Test private connection';
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(node => { node.disabled = locked || !!pending || !account; });
}
function readClient() {
  return backupReadClient({ selection: connection.value, provider, rpcUrl: el<HTMLInputElement>('rpc').value });
}
function clients() {
  if (!provider || !account) throw new Error('Connect an external wallet first.');
  return { client: readClient(),
    wallet: createWalletClient({ chain: mainnet, transport: custom(provider, { retryCount: 0 }) }) };
}
function invalidate(preserveOrders = false) {
  generation++;
  state = undefined;
  action = undefined;
  if (preserveOrders) { recovered = visibleRecoveryEntries(recoverySnapshots(discovered, 'unavailable')); renderRecovered(); }
  else clearRecovered();
  review.close();
  renderState();
  controls();
}
function clearRecovered() {
  recovered = []; discovered = []; searchedAccount = undefined; discoveryNotice = '';
  el('recovered-orders').replaceChildren();
  el('recovery-status').textContent = 'Search only runs when you choose Find published orders.';
}
function walletChanged() {
  account = undefined; backup = undefined; lookup.value = '';
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
    account = getAddress(addresses[0]); lookup.value = account;
    el('account').textContent = account;
    message('Connected. Loading your Signature stakes from Ethereum…');
  } catch (error) { account = undefined; message(describeError(error), true); }
  finally { busy = false; controls(); }
  if (account) await refresh();
};
function privateStatus() {
  const status = privateReadSession.getSnapshot();
  el('private-status').textContent = status.phase === 'starting' ? 'Starting Nym and verifying the private Ethereum route…' :
    status.phase === 'error' ? 'Private connection unavailable. No direct fallback was used. Retry the test or choose a different read connection.' :
    status.phase === 'ready' ? `Private Ethereum connection ready${status.block ? ` · block ${BigInt(status.block).toLocaleString()}` : ''}.` :
    'Not started. Test the connection without connecting a wallet.';
  controls();
}
privateReadSession.subscribe(privateStatus);
connection.onchange = () => {
  privateTestAttempt++; privateTesting = false; privateReadSession.reset();
  el('custom-rpc').hidden = connection.value !== 'custom';
  el('private-connection').hidden = connection.value !== 'nym';
  el('connection-privacy').textContent = connection.value === 'nym' ?
    'Ethereum reads use the Nym mixnet. The destination RPC still sees requested addresses and data, but sees a Nym exit IP. Wallet traffic, transactions and Arkiv discovery use their own connections.' :
    'Direct reads are not anonymous. The selected provider can see your IP address and queried wallet.';
  invalidate(true); message('Read connection changed. Load positions or verify the published orders through this connection.');
};
button('test-private').onclick = async () => {
  if (busy || privateTesting || connection.value !== 'nym') return;
  privateTesting = true;
  const attempt = ++privateTestAttempt;
  if (privateReadSession.getSnapshot().phase === 'error') privateReadSession.reset();
  controls();
  try {
    const client = backupReadClient({ selection: 'nym' });
    const block = await verifyBackupContracts(client);
    if (attempt === privateTestAttempt) el('private-status').textContent =
      `Private read succeeded at Ethereum block ${block.number!.toLocaleString()}. Recovery contract code hashes verified. No wallet address was queried.`;
  } catch {
    if (attempt === privateTestAttempt) el('private-status').textContent =
      'Private connection or contract verification failed. No direct fallback was used. Retry the test or select another connection.';
  } finally { if (attempt === privateTestAttempt) { privateTesting = false; controls(); } }
};
button('stop-private').onclick = () => {
  privateTestAttempt++; privateTesting = false; privateReadSession.reset();
  el('private-status').textContent = 'Test stopped. Anon-RPC / Nym remains selected; no direct fallback was used.';
  controls();
};
el<HTMLInputElement>('rpc').oninput = () => { invalidate(true); };
lookup.oninput = () => { generation++; clearRecovered(); controls(); };
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
    title.textContent = `${entry.relation === 'incoming' ? 'Incoming bid' : entry.signed.order.kind === 0 ? 'Published listing' : 'Published bid'} · Signature #${entry.signed.order.tokenId}`;
    const facts = document.createElement('p'), token = paymentToken(entry.signed.order.currency);
    facts.textContent = `${formatPaymentAmount(BigInt(entry.signed.order.amount), token.address)} ${token.symbol} · Signature market ${entry.deploymentId.toUpperCase()}`;
    const verification = document.createElement('p');
    verification.textContent = entry.verification === 'verified' && entry.status
      ? `${labels[entry.status.state]} · Maker signature checked · Ethereum block ${entry.status.blockNumber}`
      : entry.verification === 'pending' ? 'Published snapshot — checking signature and current Ethereum status…'
      : entry.verification === 'failed' ? 'Published snapshot — signature or current status could not be verified. Actions unavailable.'
      : 'Published snapshot — current status unavailable. Signature and Ethereum state have not been verified. Actions unavailable.';
    const maker = document.createElement('small'); maker.className = 'address'; maker.textContent = `Signed maker field: ${entry.signed.order.maker}`;
    const identity = document.createElement('small'); identity.className = 'address'; identity.textContent = entry.hash;
    const expiry = document.createElement('small');
    expiry.textContent = `Signed offer deadline: ${new Date(Number(entry.signed.order.deadline) * 1000).toUTCString()} · Arkiv record expires at Rabdi block ${entry.expiresAtBlock}.`;
    const source = document.createElement('a'); source.href = `https://rabdi.explorer.arkiv.network/entity/${entry.entityKey}`;
    source.textContent = 'View published record on Arkiv ↗'; source.target = '_blank'; source.rel = 'noreferrer';
    item.append(title, facts, verification, maker, identity, expiry, source);
    if (canCancelRecovered(entry, account)) item.append(rowButton('Review cancellation', { kind: 'cancel', signed: entry.signed, deploymentId: entry.deploymentId }));
    if (!account || !sameAddress(entry.signed.order.maker, account)) {
      const note = document.createElement('small'); note.textContent = entry.relation === 'incoming'
        ? 'Only the signing bidder can cancel this order.' : 'Connect the signing wallet to cancel or export a verified order.';
      item.append(note);
    }
    container.append(item);
  }
  const verified = recovered.filter(entry => entry.verification === 'verified').length;
  el('recovery-status').textContent = `${recovered.length} published orders; ${verified} verified on Ethereum. ${discoveryNotice}`;
  controls();
}
async function verifyDiscovered(current: number) {
  const expected = searchedAccount;
  const assertCurrent = () => { if (current !== generation || searchedAccount !== expected) throw new Error('Wallet or connection changed. Search again.'); };
  await verifyRecoveryEntries(discovered, readClient, assertCurrent, entries => {
    assertCurrent(); recovered = visibleRecoveryEntries(entries); renderRecovered();
  });
}
button('find-orders').onclick = async () => {
  if (busy || privateTesting || !validLookup()) return;
  busy = true; clearRecovered(); controls();
  const current = generation, expected = getAddress(lookup.value.trim().toLowerCase());
  searchedAccount = expected;
  const assertCurrent = () => { if (current !== generation || searchedAccount !== expected) throw new Error('Wallet or connection changed. Search again.'); };
  const status = el('recovery-status');
  status.textContent = 'Reading published records directly from Arkiv…';
  try {
    const endpoint = el<HTMLSelectElement>('arkiv-connection').value === 'custom' ? el<HTMLInputElement>('arkiv-rpc').value : arkivRecovery.rpc;
    const found = await discoverRecoveryOrders(recoveryRequest(endpoint), expected, assertCurrent);
    assertCurrent(); discovered = found.orders;
    discoveryNotice = `${found.rejected} malformed records skipped. ` +
      (found.failedSchemas ? `${found.failedSchemas} schema searches failed or stopped early. Results are incomplete. ` : '') +
      (found.truncated ? 'Search limit reached (50 records per schema across V1/V2). Results are incomplete. ' : '') +
      'Only live published records can be found. This is not a complete stake inventory. Missing results never prove there are no orders.';
    recovered = visibleRecoveryEntries(recoverySnapshots(discovered)); renderRecovered();
    await verifyDiscovered(current);
    assertCurrent();
    toast(found.failedSchemas || found.truncated ? 'Arkiv search finished. Some results are incomplete.' : 'Arkiv search finished.');
  } catch (error) {
    if (current === generation) { clearRecovered(); status.textContent = describeError(error); message('Order discovery could not finish. Saved-file and counter cancellation remain available.', true); }
  } finally { busy = false; controls(); }
};
button('verify-orders').onclick = async () => {
  if (busy || privateTesting || !discovered.length) return;
  busy = true; controls();
  try { await verifyDiscovered(generation); }
  catch { /* A changed wallet/lookup has already cleared the old results. */ }
  finally { busy = false; controls(); }
};
button('export-recovered').onclick = () => {
  if (busy || privateTesting || !account) return;
  const entries = recovered.filter(order => canExportRecovered(order, account));
  if (!entries.length) return;
  const exported = createBackupFile(account, entries);
  const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `garuda-orders-${account.toLowerCase()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(`Exported ${entries.length} verified orders signed by this wallet. Keep the file safe; signatures are included.`);
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
    backup = parseBackupFile(raw, expected);
    for (const group of backup) for (const signed of group.orders) {
      const deploymentId = backupDeploymentId(group.adapter);
      const { hash } = parseSignedSale(signed, backupDeployments[deploymentId]);
      const item = document.createElement('div'); item.className = 'item';
      const description = document.createElement('p'); description.textContent = `Signature #${signed.order.tokenId} · ${signed.order.kind === 0 ? 'Listing' : 'Bid'} · ${formatPaymentAmount(BigInt(signed.order.amount), signed.order.currency)} ${paymentToken(signed.order.currency).symbol} · Market ${deploymentId.toUpperCase()}`;
      const identity = document.createElement('small'); identity.className = 'address'; identity.textContent = hash;
      item.append(description, identity, rowButton('Review cancellation', { kind: 'cancel', signed, deploymentId })); el('orders').append(item);
    }
    message(`Imported ${backup.reduce((n, group) => n + group.orders.length, 0)} orders for this wallet. Nothing was uploaded or submitted.`);
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
      onSubmitted: hash => { rememberPending({ hash, account: expected }); message(`Submitted ${hash}. Waiting for one confirmation. Do not resubmit.`); },
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
    if (block - receipt.blockNumber + 1n < BigInt(ETHEREUM_CONFIRMATIONS)) throw new Error('Waiting for transaction confirmation. Check again shortly.');
    message(receipt.status === 'success' ? 'The tracked transaction succeeded. Load from Ethereum and verify your positions and permissions before another action.' : 'The tracked transaction reverted. You can review and retry after loading current state.');
    rememberPending(undefined); state = undefined; renderState();
  } catch { message('The transaction is not yet confirmed through this RPC. Check your wallet for replacement or cancellation and keep the transaction hash.', true); }
  finally { busy = false; controls(); }
};
rememberPending(pending); controls();
