// Assembles the flighthq.ai Pages artifact into dist/:
//
//   dist/            ← landing page (this repo, base "/")
//   dist/reference/  ← flight-reference's prebuilt bundle (built at base "/reference/", downloaded)
//
// The landing is built here from source (against the published @flighthq/sdk). The reference route is
// NOT built here — flight-reference publishes its compiled dist as a tarball attached to each GitHub
// release; we download the latest (or REFERENCE_VERSION) and unpack it under dist/reference/. This is
// the descendant of the monorepo's scripts/build-site.ts, minus the workspace-build logic.
//
// Env:
//   PAGES_CNAME        custom domain written to dist/CNAME (e.g. flighthq.ai). Unset → no CNAME.
//   REFERENCE_REPO     owner/name of the reference repo. Default "flighthq/flight-reference".
//   REFERENCE_VERSION  a specific reference tag (e.g. v0.1.0). Unset → latest release.
//   GH_TOKEN           token for `gh release download` (set in CI; a PAT if the repo is private).

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

// 1. Build the landing page (vite → dist/).
run('npm', ['run', 'build']);

// 2. Download flight-reference's release bundle and unpack it into dist/reference/.
const referenceRepo = process.env['REFERENCE_REPO'] ?? 'flighthq/flight-reference';
const referenceVersion = process.env['REFERENCE_VERSION'];
const tmp = mkdtempSync(join(tmpdir(), 'flight-reference-'));
try {
  run('gh', [
    'release',
    'download',
    ...(referenceVersion ? [referenceVersion] : []),
    '--repo',
    referenceRepo,
    '--pattern',
    'reference-dist*.tgz',
    '--dir',
    tmp,
  ]);
  const tarball = readdirSync(tmp).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) throw new Error(`no reference-dist*.tgz asset on the ${referenceRepo} release`);

  const referenceDir = join(dist, 'reference');
  mkdirSync(referenceDir, { recursive: true });
  // flight-reference tars its dist CONTENTS at the tarball root (tar -C dist .), so no strip needed.
  run('tar', ['-xzf', join(tmp, tarball), '-C', referenceDir]);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 3. CNAME so GitHub Pages serves under the custom domain.
const cname = process.env['PAGES_CNAME'];
if (cname !== undefined && cname !== '') writeFileSync(join(dist, 'CNAME'), `${cname}\n`);

console.log(`[assemble] dist/ ready — landing + /reference/${cname ? ` (CNAME ${cname})` : ''}`);

function run(command: string, args: readonly string[]): void {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}
