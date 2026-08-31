import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateRepository, prohibitedPathReason } = require('../scripts/git-harness.cjs');

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-git-harness-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Git Harness Test']);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'base\n');
  git(root, ['add', 'tracked.txt']);
  git(root, ['commit', '-m', 'initial']);
  return root;
}

test('dirty 저장소와 부분 커밋을 차단한다', () => {
  const root = makeRepository();
  fs.appendFileSync(path.join(root, 'tracked.txt'), 'dirty\n');
  assert.equal(evaluateRepository({ root, mode: 'manual' }).ok, false);
  fs.writeFileSync(path.join(root, 'staged.txt'), 'staged\n');
  git(root, ['add', 'staged.txt']);
  const report = evaluateRepository({ root, mode: 'pre-commit' });
  assert.ok(report.errors.some(item => item.code === 'partial_commit_unstaged'));
});

test('운영 브랜치 직접 커밋과 과도한 worktree를 차단한다', () => {
  const root = makeRepository();
  git(root, ['branch', '-M', 'release/prod-maintenance-test']);
  fs.writeFileSync(path.join(root, 'release.txt'), 'blocked\n');
  git(root, ['add', 'release.txt']);
  const protectedReport = evaluateRepository({ root, mode: 'pre-commit' });
  assert.ok(protectedReport.errors.some(item => item.code === 'protected_branch_commit'));
  git(root, ['reset']);
  fs.unlinkSync(path.join(root, 'release.txt'));
  const second = `${root}-second`;
  git(root, ['worktree', 'add', '--detach', second]);
  const countReport = evaluateRepository({ root, mode: 'manual', maxWorktrees: 1 });
  assert.ok(countReport.errors.some(item => item.code === 'worktree_limit_exceeded'));
  git(root, ['worktree', 'remove', second]);
});

test('비밀·로컬 평가 경로를 거부한다', () => {
  assert.equal(prohibitedPathReason('.env.production'), 'environment_secret');
  assert.equal(prohibitedPathReason('samples/user-original.txt'), 'raw_evaluation_data');
  assert.equal(prohibitedPathReason('secret/private.pem'), 'private_key_file');
});
