'use strict';

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildPipedContext } = require('./context');
const { generateMap } = require('./map');

/**
 * Creates a temporary abl-cmd executable script inside the workspace
 * to facilitate local execution without a proxy server.
 */
function setupAblCmd(config, role, workspace) {
  const commands = role === 'builder' ? config.builder_commands : config.verifier_commands;
  const specsDir = config.resolved.specsDir;

  let scriptContent = `#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (cmd === 'get-spec') {
  const phase = args[0];
  const p = path.join('${specsDir.replace(/\\/g, '\\\\')}', \`phase\${phase}.md\`);
  if (fs.existsSync(p)) {
    console.log(fs.readFileSync(p, 'utf8'));
    process.exit(0);
  } else {
    console.error('Spec not found');
    process.exit(1);
  }
}

const commands = ${JSON.stringify(commands || {})};
if (commands[cmd]) {
  try {
    const out = execSync(commands[cmd].command, { stdio: 'inherit', encoding: 'utf8' });
    process.exit(0);
  } catch (e) {
    process.exit(1);
  }
}

console.error('Unknown command: ' + cmd);
process.exit(1);
`;

  const binDir = path.join(workspace, '.abl_bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  
  const cmdPath = path.join(binDir, 'abl-cmd');
  fs.writeFileSync(cmdPath, scriptContent, { mode: 0o755 });
  return binDir;
}

async function runRole(role, config, phase, opts) {
  const workspace = role === 'builder' ? config.resolved.srcDir : config.resolved.testsDir;
  const iteration = opts.iteration || 1;
  const logPath = path.join(config.resolved.logsDir, `${role}.log`);

  // 1. Refresh Metadata
  generateMap(config);

  // 2. Prepare Context
  const fullPrompt = buildPipedContext(config, role, phase, iteration);
  
  // 3. Setup local abl-cmd
  const binDir = setupAblCmd(config, role, workspace);

  // 4. Execute Gemini CLI
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(config.resolved.ablDir, 'lean_settings.json'),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
  };

  const model = opts.model || (role === 'builder' ? config.models.builder : config.models.verifier);
  const args = [
    '-m', model,
    '-y', // Auto-confirm tool usage
    '--output-format', 'json',
    '-p', fullPrompt,
  ];

  const result = spawnSync('gemini', args, {
    cwd: workspace,
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024 // 10MB
  });

  fs.writeFileSync(logPath, result.stdout + result.stderr);

  if (result.status !== 0) {
    throw new Error(`${role} failed with exit code ${result.status}. See logs.`);
  }

  return logPath;
}

module.exports = {
  runBuilder: (config, phase, opts) => runRole('builder', config, phase, opts),
  runVerifier: (config, phase, opts) => runRole('verifier', config, phase, opts)
};