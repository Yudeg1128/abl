'use strict';

const fs      = require('fs');
const path    = require('path');
const log     = require('./logger');
const git     = require('./git');
const health  = require('./health');
const docker  = require('./docker');
const tokens  = require('./tokens');
const context = require('./context');

/**
 * Detect prior state and return resume mode.
 */
function detectResumeMode(config) {
  const { resolved } = config;
  const healthLog    = path.join(resolved.logsDir, 'health.log');
  const failedSpecs  = path.join(resolved.testsDir, 'failed_specs.md');

  const hasHealth  = fs.existsSync(healthLog);
  const hasFailed  = fs.existsSync(failedSpecs) &&
                     fs.readFileSync(failedSpecs, 'utf8').includes('SPEC:');

  return { hasHealth, hasFailed };
}

/**
 * Assemble context files for Builder.
 */
function builderContextFiles(config, phase, withFailures = false) {
  const { resolved } = config;
  const files = [
    path.join(resolved.root, 'prompts', 'builder.md'),
    path.join(resolved.ablDir, 'project.md'),
    path.join(resolved.ablDir, 'project_map.txt'),
    path.join(resolved.specsDir, 'index.md'),
  ];
  if (withFailures) {
    const failedSpecs = path.join(resolved.testsDir, 'failed_specs.md');
    const healthLog   = path.join(resolved.logsDir, 'health.log');
    if (fs.existsSync(failedSpecs)) files.push(failedSpecs);
    if (fs.existsSync(healthLog))   files.push(healthLog);
  }
  return files;
}

/**
 * Assemble context files for Verifier.
 */
function verifierContextFiles(config, phase) {
  const { resolved } = config;
  const files = [
    path.join(resolved.root, 'prompts', 'verifier.md'),
    path.join(resolved.ablDir, 'project.md'),
    path.join(resolved.ablDir, 'project_map.txt'),
    path.join(resolved.specsDir, 'index.md'),
  ];
  const failedSpecs = path.join(resolved.testsDir, 'failed_specs.md');
  if (fs.existsSync(failedSpecs)) files.push(failedSpecs);
  return files;
}

/**
 * Check if Verifier passed by reading failed_specs.md
 */
function verifierPassed(config) {
  const failedSpecs = path.join(config.resolved.testsDir, 'failed_specs.md');
  if (!fs.existsSync(failedSpecs)) return true;
  return !fs.readFileSync(failedSpecs, 'utf8').includes('SPEC:');
}

/**
 * Main phase loop.
 */
async function runPhase(config, phase, opts = {}) {
  const maxHealth   = config.loop.max_health_attempts;
  const maxVerifier = config.loop.max_verifier_iterations;

  // Initialize repos
  git.ensureRepo(config.resolved.srcDir);
  git.ensureRepo(config.resolved.testsDir);

  // Ensure dirs
  fs.mkdirSync(config.resolved.logsDir,  { recursive: true });
  fs.mkdirSync(config.resolved.specsDir, { recursive: true });
  fs.mkdirSync(config.resolved.testsDir, { recursive: true });
  tokens.ensureTokensCsv(config);

  // Update specs index
  context.updateSpecsIndex(config, phase);

  // Generate project map
  context.generateProjectMap(config);

  // Check and report resume state
  const { hasHealth, hasFailed } = detectResumeMode(config);
  if (hasHealth || hasFailed) {
    const items = [];
    if (hasHealth) items.push('health.log found — Builder will receive health errors');
    if (hasFailed) items.push('failed_specs.md found — Builder will receive contract failures');
    log.resume(items);
  }

  // Ensure Docker images
  docker.checkDocker();
  docker.ensureImages(config);

  // ── Outer Verifier loop ────────────────────────────────────────────────
  for (let vi = 1; vi <= maxVerifier; vi++) {
    log.phase(vi, maxVerifier);

    // Reset DB state before builder starts
    if (config.commands.reset_state) {
      log.info('Resetting DB state...');
      try {
        health.resetState(config);
        log.success('DB ready');
      } catch (e) {
        log.fail(`DB reset failed — ${e.message}`);
        process.exit(1);
      }
    }

    // ── Inner health loop ────────────────────────────────────────────────
    let healthPassed = false;

    for (let hi = 1; hi <= maxHealth; hi++) {
      log.attempt(hi, maxHealth);

      // Determine if this is a clean start
      const { hasHealth: hh, hasFailed: hf } = detectResumeMode(config);
      const isCleanStart = vi === 1 && hi === 1 && !hh && !hf;

      // Run Builder
      log.info('Builder running...');
      const contextFiles = builderContextFiles(config, phase, !isCleanStart);
      const builderLog = docker.runBuilder(
        config,
        `Execute your build instructions for phase ${phase}.`,
        phase,
        { model: opts.builderModel, contextFiles }
      );
      tokens.extractTokens(config, builderLog, 'builder', phase, vi);
      git.commitSrc(config, phase, vi, 'pre-deterministic');
      log.success('Builder done');

      // Health check
      log.info('Health check...');
      const passed = health.runHealthCheck(config);

      if (passed) {
        log.success('Health check passed');
        git.commitSrc(config, phase, vi, 'post-deterministic');
        healthPassed = true;
        break;
      } else {
        log.fail(`Health check failed (attempt ${hi}) — retrying...`);
      }
    }

    if (!healthPassed) {
      log.stuck(
        'Builder could not pass health check after 10 attempts',
        'see logs/health.log'
      );
      process.exit(1);
    }

    // ── Dev server + Verifier ────────────────────────────────────────────
    log.info('Starting dev server...');
    health.startDevServer(config);
    try {
      await health.waitForDevServer(config);
    } catch (e) {
      log.fail(e.message);
      health.stopDevServer(config);
      process.exit(1);
    }
    log.success('Dev server ready');

    // Reset DB state for Verifier
    if (config.commands.reset_state) {
      log.info('Resetting DB state for Verifier...');
      try {
        health.resetState(config);
        log.success('DB ready');
      } catch (e) {
        log.fail(`DB reset failed — ${e.message}`);
        health.stopDevServer(config);
        process.exit(1);
      }
    }

    // Run Verifier
    log.info('Verifier running...');
    const verifierContextFilesArr = verifierContextFiles(config, phase);
    const verifierLog = docker.runVerifier(
      config,
      `Run your test suite for phase ${phase}. Write failed_specs.md on failure, delete it on pass.`,
      phase,
      { model: opts.verifierModel, contextFiles: verifierContextFilesArr }
    );
    tokens.extractTokens(config, verifierLog, 'verifier', phase, vi);
    git.commitTests(config, phase, vi);
    log.success('Verifier done');

    health.stopDevServer(config);
    log.success('Dev server stopped');

    if (verifierPassed(config)) {
      log.passed(phase);
      process.exit(0);
    }

    log.contractsFailed(config.resolved.testsDir);
  }

  // Outer loop exhausted
  log.stuck(
    `Builder could not satisfy contracts after ${maxVerifier} Verifier iterations`,
    `see ${path.join(config.resolved.testsDir, 'failed_specs.md')}`
  );
  process.exit(1);
}

module.exports = { runPhase };