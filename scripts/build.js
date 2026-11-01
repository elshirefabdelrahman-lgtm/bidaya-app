import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';

// Copy only public assets: migrations, environment files and tests never ship.
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/app.js'], outdir: 'dist/assets', bundle: true,
  splitting: true, format: 'esm', minify: true, target: ['chrome109'],
  entryNames: 'app', chunkNames: '[name]-[hash]', sourcemap: false });
for (const folder of ['brand', 'hero', 'styles']) {
  await cp(folder, `dist/${folder}`, { recursive: true });
}
const html = (await readFile('index.html', 'utf8'))
  .replace('./src/app.js', './assets/app.js')
  .replace('واجهة تجريبية لإدارة حسابات', 'نظام إدارة ومحاسبة');
await writeFile('dist/index.html', html);
await writeFile('dist/_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Cache-Control: no-store\n`);
console.log('Web build ready: dist/ (public assets only).');
