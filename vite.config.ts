import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { localDeploymentPlugin } from './scripts/local-deployment';
import { withoutWalletAnalytics } from './scripts/no-analytics';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api/garuda': { target: env.GARUDA_MARKET_API_ORIGIN || 'http://127.0.0.1:3213', changeOrigin: true }, '/api/wise-price': { target: 'https://wise.one', changeOrigin: true }, '/api': { target: env.GARUDA_API_ORIGIN || 'http://127.0.0.1:3202', changeOrigin: true } };
  return {
    plugins: [localDeploymentPlugin(env.GARUDA_MARKET_API_ORIGIN || 'http://127.0.0.1:3213'), withoutWalletAnalytics(), react()],
    // Thirdweb remains unbundled so the analytics transform runs in dev.
    // Its CommonJS-backed dependencies still need browser ESM conversion.
    optimizeDeps: { exclude: ['thirdweb'], include: ['eventemitter3', '@emotion/react', '@emotion/styled', '@radix-ui/react-dialog', '@radix-ui/react-focus-scope', '@radix-ui/react-icons', '@radix-ui/react-tooltip', '@walletconnect/sign-client', '@walletconnect/universal-provider', '@coinbase/wallet-sdk', '@base-org/account', 'input-otp', 'qrcode'] },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 3212, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 3214, strictPort: true, proxy },
    build: { rolldownOptions: { input: {
      concept: fileURLToPath(new URL('./index.html', import.meta.url)),
      app: fileURLToPath(new URL('./garuda/index.html', import.meta.url)),
    } } },
  };
});
