import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Cast process to any to avoid TS errors in the config file specifically
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This ensures process.env.API_KEY works in the browser for the Gemini service
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Polyfill process.env for other legacy libraries if needed
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
    }
  };
});
