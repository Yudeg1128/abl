'use strict';

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_FILE = 'abl.config.yaml';
const ABL_DIR     = '.abl';

const DEFAULTS = {
  models: {
    builder:  'gemini-2.5-pro',
    verifier: 'gemini-2.5-flash',
  },
  loop: {
    max_health_attempts:      10,
    max_verifier_iterations:  5,
  },
  dev_server: {
    port:          3000,
    ready_endpoint: '/api/health',
    timeout_ms:    15000,
  },
};

/**
 * Walk up from startDir looking for .abl/
 * Returns the project root path or null.
 */
function findProjectRoot(startDir) {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, ABL_DIR, CONFIG_FILE))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Load, validate, and merge config with defaults.
 */
function loadConfig(cwd) {
  const root = findProjectRoot(cwd || process.cwd());
  if (!root) {
    throw new Error(
      `No ABL project found. Run ${chalk_safe('abl init')} to set up a project.`
    );
  }

  const configPath = path.join(root, ABL_DIR, CONFIG_FILE);
  const raw = yaml.load(fs.readFileSync(configPath, 'utf8'));

  validate(raw, configPath);

  const config = mergeDefaults(raw);

  // Resolve all paths to absolute
  config.resolved = {
    root,
    ablDir:    path.join(root, ABL_DIR),
    srcDir:    path.resolve(root, config.directories.src),
    testsDir:  path.resolve(root, config.directories.tests  || path.join(ABL_DIR, 'tests')),
    specsDir:  path.resolve(root, config.directories.specs  || path.join(ABL_DIR, 'specs')),
    logsDir:   path.join(root, 'logs'),
    tokensCsv: path.join(root, 'logs', 'tokens.csv'),
  };

  return config;
}

function validate(raw, configPath) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid config at ${configPath}`);
  }
  if (!raw.directories || !raw.directories.src) {
    throw new Error(`config.directories.src is required in ${configPath}`);
  }
  if (!raw.commands || !raw.commands.health_check) {
    throw new Error(`config.commands.health_check is required in ${configPath}`);
  }
  if (!raw.commands.start_dev) {
    throw new Error(`config.commands.start_dev is required in ${configPath}`);
  }
}

function mergeDefaults(raw) {
  return {
    directories: raw.directories,
    commands:    raw.commands,
    models: {
      ...DEFAULTS.models,
      ...(raw.models || {}),
    },
    loop: {
      ...DEFAULTS.loop,
      ...(raw.loop || {}),
    },
    dev_server: {
      ...DEFAULTS.dev_server,
      ...(raw.dev_server || {}),
    },
  };
}

// Safe reference for error message without circular dep on chalk
function chalk_safe(str) {
  return `\`${str}\``;
}

module.exports = { loadConfig, findProjectRoot };