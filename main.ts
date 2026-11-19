// Sunset Cover Studio — gta6-cover-art-01 entrypoint (Node 22, stdlib only).
//
// What it does: copies this repository's app/ and screenshots/ into the
// grader's output directory and writes /output/dossier.json with the vendored
// make.fun library, so the judge can read the app and its screenshots.
//
// It never deletes anything: the grader runs with /output already created and
// writable, on a read-only parent filesystem, so removing the output directory
// itself would fail. mkdir (recursive) + copy is all the filesystem needs.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function fail(message) {
  throw new Error(`sunset-cover-studio main.ts: ${message}`);
}

// The app's entry page must be there, and at least one screenshot, or there
// is nothing for the judge to look at.
const indexHtml = join(repoRoot, 'app', 'index.html');
if (!existsSync(indexHtml) || !statSync(indexHtml).isFile()) fail('app/index.html is missing');
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir) || readdirSync(shotsDir).filter((n) => !n.startsWith('.')).length === 0) {
  fail('screenshots/ holds no screenshots');
}

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'app'), join(outDir, 'app'));
copyTree(shotsDir, join(outDir, 'screenshots'));

// The dossier the judge reads: app sources + screenshots, as the vendored
// library writes them, capped to the scorer's own limits.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
