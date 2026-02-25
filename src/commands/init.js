'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const chalk = require('chalk');
const { execSync } = require('child_process');

const PACKAGE_ROOT = path.join(__dirname, '..', '..');
const TEMPLATE_DIR = path.join(PACKAGE_ROOT, '.abl');

async function initCommand() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(res => rl.question(q, res));
  
  console.log(chalk.bold('\nABL Initialize'));
  const src = await ask('Source directory name? (default: src): ') || 'src';
  const tests = await ask('Tests directory name? (default: tests): ') || 'tests';
  rl.close();

  const cwd = process.cwd();
  const ablDir = path.join(cwd, '.abl');
  const promptsDir = path.join(ablDir, 'prompts'); // Inside .abl

  // 1. Create Directory Structure
  [
    ablDir, 
    path.join(ablDir, 'specs'), 
    path.join(ablDir, 'logs'), 
    promptsDir,
    path.join(cwd, src), 
    path.join(cwd, tests)
  ].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // 2. Copy Configuration Templates
  const copyTemplate = (file, dest = file) => {
    const s = path.join(TEMPLATE_DIR, file);
    if (fs.existsSync(s)) {
      let c = fs.readFileSync(s, 'utf8');
      if (file === 'abl.config.yaml') {
        c = c.replace(/src: .*/, `src: ./${src}`).replace(/tests: .*/, `tests: ./${tests}`);
      }
      fs.writeFileSync(path.join(ablDir, dest), c);
    }
  };
  ['abl.config.yaml', 'lean_settings.json', 'geminiignore.txt'].forEach(f => copyTemplate(f));

  // 3. Copy Role Prompts into .abl/prompts
  ['builder.md', 'verifier.md', 'verifier_system.md'].forEach(f => {
    const srcPrompt = path.join(PACKAGE_ROOT, 'prompts', f);
    const destPrompt = path.join(promptsDir, f);
    if (fs.existsSync(srcPrompt)) {
      fs.writeFileSync(destPrompt, fs.readFileSync(srcPrompt, 'utf8'));
    }
  });

  // 4. Initialize Base Files
  fs.writeFileSync(path.join(ablDir, 'project.md'), '# Project Name\n');
  fs.writeFileSync(path.join(ablDir, 'state.json'), JSON.stringify({ 
    phases_completed: [], 
    current: null, 
    phase_titles: {} 
  }, null, 2));
  fs.writeFileSync(path.join(ablDir, 'specs', 'phase1.md'), '# Phase 1: Setup\n\n### Contracts\n- Action -> Result\n');

  // 5. Initialize Git Repositories
  [src, tests].forEach(dirName => {
    const dirPath = path.join(cwd, dirName);
    try {
      execSync('git init --quiet', { cwd: dirPath });
      execSync('git config user.name "ABL"', { cwd: dirPath });
      execSync('git config user.email "abl@local"', { cwd: dirPath });
      execSync('git add -A', { cwd: dirPath });
      execSync('git commit -m "Initial commit" --allow-empty --quiet', { cwd: dirPath });
    } catch (e) {}
  });

  console.log(chalk.green('\n✓ ABL Initialized.'));
  console.log('\n  Available Commands:');
  console.log(chalk.dim('  abl run         Run or resume pending phase'));
  console.log(chalk.dim('  abl phase <N>   Run specific phase'));
  console.log(chalk.dim('  abl costs       Show token usage\n'));
}

module.exports = initCommand;