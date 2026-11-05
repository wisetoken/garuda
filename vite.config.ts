import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3211, strictPort: true },
  preview: { host: '127.0.0.1', port: 3211, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        concept: fileURLToPath(new URL('./index.html', import.meta.url)),
        app: fileURLToPath(new URL('./garuda/index.html', import.meta.url)),
      },
    },
  },
});
