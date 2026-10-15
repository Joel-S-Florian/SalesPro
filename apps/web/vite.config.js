import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react()],
    // Las pantallas se cargan de forma diferida (lazy): sin esto Vite descubre dependencias nuevas
    // (jsbarcode, ZXing...) al abrir cada pantalla, re-optimiza a mitad de sesión y falla con
    // "Failed to fetch dynamically imported module". Se escanean y pre-empaquetan desde el arranque.
    optimizeDeps: {
      entries: ['index.html', 'src/**/*.{js,jsx}'],
      include: [
        '@tanstack/react-query',
        '@zxing/browser',
        '@zxing/library',
        'jsbarcode',
        'jspdf',
        'jspdf-autotable',
        'lucide-react',
        'motion/react',
        'react-dom/client',
        'zustand',
        'zustand/middleware',
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    // El Worker de etiquetas (jsPDF) usa importaciones dinámicas: necesita formato ES
    worker: { format: 'es' },
    server: {
      port: 5180,
      strictPort: true, // puerto propio de FACTOS: no se mueve a otro si está ocupado
      proxy: {
        '/api': {
          // 127.0.0.1 y no «localhost»: en Windows «localhost» prueba primero IPv6 y cada petición pierde ~200 ms
          target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:4010',
          changeOrigin: true,
          secure: false,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    css: {
      postcss: './postcss.config.js',
    },
  };
});