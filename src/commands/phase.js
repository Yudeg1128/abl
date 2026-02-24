'use strict';

const chalk          = require('chalk');
const { loadConfig } = require('../lib/config');
const { runPhase }   = require('../lib/loop');
const state          = require('../lib/state');

async function phaseCommand(n, opts) {
  const phase = parseInt(n);
  if (isNaN(phase) || phase < 1) {
    console.error(chalk.red('Error: phase must be a positive integer'));
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(opts.cwd);
  } catch (e) {
    console.error(chalk.red(`Error: ${e.message}`));
    process.exit(1);
  }

  // Sync state with git
  let s = state.read(config);
  s = state.syncWithGit(config, s);
  state.write(config, s);

  // Warn if a different phase is in progress
  if (s.current && s.current.phase !== phase &&
      s.current.status !== state.STATUS.COMPLETED &&
      s.current.status !== state.STATUS.STUCK) {
    console.log('');
    console.log(chalk.yellow(`! Phase ${s.current.phase} is currently in progress (${s.current.status}).`));
    console.log(chalk.dim(`  Forcing phase ${phase}. State for phase ${s.current.phase} will be preserved.`));
  }

  // Warn if phase already completed
  if (s.phases_completed.includes(phase)) {
    console.log('');
    console.log(chalk.yellow(`! Phase ${phase} is already marked complete. Re-running.`));
    state.resetPhase(config, phase);
  }

  if (opts.builderModel)  config.models.builder  = opts.builderModel;
  if (opts.verifierModel) config.models.verifier = opts.verifierModel;

  try {
    await runPhase(config, phase, {
      builderModel:  config.models.builder,
      verifierModel: config.models.verifier,
    });
  } catch (e) {
    console.error(chalk.red(`\nFatal: ${e.message}`));
    if (process.env.ABL_DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

module.exports = phaseCommand;