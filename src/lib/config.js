'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const DEFAULTS = {
  models: { builder: 'gemini-2.0-flash', verifier: 'gemini-2.0-flash' },
  loop: { max_verifier_iterations: 5 }
};

function loadConfig(cwd = process.cwd()) {
  const ablDir = path.join(cwd, '.abl');
  const configFile = path.join(ablDir, 'abl.config.yaml');
  if (!fs.existsSync(configFile)) throw new Error('No ABL project found. Run "abl init".');
  
  const raw = yaml.load(fs.readFileSync(configFile, 'utf8')) || {};
  const dirs = raw.directories || {};

  return {
    ...DEFAULTS,
    ...raw,
    models: raw.models ? { ...DEFAULTS.models, ...raw.models } : DEFAULTS.models,
    loop: { ...DEFAULTS.loop, ...(raw.loop || {}) },
    resolved: {
      root: cwd,
      ablDir,
      specsDir: path.join(ablDir, 'specs'),
      logsDir: path.join(ablDir, 'logs'),
      promptsDir: path.join(ablDir, 'prompts'),
      tokensCsv: path.join(ablDir, 'logs', 'tokens.csv'),
      projectMap: path.join(ablDir, 'project_map.txt'),
      stateFile: path.join(ablDir, 'state.json'),
      srcDir: path.resolve(cwd, dirs.src || './src'),
      testsDir: path.resolve(cwd, dirs.tests || './tests')
    }
  };
}

function buildCommandContext(config, role) {
  const commands = role === 'builder' ? config.builder_commands : config.verifier_commands;
  const lines = [
    'You have access to "abl-cmd" via the system shell.',
    'Usage: abl-cmd <name> [args]',
    '- abl-cmd get-spec <N> : Returns the content of phaseN.md spec'
  ];
  if (commands) {
    Object.entries(commands).forEach(([name, def]) => {
      lines.push(`- abl-cmd ${name} : ${def.description || name}`);
    });
  }
  return lines.join('\n');
}

module.exports = { loadConfig, buildCommandContext };