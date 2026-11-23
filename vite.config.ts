import { defineConfig } from 'vitest/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = '/scripture-memory/';

// Injects the list of built files into the service worker so the whole app
// is available offline after the first visit.
function precachePlugin() {
  let outDir = 'dist';
  return {
    name: 'sw-precache',
    configResolved(c: { build: { outDir: string } }) {
      outDir = c.build.outDir;
    },
    writeBundle(_: unknown, bundle: Record<string, unknown>) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
      const list = ['./', ...new Set([...files, ...extra])];
      const p = join(outDir, 'sw.js');
      const src = readFileSync(p, 'utf8');
      const version = Date.now().toString(36);
      writeFileSync(p, src.replace("'__PRECACHE__'", JSON.stringify(list)).replace('__VERSION__', version));
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [precachePlugin()],
  test: { include: ['tests/**/*.test.ts'] },
});
