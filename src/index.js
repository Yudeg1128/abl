#!/usr/bin/env node

'use strict';

const { program } = require('commander');
const { version } = require('../package.json');

const runCommand     = require('./commands/run');
const phaseCommand   = require('./commands/phase');
const initCommand    = require('./commands/init');
const costsCommand   = require('./commands/costs');

program
  .name('abl')
  .description('Autonomous Build Loop — a phase-based AI development framework')
  .version(version);

program
  .command('init')
  .description('Initialize a new ABL project in the current directory')
  .action(initCommand);

program
  .command('run')
  .description('Run the next pending phase, or resume an interrupted one')
  .option('-b, --builder-model <model>',  'Override builder model')
  .option('-v, --verifier-model <model>', 'Override verifier model')
  .option('--cwd <path>', 'Run as if from this directory')
  .option('-i, --interactive', 'Run Gemini CLI in interactive mode')
  .action(runCommand);

program
  .command('phase <n>')
  .description('Run a specific phase by number')
  .option('-b, --builder-model <model>',  'Override builder model')
  .option('-v, --verifier-model <model>', 'Override verifier model')
  .option('--cwd <path>', 'Run as if from this directory')
  .option('-i, --interactive', 'Run Gemini CLI in interactive mode')
  .action(phaseCommand);

program
  .command('costs')
  .description('Show cumulative token usage summary')
  .option('--cwd <path>', 'Run as if from this directory')
  .action(costsCommand);

program.parse(process.argv);