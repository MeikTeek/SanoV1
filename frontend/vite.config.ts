import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O proxy faz o navegador enxergar front e API na MESMA origem (localhost:5173),
// então os cookies HTTP-only com SameSite=strict funcionam normalmente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: false } },
  },
});
