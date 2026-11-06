import type { Plugin } from 'vite';

// thirdweb 5.120.1 has no analytics opt-out. Replace its shared event sender
// during compilation so connect/transaction events cannot leave this client.
// This does not intercept functional RPC, authentication, or wallet requests.
export function withoutWalletAnalytics(): Plugin {
  let replaced = false;
  let walletConnectConfigured = false;
  return {
    name: 'garuda-without-wallet-analytics', enforce: 'pre',
    buildStart() { replaced = false; walletConnectConfigured = false; },
    transform(code, id) {
      if (/\/thirdweb\/dist\/esm\/analytics\/track\/index\.js$/.test(id.split('?')[0])) {
        replaced = true;
        return { code: 'export async function track() {}', map: null };
      }
      if (/\/thirdweb\/dist\/esm\/wallets\/wallet-connect\/controller\.js$/.test(id.split('?')[0])) {
        const entry = 'UniversalProvider.init({';
        if (!code.includes(entry)) this.error('WalletConnect initialization changed; review telemetry settings.');
        walletConnectConfigured = true;
        return { code: code.replace(entry, `${entry}\ntelemetryEnabled: false,`), map: null };
      }
    },
    generateBundle() {
      if (!replaced) this.error('Thirdweb analytics entry changed. Review the SDK before shipping this build.');
      if (!walletConnectConfigured) this.error('WalletConnect telemetry opt-out was not applied.');
    },
  };
}
