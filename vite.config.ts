import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  // maxParallelFileOps : lucide-react compte des centaines de fichiers d'icônes ; sans limite, le build
  // échoue avec EMFILE sur les environnements à faible limite de fichiers ouverts (Cloudflare Workers Builds).
  build: { sourcemap: false, target: 'es2022', rollupOptions: { maxParallelFileOps: 8 } }
});
