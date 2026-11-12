import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  // Debug logging stays in development; production builds drop it
  // (warnings and errors are kept)
  esbuild: mode === 'production'
    ? { pure: ['console.log', 'console.debug', 'console.trace'] }
    : {},
}));
