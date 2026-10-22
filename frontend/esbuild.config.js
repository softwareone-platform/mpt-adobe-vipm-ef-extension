import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');
const env = JSON.stringify(process.env.NODE_ENV ?? 'production');
const outdir = path.resolve(__dirname, '../static');
const modulesdir = path.resolve(__dirname, './src/modules');

const entryPoints = readdirSync(modulesdir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => path.join(modulesdir, dirent.name, 'index.tsx'))
  .filter((filePath) => existsSync(filePath))
  .sort();

if (entryPoints.length === 0) {
  console.log('No frontend module entrypoints found.');
  process.exit(0);
}

// Release builds put a content hash in each bundle name (index-<hash>.js), so a new
// release gets a new plug URL and browsers can't reuse a cached wizard. Watch builds
// keep index.js and drop hashed bundles left by a previous release build, so the
// backend serves the bundle being watched.
const hashedBundle = /^index-[A-Z0-9]+\.js(\.map)?$/;

mkdirSync(outdir, { recursive: true });
if (watch) {
  for (const dirent of readdirSync(outdir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const moduledir = path.join(outdir, dirent.name);
    for (const entry of readdirSync(moduledir)) {
      if (hashedBundle.test(entry)) rmSync(path.join(moduledir, entry), { force: true });
    }
  }
} else {
  for (const entry of readdirSync(outdir)) {
    rmSync(path.join(outdir, entry), { recursive: true, force: true });
  }
}

const ctx = await context({
  bundle: true,
  define: {
    'process.env.NODE_ENV': env,
  },
  entryNames: watch ? '[dir]/index' : '[dir]/index-[hash]',
  entryPoints,
  format: 'iife',
  loader: {
    '.md': 'text',
  },
  mainFields: ['browser', 'module', 'main'],
  outbase: modulesdir,
  outdir,
  platform: 'browser',
  plugins: [
    sassPlugin({
      filter: /\.scss$/,
      loadPaths: ['node_modules'],
      type: 'style',
    }),
  ],
  sourcemap: true,
});

if (watch) {
  await ctx.watch();
  console.log('watching...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
