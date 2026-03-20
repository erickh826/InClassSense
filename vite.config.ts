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
