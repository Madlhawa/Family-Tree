import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is relative so the build works on GitHub Pages under /<repo>/ and from any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
} as any);
