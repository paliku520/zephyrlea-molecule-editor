#!/usr/bin/env node
/**
 * Builds the pure-static web version from the `v0.1.0` tag into `dist-static/`.
 *
 * The current branch ships a desktop app whose renderer has no chemistry engine
 * of its own, so the hosted static site is produced from the tag that still
 * bundles RDKit / OpenChemLib / sci-form as WebAssembly. The tag is checked out
 * into a throwaway git worktree, built with its own dependencies, and the result
 * is copied back here.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_TAG = 'v0.1.0';
const WORKTREE_DIR = '.temp-static';
const OUTPUT_DIR = 'dist-static';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const worktreePath = join(root, WORKTREE_DIR);
const outputPath = join(root, OUTPUT_DIR);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function log(message) {
  console.log(`[static] ${message}`);
}

function fail(message) {
  console.error(`[static] ${message}`);
  process.exit(1);
}

/**
 * Runs a command in `cwd`, inheriting stdio so npm's own output stays visible.
 * A single command string is used on purpose: passing an argument array together
 * with `shell: true` is deprecated (and needs no shell on Windows otherwise,
 * because `npm.cmd` is only executable through one).
 */
function run(command, args, cwd) {
  const line = [command, ...args].join(' ');
  const result = spawnSync(line, { cwd, stdio: 'inherit', shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${line} 失败（退出码 ${result.status}）`);
  }
}

function git(args, options = {}) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', ...options });
}

function removeWorktree() {
  // `--force` matters: the worktree contains node_modules / dist after a build.
  git(['worktree', 'remove', WORKTREE_DIR, '--force']);
  git(['worktree', 'prune']);
  if (existsSync(worktreePath)) rmSync(worktreePath, { recursive: true, force: true });
}

function main() {
  const tag = git(['rev-parse', '--verify', `refs/tags/${STATIC_TAG}`]);
  if (tag.status !== 0) {
    fail(`找不到 tag ${STATIC_TAG}，无法构建纯静态版本。请先 \`git fetch --tags\`。`);
  }

  // A leftover worktree would make `worktree add` fail; drop it and start clean.
  if (existsSync(worktreePath)) {
    log(`清理上次残留的 ${WORKTREE_DIR}/`);
    removeWorktree();
  }
  if (existsSync(outputPath)) {
    log(`清理旧的 ${OUTPUT_DIR}/`);
    rmSync(outputPath, { recursive: true, force: true });
  }

  log(`检出 ${STATIC_TAG} 到 ${WORKTREE_DIR}/`);
  run('git', ['worktree', 'add', '--detach', WORKTREE_DIR, STATIC_TAG], root);

  try {
    // npm ci needs the tag's own lockfile; fall back to install if it is missing.
    const usesCi = existsSync(join(worktreePath, 'package-lock.json'));
    log(usesCi ? '安装依赖（npm ci）…' : '安装依赖（npm install）…');
    run(npm, [usesCi ? 'ci' : 'install', '--no-audit', '--no-fund'], worktreePath);

    log('构建静态站点…');
    run(npm, ['run', 'build'], worktreePath);

    const builtDist = join(worktreePath, 'dist');
    if (!existsSync(builtDist)) fail('构建结束但没找到 dist/，请检查上面的构建日志。');

    log(`复制产物到 ${OUTPUT_DIR}/`);
    cpSync(builtDist, outputPath, { recursive: true });
  } finally {
    // Always drop the worktree, even when npm or the build failed.
    log(`清理 ${WORKTREE_DIR}/`);
    removeWorktree();
  }

  log('纯静态 Web 版本已生成到 dist-static/，可直接部署至 Cloudflare Pages');
}

try {
  main();
} catch (error) {
  removeWorktree();
  fail(error instanceof Error ? error.message : String(error));
}
