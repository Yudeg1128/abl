'use strict';

const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');

function ensureRepo(dir) {
  const gitDir = path.join(dir, '.git');
  if (!fs.existsSync(gitDir)) {
    execSync('git init --quiet', { cwd: dir });
  }
}

function commit(dir, message) {
  try {
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });
    // Only commit if there are staged changes
    const diff = execSync('git diff --cached --name-only', {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (diff.trim()) {
      execSync(`git commit -m "${message}" --quiet`, { cwd: dir, stdio: 'pipe' });
    }
  } catch (e) {
    // Non-fatal — git commit failure should not abort the loop
    // Could happen on first commit with no user.email configured
  }
}

function commitSrc(config, phase, step, suffix) {
  const { resolved } = config;
  ensureRepo(resolved.srcDir);
  commit(resolved.srcDir, `phase${phase}/build/step-${step}/${suffix}`);
}

function commitTests(config, phase, step) {
  const { resolved } = config;
  ensureRepo(resolved.testsDir);
  commit(resolved.testsDir, `phase${phase}/verify/step-${step}/results`);
}

module.exports = { ensureRepo, commitSrc, commitTests };