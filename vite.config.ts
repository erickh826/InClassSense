import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        // Prefix all asset filenames with 'v3.' to prevent browser cache
        // collisions with demoV2 (in-class-sense-xi.vercel.app), which shares
        // the same content-based hashes for unchanged files.
        assetFileNames: 'assets/v3.[name]-[hash][extname]',
        chunkFileNames: 'assets/v3.[name]-[hash].js',
        entryFileNames: 'assets/v3.[name]-[hash].js',
      },
    },
  },
  server: {
    proxy: {
      '/api/chat': {
        target: process.env.LLM_API_URL || 'https://YOUR_RESOURCE.openai.azure.com',
        changeOrigin: true,
        rewrite: () => {
          const deployment = process.env.LLM_DEPLOYMENT || 'gpt-4o';
          const apiVersion = process.env.LLM_API_VERSION || '2024-12-01-preview';
          return `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        },
      },
    },
  },
});
