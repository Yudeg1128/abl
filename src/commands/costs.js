'use strict';

const { loadConfig } = require('../lib/config');
const { printCosts } = require('../lib/tokens');
const chalk          = require('chalk');

function costsCommand(opts) {
  let config;
  try {
    config = loadConfig(opts.cwd);
  } catch (e) {
    console.error(chalk.red(`Error: ${e.message}`));
    process.exit(1);
  }

  printCosts(config);
}

module.exports = costsCommand;