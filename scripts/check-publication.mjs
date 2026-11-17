#!/usr/bin/env node
// Commit guard: literal, case-insensitive terms, one per line (# comments allowed).
// Set PUBLIC_REPO_DENYLIST or PUBLIC_REPO_DENYLIST_FILE, or configure locally:
// Unix: git config publication.denylistFile '~/.config/public-repo/denylist.txt'
// Windows: git config publication.denylistFile '%USERPROFILE%/.config/public-repo/denylist.txt'
// Never commit that file. Scan the complete index, not unstaged working files.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Cannot read the Git index.');
  return result.stdout;
}

try {
  if (process.argv.length > 2) throw new Error('This commit guard accepts no arguments.');
  let source = process.env.PUBLIC_REPO_DENYLIST || '';
  let file = process.env.PUBLIC_REPO_DENYLIST_FILE;
  if (!file) {
    const result = spawnSync('git', ['config', '--path', '--get', 'publication.denylistFile'], { encoding: 'utf8' });
    if (result.error || ![0, 1].includes(result.status)) throw new Error('Cannot read publication.denylistFile.');
    file = result.stdout.trim();
  }
  if (file) {
    file = file.replace(/^~(?=[\\/]|$)/, homedir()).replace(/%([^%]+)%/g, (_, name) => {
      if (!process.env[name]) throw new Error('A denylist path environment variable is unset.');
      return process.env[name];
    });
    source += '\n' + readFileSync(file, 'utf8');
  }
  const terms = source.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim().toLowerCase())
    .filter(s => s && !s.startsWith('#'));
  if (!terms.length) throw new Error('Set PUBLIC_REPO_DENYLIST, PUBLIC_REPO_DENYLIST_FILE, or git config publication.denylistFile to a non-empty private denylist.');
  const containsTerm = text => terms.some(term => text.toLowerCase().replaceAll('\0', '').includes(term));
  let hits = 0;
  for (const entry of git(['ls-files', '--stage', '--full-name', '-z']).split('\0').filter(Boolean)) {
    const match = /^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(entry);
    if (!match || match[3] !== '0') throw new Error('Resolve index conflicts before committing.');
    const [, mode, oid, , path] = match;
    if (containsTerm(path) || (mode !== '160000' && containsTerm(git(['cat-file', 'blob', oid])))) {
      hits++;
      // Report paths only, never repeat the private term or matching content.
      if (hits <= 20) console.error(`Publication scan: denied content or path in ${JSON.stringify(path)}`);
    }
  }
  if (hits) throw new Error(`Publication scan blocked: ${hits} indexed file(s) matched the private denylist.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
