import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(scriptDir, '..');
const targetArg = process.argv[2];

if (!targetArg) {
  throw new Error('Usage: node scripts/stage-runtime.mjs <empty-target-directory>');
}

const targetRoot = resolve(targetArg);
const targetParsed = parse(targetRoot);

if (!isAbsolute(targetRoot) || targetRoot === targetParsed.root || targetRoot === sourceRoot) {
  throw new Error(`Refusing unsafe runtime target: ${targetRoot}`);
}

await mkdir(targetRoot, { recursive: true });
const existing = await readdir(targetRoot);
if (existing.length > 0) {
  throw new Error(`Runtime target must be empty: ${targetRoot}`);
}

const entries = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.env.example',
  'src',
  'Test',
  'scripts/start-wsl.sh',
  'scripts/wsl-common.sh',
  'scripts/prepare-wsl-runtime.sh',
  'scripts/stage-runtime.mjs',
];

for (const entry of entries) {
  await mkdir(dirname(resolve(targetRoot, entry)), { recursive: true });
  await cp(resolve(sourceRoot, entry), resolve(targetRoot, entry), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
}

const manifest = {
  schema: 1,
  staged_at: new Date().toISOString(),
  source_root: sourceRoot,
  target_root: targetRoot,
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  copied_entries: entries,
  excluded: ['.env', '.env.*', '.git', 'node_modules', 'dist', 'StatusProject'],
};

await writeFile(resolve(targetRoot, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Staged Coolify MCP runtime source at ${targetRoot}`);
