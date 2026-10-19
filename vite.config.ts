import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [react(), cloudflare()],
  // The PDF renderer chunk (PDFKit + fontkit) is large but only loads on the print-shop page.
  build: { chunkSizeWarningLimit: 1600 },
  optimizeDeps: { include: ['pdfkit', 'bwip-js', 'fflate'] },
});
