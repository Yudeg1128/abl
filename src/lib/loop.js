'use strict';

const log = require('./logger');
const git = require('./git');
const executor = require('./executor');
const tokens = require('./tokens');
const state = require('./state');
const fs = require('fs');
const path = require('path');

async function runPhase(config, phase, opts = {}) {
  const maxVi = config.loop.max_verifier_iterations;
  const bModel = opts.builderModel || config.models.builder;
  const vModel = opts.verifierModel || config.models.verifier;

  let s = state.read(config);
  if (!s.current || s.current.phase !== phase) {
    state.startPhase(config, phase);
    s = state.read(config);
  }

  git.ensureRepo(config.resolved.srcDir);
  git.ensureRepo(config.resolved.testsDir);

  for (let vi = s.current.verifier_iteration; vi <= maxVi; vi++) {
    log.phase(vi, maxVi);
    s = state.read(config); // Refresh state each iteration

    // --- BUILDER TURN ---
    if (!s.current.builder_success) {
      state.updateProgress(config, { verifierIteration: vi, status: state.STATUS.BUILDING });
      log.info('Builder running...');
      try {
        const bLog = await executor.runBuilder(config, phase, { iteration: vi, model: bModel });
        tokens.extractTokens(config, bLog, 'builder', phase, vi);
        git.commitSrc(config, phase, vi, 'build');
        state.updateProgress(config, { builder_success: true });
        log.success('Builder turn complete');
      } catch (e) {
        log.fail(`Builder crashed: ${e.message}`);
        state.updateProgress(config, { status: state.STATUS.STUCK });
        return;
      }
    } else {
      log.info('Builder step already completed. Skipping...');
    }

    // --- VERIFIER TURN ---
    let vLogPath = path.join(config.resolved.logsDir, 'verifier.log');
    if (!s.current.verifier_success) {
      state.updateProgress(config, { status: state.STATUS.VERIFYING });
      log.info('Verifier running...');
      try {
        const vLog = await executor.runVerifier(config, phase, { iteration: vi, model: vModel });
        tokens.extractTokens(config, vLog, 'verifier', phase, vi);
        git.commitTests(config, phase, vi);
        state.updateProgress(config, { verifier_success: true });
        log.success('Verifier turn complete');
      } catch (e) {
        log.fail(`Verifier crashed: ${e.message}`);
        state.updateProgress(config, { status: state.STATUS.STUCK });
        return;
      }
    } else {
      log.info('Verifier step already completed. Skipping...');
    }

    // --- EVALUATE ITERATION ---
    const vContent = fs.readFileSync(vLogPath, 'utf8');
    const vParsed = tokens.findStatsJson(vContent);
    const verifierTaskSuccess = vParsed && vParsed.stats && !vContent.includes('Error executing tool');
    
    const failPath = path.join(config.resolved.testsDir, 'failed_specs.md');
    const hasContractFailures = fs.existsSync(failPath) && fs.readFileSync(failPath, 'utf8').trim().includes('SPEC:');

    if (verifierTaskSuccess && !hasContractFailures) {
      git.commitPass(config, phase);
      state.completePhase(config, phase);
      log.passed(phase);
      return;
    }

    if (!verifierTaskSuccess) {
      log.fail('Verifier iteration failed to execute correctly. Check logs.');
      state.updateProgress(config, { status: state.STATUS.STUCK });
      return;
    }

    // Prepare for next iteration
    log.contractsFailed(config.resolved.testsDir);
    state.updateProgress(config, { 
      status: state.STATUS.CONTRACTS_FAILED,
      builder_success: false, 
      verifier_success: false,
      verifierIteration: vi + 1
    });
  }

  log.stuck('Max iterations reached.', 'Refine your specs.');
  state.updateProgress(config, { status: state.STATUS.STUCK });
}

module.exports = { runPhase };