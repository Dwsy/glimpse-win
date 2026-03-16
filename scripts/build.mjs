import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skippedBuildMarker = join(__dirname, '..', '.glimpse-build-skipped');
const target = process.argv[2] || process.platform;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasDotnetSdk() {
  const result = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8' });
  return !result.error && result.status === 0 && Boolean(result.stdout.trim());
}

switch (target) {
  case 'darwin':
    run('swiftc', ['-O', 'src/glimpse.swift', '-o', 'src/glimpse']);
    break;
  case 'win32': {
    if (!hasDotnetSdk()) {
      fail('Missing .NET SDK. Install .NET 8 SDK, then rerun `npm run build:windows`.');
    }
    const runtime = process.env.GLIMPSE_WINDOWS_RUNTIME || 'win-x64';
    run('dotnet', [
      'publish',
      'native/windows/Glimpse.Windows.csproj',
      '-c', 'Release',
      '-r', runtime,
      '--self-contained', 'false',
      '-o', 'native/windows/bin',
    ]);
    break;
  }
  default:
    fail(`Unsupported build target: ${target}`);
}
