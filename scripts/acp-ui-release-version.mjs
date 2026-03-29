#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER_BODY = '[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';
const ACP_UI_TAG_PATTERN = new RegExp(`^acp-ui-v(${SEMVER_BODY})$`);

export function extractAcpUiVersionFromTag(tag) {
  if (typeof tag !== 'string' || tag.trim().length === 0) {
    throw new Error('ACP UI release tag is required.');
  }

  const trimmed = tag.trim();
  const match = trimmed.match(ACP_UI_TAG_PATTERN);
  if (!match || !match[1]) {
    throw new Error(
      `Invalid ACP UI release tag "${trimmed}". Expected format acp-ui-v<semver>.`,
    );
  }

  return match[1];
}

export function syncAcpUiPackageVersion(packageJsonPath, version) {
  if (typeof packageJsonPath !== 'string' || packageJsonPath.trim().length === 0) {
    throw new Error('Package path is required.');
  }
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new Error('ACP UI package version is required.');
  }

  const raw = fs.readFileSync(packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.version = version;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {
    tag: process.env.GITHUB_REF_NAME ?? '',
    packagePath: 'packages/acp-ui/package.json',
    printOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--tag') {
      index += 1;
      args.tag = argv[index] ?? '';
      continue;
    }
    if (token === '--package') {
      index += 1;
      args.packagePath = argv[index] ?? args.packagePath;
      continue;
    }
    if (token === '--print-only') {
      args.printOnly = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

const isCliEntry = process.argv[1] === fileURLToPath(import.meta.url);

if (isCliEntry) {
  const { tag, packagePath, printOnly } = parseArgs(process.argv.slice(2));
  const version = extractAcpUiVersionFromTag(tag);
  if (!printOnly) {
    syncAcpUiPackageVersion(path.resolve(packagePath), version);
  }
  process.stdout.write(`${version}\n`);
}
