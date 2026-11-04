import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.js'] },
});
