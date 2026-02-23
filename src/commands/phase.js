'use strict';

const { loadConfig } = require('../lib/config');
const { runPhase }   = require('../lib/loop');
const chalk          = require('chalk');

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

  // Apply model overrides from CLI flags
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