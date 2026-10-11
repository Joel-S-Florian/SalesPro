import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Sitio estático de promoción (sin backend). `npm run build --workspace @factos/landing` genera dist/.
export default defineConfig({
  plugins: [react()],
  server: { port: 5190, strictPort: true },
  preview: { port: 5190, strictPort: true },
  css: { postcss: './postcss.config.js' },
});
