#!/usr/bin/env node
// Bundles the worker's rules engine the way wrangler does (esbuild) and replays the
// seeded snapshot games against that bundle, so the online build is checked too.
//
// Usage: node scripts/check-worker-engine.mjs   (needs `npm install` in worker/)

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'worker/package.json'));
const esbuild = require('esbuild');

const outDir = mkdtempSync(path.join(tmpdir(), 'veche-worker-engine-'));
const outfile = path.join(outDir, 'engine.mjs');
try {
  esbuild.buildSync({
    entryPoints: [path.join(root, 'worker/src/engine.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    outfile,
    logLevel: 'error',
  });
  console.log('Worker engine bundled; replaying the seeded games against it:');
  execFileSync(process.execPath, [path.join(root, 'simulate.js'), '--check', `--engine=${outfile}`], { stdio: 'inherit' });
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
