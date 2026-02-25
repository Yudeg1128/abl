'use strict';

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { buildPipedContext } = require('./context');
const { generateMap } = require('./map');
const os = require('os');
const chalk = require('chalk');

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

  const binDir = path.join(os.tmpdir(), `abl_bin_${role}_${Date.now()}`);
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
  
  const cmdPath = path.join(binDir, 'abl-cmd');
  fs.writeFileSync(cmdPath, scriptContent, { mode: 0o755 });
  return binDir;
}

async function runRole(role, config, phase, opts) {
  const workspace = role === 'builder' ? config.resolved.srcDir : config.resolved.testsDir;
  const iteration = opts.iteration || 1;
  const logPath = path.join(config.resolved.logsDir, `${role}.log`);
  const isInteractive = !!opts.interactive;
  const verifierSystemPrompt = path.join(config.resolved.promptsDir, 'verifier_system.md');

  generateMap(config);
  const fullPrompt = buildPipedContext(config, role, phase, iteration);
  const binDir = setupAblCmd(config, role, workspace);

  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(config.resolved.ablDir, 'lean_settings.json'),
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ...(role === 'verifier' && fs.existsSync(verifierSystemPrompt) ? { GEMINI_SYSTEM_MD: verifierSystemPrompt } : {})
  };

  const model = opts.model || (role === 'builder' ? config.models.builder : config.models.verifier);
  
  const args = [
    '-m', model,
    '-y',
    '--output-format', 'json'
  ];

  if (isInteractive) {
    args.push('-i', fullPrompt);
    console.log(chalk.blue(`\n[Entering Interactive Mode for ${role}]`));
    console.log(chalk.dim(`Type '/quit' to finish the ${role} turn and continue the loop.\n`));
    
    // In interactive mode, we must use 'inherit' to allow user input/output
    spawnSync('gemini', args, {
      cwd: workspace,
      env,
      stdio: 'inherit'
    });

    return logPath; // Log will be empty in this mode
  } else {
    args.push('-p', fullPrompt);
    const result = spawnSync('gemini', args, {
      cwd: workspace,
      env,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });

    const output = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(logPath, output);

    if (result.status !== 0) {
      throw new Error(`${role} failed with exit code ${result.status}. See logs.`);
    }

    return logPath;
  }
}

module.exports = {
  runBuilder: (config, phase, opts) => runRole('builder', config, phase, opts),
  runVerifier: (config, phase, opts) => runRole('verifier', config, phase, opts)
};