import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The API address is the only thing this client needs to be told. Everything
// else it learns from the API itself.
export default defineConfig({
  plugins: [react()],
  // Sample day supplies its two public settings explicitly. No .env file,
  // including .env.local or .env.development, may add installation data.
  envDir: process.env.VITE_OPENDUET_SAMPLE === 'on' ? false : undefined,
  server: { port: 5180 },
  // A production bundle carries no source maps: the client's sources are not
  // served beside it. The development server maps as before.
  build: { outDir: 'dist', sourcemap: false },
});
