'use strict';

const chalk        = require('chalk');
const { loadConfig }        = require('../lib/config');
const { runPhase }          = require('../lib/loop');
const state                 = require('../lib/state');

async function runCommand(opts) {
  if (process.env.ABL_DEBUG) console.log(chalk.dim('DEBUG: runCommand started.'));
  let config;
  try {
    config = loadConfig(opts.cwd);
    if (process.env.ABL_DEBUG) console.log(chalk.dim(`DEBUG: Config loaded from ${config.resolved.root}`));
  } catch (e) {
    console.error(chalk.red(`Error: ${e.message}`));
    process.exit(1);
  }

  // Sync state with git before deciding what to do
  let s = state.read(config);
  if (process.env.ABL_DEBUG) console.log(chalk.dim('DEBUG: Current state read.'));
  s = state.syncWithGit(config, s);
  if (process.env.ABL_DEBUG) console.log(chalk.dim('DEBUG: State synced with git.'));
  state.write(config, s);

  // Resolve what to do next
  const next = state.resolveNextAction(config, s);
  if (process.env.ABL_DEBUG) console.log(chalk.dim(`DEBUG: Next action resolved: ${JSON.stringify(next)}`));

  if (next.action === 'done') {
    if (next.reason === 'no_specs') {
      console.log('');
      console.log(chalk.yellow('! No spec files found.'));
      console.log(chalk.dim(`  Add your first spec to ${config.resolved.specsDir}/phase1.md`));
      console.log('');
    } else {
      console.log('');
      console.log(chalk.green('━'.repeat(57)));
      console.log(chalk.green('✓  All phases complete. Nothing to do.'));
      console.log(chalk.dim(`   Completed: phases ${s.phases_completed.join(', ')}`));
      console.log(chalk.green('━'.repeat(57)));
      console.log('');
    }
    return;
  }

  const { phase } = next;

  if (next.action === 'resume') {
    console.log('');
    console.log(chalk.yellow(`↺  Resuming phase ${phase} (${next.status})...`));
  } else {
    console.log('');
    console.log(chalk.bold(`▶  Running phase ${phase}...`));
  }

  // Apply model overrides
  if (opts.builderModel)  config.models.builder  = opts.builderModel;
  if (opts.verifierModel) config.models.verifier = opts.verifierModel;

  try {
    await runPhase(config, phase, {
      builderModel:  config.models.builder,
      verifierModel: config.models.verifier,
      interactive:   opts.interactive,
    });
  } catch (e) {
    console.error(chalk.red(`\nFatal: ${e.message}`));
    if (process.env.ABL_DEBUG) console.error(e.stack);
    process.exit(1);
  }

  // Phase completed — check if more phases to run
  const updated  = state.syncWithGit(config, state.read(config));
  const nextNext = state.resolveNextAction(config, updated);

  if (nextNext.action === 'run') {
    console.log('');
    console.log(chalk.dim(`  Phase ${phase} done. Run ${chalk.bold('abl run')} again to continue with phase ${nextNext.phase}.`));
    console.log('');
  } else if (nextNext.action === 'done' && nextNext.reason === 'all_complete') {
    console.log('');
    console.log(chalk.green('━'.repeat(57)));
    console.log(chalk.green('✓  All phases complete.'));
    console.log(chalk.green('━'.repeat(57)));
    console.log('');
  }
}

module.exports = runCommand;