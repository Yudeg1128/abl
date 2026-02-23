'use strict';

const { execSync, spawnSync } = require('child_process');
const fs                      = require('fs');
const path                    = require('path');
const os                      = require('os');

const BUILDER_IMAGE  = 'abl-builder';
const VERIFIER_IMAGE = 'abl-verifier';

/**
 * Ensure Docker is available on the host.
 */
function checkDocker() {
  try {
    execSync('docker info', { stdio: 'pipe' });
  } catch {
    throw new Error('Docker is not running. Please start Docker and try again.');
  }
}

/**
 * Build the builder and verifier Docker images if not already built.
 * Images are built from inline Dockerfiles embedded here —
 * no external Dockerfile required in user project.
 */
function ensureImages(config) {
  const ablDir = config.resolved.ablDir;

  // Write Dockerfiles to .abl/ if not present
  const builderDockerfile = path.join(ablDir, 'Dockerfile.builder');
  const verifierDockerfile = path.join(ablDir, 'Dockerfile.verifier');

  if (!fs.existsSync(builderDockerfile)) {
    fs.writeFileSync(builderDockerfile, buildDockerfileContent());
  }
  if (!fs.existsSync(verifierDockerfile)) {
    fs.writeFileSync(verifierDockerfile, verifyDockerfileContent());
  }

  // Build images only if they don't exist
  const images = execSync('docker images --format "{{.Repository}}"', { encoding: 'utf8' });
  if (!images.includes(BUILDER_IMAGE)) {
    execSync(`docker build -f "${builderDockerfile}" -t ${BUILDER_IMAGE} "${ablDir}"`, { stdio: 'inherit' });
  }
  if (!images.includes(VERIFIER_IMAGE)) {
    execSync(`docker build -f "${verifierDockerfile}" -t ${VERIFIER_IMAGE} "${ablDir}"`, { stdio: 'inherit' });
  }
}

/**
 * Run the Builder container.
 * Mounts: src (rw), specs (ro), .abl (ro), logs (rw)
 * Gemini credentials mounted from host ~/.gemini
 */
function runBuilder(config, prompt, phase, opts = {}) {
  const { resolved } = config;
  const apiKey = readApiKey(resolved.root);
  const model  = opts.model || config.models.builder;
  const leanConfig = path.join(resolved.ablDir, 'lean_settings.json');

  const mounts = [
    `-v "${resolved.srcDir}:/workspace/src"`,
    `-v "${resolved.specsDir}:/workspace/specs:ro"`,
    `-v "${resolved.ablDir}:/workspace/.abl:ro"`,
    `-v "${resolved.logsDir}:/workspace/logs"`,
    `-v "${os.homedir()}/.gemini:/root/.gemini:ro"`,
  ].join(' ');

  const envVars = [
    `-e GEMINI_API_KEY="${apiKey}"`,
    `-e GEMINI_CLI_SYSTEM_SETTINGS_PATH=/workspace/.abl/lean_settings.json`,
  ].join(' ');

  const includeArgs = [
    '/workspace/src',
    '/workspace/specs',
    '/workspace/.abl',
  ].join(',');

  const logPath = path.join(resolved.logsDir, 'builder.log');

  const cmd = [
    'docker run --rm',
    mounts,
    envVars,
    BUILDER_IMAGE,
    'gemini',
    `-m ${model}`,
    `--include-directories ${includeArgs}`,
    '-y --output-format json',
    `-p "${escapePrompt(prompt)}"`,
  ].join(' ');

  return runWithLog(cmd, logPath, prompt, config);
}

/**
 * Run the Verifier container.
 * Mounts: tests (rw), specs (ro), .abl (ro), logs (rw)
 * --network host so it can reach dev server on localhost
 */
function runVerifier(config, prompt, phase, opts = {}) {
  const { resolved } = config;
  const apiKey = readApiKey(resolved.root);
  const model  = opts.model || config.models.verifier;

  const mounts = [
    `-v "${resolved.testsDir}:/workspace/tests"`,
    `-v "${resolved.specsDir}:/workspace/specs:ro"`,
    `-v "${resolved.ablDir}:/workspace/.abl:ro"`,
    `-v "${resolved.logsDir}:/workspace/logs"`,
    `-v "${os.homedir()}/.gemini:/root/.gemini:ro"`,
  ].join(' ');

  const envVars = [
    `-e GEMINI_API_KEY="${apiKey}"`,
    `-e GEMINI_CLI_SYSTEM_SETTINGS_PATH=/workspace/.abl/lean_settings.json`,
  ].join(' ');

  const includeArgs = [
    '/workspace/tests',
    '/workspace/specs',
    '/workspace/.abl',
  ].join(',');

  // --network host: container shares host network, can reach localhost:3000
  const networkFlag = process.platform === 'linux'
    ? '--network host'
    : '--add-host=host.docker.internal:host-gateway';

  const logPath = path.join(resolved.logsDir, 'verifier.log');

  const cmd = [
    'docker run --rm',
    networkFlag,
    mounts,
    envVars,
    VERIFIER_IMAGE,
    'gemini',
    `-m ${model}`,
    `--include-directories ${includeArgs}`,
    '-y --output-format json',
    `-p "${escapePrompt(prompt)}"`,
  ].join(' ');

  return runWithLog(cmd, logPath, prompt, config);
}

/**
 * Pipe context files into docker container via stdin and run Gemini.
 * Returns the log path for token extraction.
 */
function runWithLog(cmd, logPath, contextFiles, config) {
  // Build the piped context
  const contextParts = contextFiles
    .filter(f => fs.existsSync(f))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n\n');

  // Write context to a temp file, mount it, pipe it in
  const tmpContext = path.join(config.resolved.logsDir, '_context.txt');
  fs.writeFileSync(tmpContext, contextParts);

  // Prepend context via stdin redirect in the docker command
  const fullCmd = `cat "${tmpContext}" | ${cmd}`;

  try {
    const result = execSync(fullCmd, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });
    fs.writeFileSync(logPath, result);
  } catch (e) {
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
    fs.writeFileSync(logPath, output);
  }

  return logPath;
}

function readApiKey(root) {
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('GEMINI_API_KEY=')) {
        return line.split('=')[1].trim();
      }
    }
  }
  return process.env.GEMINI_API_KEY || '';
}

function escapePrompt(str) {
  return str.replace(/"/g, '\\"');
}

function buildDockerfileContent() {
  return `FROM node:20-slim
RUN npm install -g @google/generative-ai-cli 2>/dev/null || true
WORKDIR /workspace/src
`;
}

function verifyDockerfileContent() {
  return `FROM node:20-slim
RUN npm install -g @google/generative-ai-cli 2>/dev/null || true
WORKDIR /workspace/tests
`;
}

module.exports = { checkDocker, ensureImages, runBuilder, runVerifier };