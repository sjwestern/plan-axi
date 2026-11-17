import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('./check-publication.mjs', import.meta.url));
const hook = fileURLToPath(new URL('../.husky/pre-commit', import.meta.url));

test('publication guard scans the index and blocks actual commits', () => {
  const temp = mkdtempSync(join(tmpdir(), 'publication-guard-'));
  const repo = join(temp, 'repo');
  mkdirSync(repo);
  const env = { ...process.env, PUBLIC_REPO_DENYLIST: 'reserved-sample' };
  delete env.PUBLIC_REPO_DENYLIST_FILE;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  const run = (cmd, args, overrides = {}) => spawnSync(cmd, args, { cwd: repo, env: { ...env, ...overrides }, encoding: 'utf8' });
  const git = (...args) => {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
  };
  const check = (expected, overrides = {}) => {
    const result = run(process.execPath, [source], overrides);
    assert.equal(result.status, expected, result.stderr);
    assert.equal(result.stdout, '');
    return result;
  };
  const stage = (path, text) => { writeFileSync(join(repo, path), text); git('add', '--', path); };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.invalid');
    // Disable system/global hook and denylist configuration in the fixture.
    git('config', 'core.hooksPath', '.hooks');
    git('config', 'publication.denylistFile', '');
    stage('example.txt', 'generic example');
    check(0);
    check(1, { PUBLIC_REPO_DENYLIST: '' });
    stage('example.txt', 'RESERVED-SAMPLE');
    writeFileSync(join(repo, 'example.txt'), 'unstaged clean text');
    check(1); // A clean worktree must not hide a dirty index.
    stage('example.txt', 'generic example');
    writeFileSync(join(repo, 'example.txt'), 'reserved-sample');
    check(0); // Unstaged text is not committed.
    stage('example.txt', Buffer.from('reserved-sample', 'utf16le'));
    check(1);
    stage('example.txt', 'generic example');
    stage('RESERVED-SAMPLE file.txt', 'generic example');
    check(1);
    git('rm', '--cached', '--', 'RESERVED-SAMPLE file.txt');
    const file = join(temp, 'denylist.txt');
    writeFileSync(file, '# comment\r\nreserved-sample\r\n');
    check(0, { PUBLIC_REPO_DENYLIST: '', PUBLIC_REPO_DENYLIST_FILE: file });
    check(0, { PUBLIC_REPO_DENYLIST: '', PUBLIC_REPO_DENYLIST_FILE: '%PUBLICATION_TEST_ROOT%/denylist.txt', PUBLICATION_TEST_ROOT: temp });
    check(0, { PUBLIC_REPO_DENYLIST: '', PUBLIC_REPO_DENYLIST_FILE: '~/denylist.txt', HOME: temp, USERPROFILE: temp });
    stage('example.txt', 'reserved-sample');
    check(1, { PUBLIC_REPO_DENYLIST: '', PUBLIC_REPO_DENYLIST_FILE: file });
    check(1, { PUBLIC_REPO_DENYLIST_FILE: join(temp, 'missing') });
    git('config', 'publication.denylistFile', file);
    check(1, { PUBLIC_REPO_DENYLIST: '' });
    stage('example.txt', 'generic example');
    check(0, { PUBLIC_REPO_DENYLIST: '' });
    mkdirSync(join(repo, 'scripts'));
    mkdirSync(join(repo, '.hooks'));
    copyFileSync(source, join(repo, 'scripts/check-publication.mjs'));
    const hookPath = join(repo, '.hooks/pre-commit');
    writeFileSync(hookPath, '#!/bin/sh\n' + readFileSync(hook, 'utf8'));
    chmodSync(hookPath, 0o755);
    stage('example.txt', 'reserved-sample');
    assert.notEqual(run('git', ['commit', '-qm', 'chore: sample']).status, 0);
    stage('example.txt', 'generic example');
    git('commit', '-qm', 'chore: sample');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
