import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildScript = join(__dirname, 'build.mjs');
const skippedBuildMarker = join(__dirname, '..', '.glimpse-build-skipped');

function hasCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function hasDotnetSdk() {
  const result = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8' });
  return !result.error && result.status === 0 && Boolean(result.stdout.trim());
}

rmSync(skippedBuildMarker, { force: true });

if (process.platform === 'darwin' && !hasCommand('swiftc')) {
  const message = 'Postinstall skipped native build because swiftc was not found. Install Xcode Command Line Tools, then run npm run build:macos.';
  writeFileSync(skippedBuildMarker, message + '\n');
  console.warn(`[glimpse] ${message}`);
  process.exit(0);
}

if (process.platform === 'win32' && !hasDotnetSdk()) {
  const message = 'Postinstall skipped native build because the .NET 8 SDK was not found. Install it, then run npm run build:windows.';
  writeFileSync(skippedBuildMarker, message + '\n');
  console.warn(`[glimpse] ${message}`);
  process.exit(0);
}

if (process.platform !== 'darwin' && process.platform !== 'win32') {
  process.exit(0);
}

const result = spawnSync(process.execPath, [buildScript], { stdio: 'inherit' });
process.exit(result.status ?? 1);
