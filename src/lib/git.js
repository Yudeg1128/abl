'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function ensureRepo(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) {
    execSync('git init --quiet', { cwd: dir });
    try {
      execSync('git config user.name "ABL"', { cwd: dir });
      execSync('git config user.email "abl@local"', { cwd: dir });
    } catch (e) {}
  }
}

function commit(dir, message, allowEmpty = false) {
  try {
    execSync('git add -A', { cwd: dir, stdio: 'pipe' });
    const diff = execSync('git diff --cached --name-only', { cwd: dir, encoding: 'utf8' });
    if (!diff.trim() && !allowEmpty) return;
    execSync(`git commit -m "${message}" ${allowEmpty ? '--allow-empty' : ''} --quiet`, { cwd: dir });
  } catch (e) {}
}

module.exports = {
  commitSrc: (config, phase, step, suffix) => commit(config.resolved.srcDir, `phase${phase}/build/step-${step}/${suffix}`),
  commitTests: (config, phase, step) => commit(config.resolved.testsDir, `phase${phase}/verify/step-${step}/results`),
  commitPass: (config, phase) => commit(config.resolved.srcDir, `phase${phase}/passed`, true),
  ensureRepo
};