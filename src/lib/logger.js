'use strict';

const chalk = require('chalk');

const DIVIDER     = '━'.repeat(57);
const DIVIDER_SML = '─'.repeat(57);

module.exports = {
  phase(n, total) {
    console.log('');
    console.log(chalk.bold(`━━━ Verifier iteration ${n} / ${total} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`));
  },

  attempt(hi, maxH) {
    console.log(`  ${chalk.dim('──')} Build / health attempt ${hi} / ${maxH}`);
  },

  info(msg) {
    console.log(`  ${chalk.cyan('⚙')}  ${msg}`);
  },

  success(msg) {
    console.log(`  ${chalk.green('✓')}  ${msg}`);
  },

  fail(msg) {
    console.log(`  ${chalk.red('✗')}  ${msg}`);
  },

  warn(msg) {
    console.log(`  ${chalk.yellow('!')}  ${msg}`);
  },

  resume(items) {
    console.log('');
    console.log(chalk.yellow('↺  Resuming from prior state...'));
    for (const item of items) {
      console.log(`   ${chalk.dim('→')} ${item}`);
    }
  },

  stuck(reason, hint) {
    console.log('');
    console.log(chalk.red(DIVIDER));
    console.log(chalk.red(`✗  STUCK — ${reason}`));
    console.log(chalk.dim(`    → ${hint}`));
    console.log(chalk.red(DIVIDER));
  },

  passed(phase) {
    console.log('');
    console.log(chalk.green(DIVIDER));
    console.log(chalk.green(`✓  Phase ${phase} passed`));
    console.log(chalk.green(DIVIDER));
  },

  contractsFailed(testsDir) {
    console.log(`  ${chalk.red('✗')}  Contracts failed — see ${testsDir}/failed_specs.md`);
  },

  divider() {
    console.log(chalk.dim(DIVIDER_SML));
  },

  blank() {
    console.log('');
  }
};