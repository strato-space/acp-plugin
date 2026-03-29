import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAcpUiVersionFromTag,
  syncAcpUiPackageVersion,
} from './acp-ui-release-version.mjs';

test('extractAcpUiVersionFromTag accepts release tags with semver payloads', () => {
  assert.equal(extractAcpUiVersionFromTag('acp-ui-v1.2.3'), '1.2.3');
  assert.equal(extractAcpUiVersionFromTag('acp-ui-v1.2.3-beta.1'), '1.2.3-beta.1');
  assert.equal(extractAcpUiVersionFromTag('acp-ui-v1.2.3+build.9'), '1.2.3+build.9');
});

test('extractAcpUiVersionFromTag rejects malformed ACP UI tags', () => {
  assert.throws(() => extractAcpUiVersionFromTag('v1.2.3'), /Invalid ACP UI release tag/);
  assert.throws(() => extractAcpUiVersionFromTag('acp-ui-v1.2'), /Invalid ACP UI release tag/);
  assert.throws(() => extractAcpUiVersionFromTag('acp-ui-vlatest'), /Invalid ACP UI release tag/);
});

test('syncAcpUiPackageVersion rewrites the package version deterministically', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'acp-ui-release-version-'));
  const packagePath = path.join(tempDir, 'package.json');

  fs.writeFileSync(
    packagePath,
    `${JSON.stringify({ name: '@strato-space/acp-ui', version: '0.1.0' }, null, 2)}\n`,
  );

  syncAcpUiPackageVersion(packagePath, '2.3.4');

  const nextPackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(nextPackage.version, '2.3.4');
});
