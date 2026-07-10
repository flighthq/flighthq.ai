// Assembles the flighthq.ai Pages artifact into dist/:
//
//   dist/            ← landing page (this repo, base "/")
//   dist/examples/   ← flight monorepo's prebuilt examples bundle (built at base "/examples/", downloaded)
//   dist/reference/  ← flight-reference's prebuilt bundle (built at base "/reference/", downloaded)
//
// The landing is built here from source (against the published @flighthq/sdk). The examples and
// reference routes are NOT built here — each publishes its compiled dist as a tarball attached to its
// GitHub release; we download the latest (or pinned version) and unpack into the matching subdirectory.
//
// Env:
//   PAGES_CNAME        custom domain written to dist/CNAME (e.g. flighthq.ai). Unset → no CNAME.
//   EXAMPLES_REPO      owner/name of the examples source repo. Default "flighthq/flight".
//   EXAMPLES_VERSION   a specific examples tag (e.g. v0.1.0). Unset → latest release.
//   REFERENCE_REPO     owner/name of the reference repo. Default "flighthq/flight-reference".
//   REFERENCE_VERSION  a specific reference tag (e.g. v0.1.0). Unset → latest release.
//   GH_TOKEN           token for `gh release download` (set in CI; a PAT if the repo is private).

import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

// 1. Build the landing page (vite → dist/).
run('npm', ['run', 'build']);

// 2. Download prebuilt bundles and unpack them into dist/<subpath>/.
downloadBundle({
  label: 'examples',
  repo: process.env['EXAMPLES_REPO'] ?? 'flighthq/flight',
  version: process.env['EXAMPLES_VERSION'],
  pattern: 'examples-dist*.tgz',
  destDir: join(dist, 'examples'),
  base: '/examples/',
});

downloadBundle({
  label: 'reference',
  repo: process.env['REFERENCE_REPO'] ?? 'flighthq/flight-reference',
  version: process.env['REFERENCE_VERSION'],
  pattern: 'reference-dist*.tgz',
  destDir: join(dist, 'reference'),
  base: '/reference/',
});

// 3. CNAME so GitHub Pages serves under the custom domain.
const cname = process.env['PAGES_CNAME'];
if (cname !== undefined && cname !== '') writeFileSync(join(dist, 'CNAME'), `${cname}\n`);

console.log(`[assemble] dist/ ready — landing + /examples/ + /reference/${cname ? ` (CNAME ${cname})` : ''}`);

function downloadBundle(opts: {
  label: string;
  repo: string;
  version: string | undefined;
  pattern: string;
  destDir: string;
  base: string;
}): void {
  const tmp = mkdtempSync(join(tmpdir(), `flight-${opts.label}-`));
  try {
    run('gh', [
      'release',
      'download',
      ...(opts.version ? [opts.version] : []),
      '--repo',
      opts.repo,
      '--pattern',
      opts.pattern,
      '--dir',
      tmp,
    ]);
    const tarball = readdirSync(tmp).find((name) => name.endsWith('.tgz'));
    if (tarball === undefined)
      throw new Error(`no ${opts.pattern} asset on the ${opts.repo} release`);

    mkdirSync(opts.destDir, { recursive: true });
    run('tar', ['-xzf', join(tmp, tarball), '-C', opts.destDir]);
    rebaseBundle(opts.destDir, opts.base);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// If a downloaded bundle was built with base "/" instead of the expected subpath base,
// rewrite root-relative paths across the entire bundle so everything resolves correctly
// when served under a subpath. Detects correctly-built bundles and skips them.
function rebaseBundle(dir: string, base: string): void {
  const htmlPath = join(dir, 'index.html');
  let html: string;
  try {
    html = readFileSync(htmlPath, 'utf-8');
  } catch {
    return;
  }
  if (html.includes(`src="${base}`) || html.includes(`href="${base}`)) return;

  // Collect top-level directory names in the extracted bundle — these are the path prefixes
  // that root-relative URLs can start with (e.g. "openfl-tests", "starling-tests", "assets").
  const dirs = readdirSync(dir).filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });

  // Rewrite every .html file in the bundle (top-level harness AND nested test pages).
  const htmlFiles = findFiles(dir, '.html');
  for (const hp of htmlFiles) {
    const src = readFileSync(hp, 'utf-8');
    const patched = src.replace(
      /((?:src|href)\s*=\s*["'])\/((?!\/)[^"']*)/g,
      (_match, attr, path) => `${attr}${base}${path}`,
    );
    if (patched !== src) {
      writeFileSync(hp, patched);
      console.log(`[assemble] rebased ${hp}`);
    }
  }

  // Rewrite JS files: for each bundle directory, replace root-relative references
  // (e.g. "/openfl-tests/") with the base-prefixed version (e.g. "/reference/openfl-tests/").
  if (dirs.length === 0) return;
  const jsFiles = findFiles(dir, '.js');
  for (const jsPath of jsFiles) {
    const js = readFileSync(jsPath, 'utf-8');
    let patched = js;
    for (const d of dirs) {
      patched = patched.replaceAll(`"/${d}/`, `"${base}${d}/`);
      patched = patched.replaceAll(`'/${d}/`, `'${base}${d}/`);
    }
    if (patched !== js) {
      writeFileSync(jsPath, patched);
      console.log(`[assemble] rebased ${jsPath}`);
    }
  }

  console.log(`[assemble] rebase complete → base "${base}" (${htmlFiles.length} html, ${jsFiles.length} js)`);
}

function findFiles(dir: string, ext: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function run(command: string, args: readonly string[]): void {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}
