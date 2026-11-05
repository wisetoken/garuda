import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = { '/api/garuda': { target: env.GARUDA_MARKET_API_ORIGIN || 'http://127.0.0.1:3213', changeOrigin: true }, '/api': { target: env.GARUDA_API_ORIGIN || 'http://127.0.0.1:3202', changeOrigin: true } };
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 3212, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 3214, strictPort: true, proxy },
    build: { rolldownOptions: { input: {
      concept: fileURLToPath(new URL('./index.html', import.meta.url)),
      app: fileURLToPath(new URL('./garuda/index.html', import.meta.url)),
    } } },
  };
});
