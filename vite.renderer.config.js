/* eslint-env node */

import { chrome } from './.electron-vendors.cache.json';
import { join } from 'path';
import { builtinModules } from 'module';
import react from '@vitejs/plugin-react';

const SRC_ROOT = join(__dirname, 'src');

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  mode: process.env.MODE,
  plugins: [react()],
  root: SRC_ROOT,

  server: {
    fs: {
      strict: true
    }
  },

  build: {
    sourcemap: true,
    target: `chrome${chrome}`,
    outDir: 'build/renderer',

    assetsDir: '.',
    rollupOptions: {
      input: 'src/desktop.html',
      external: [...builtinModules.flatMap((p) => [p, `node:${p}`])]
    },
    emptyOutDir: true,
    brotliSize: false
  },
  test: {
    environment: 'happy-dom'
  }
};

export default config;
