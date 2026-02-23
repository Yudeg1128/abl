'use strict';

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

/**
 * Generate project_map.txt in .abl/
 * Contains: directory tree of src/ + output of map_deps command
 */
function generateProjectMap(config) {
  const { resolved } = config;
  const outPath = path.join(resolved.ablDir, 'project_map.txt');

  let output = '';

  // Directory tree — use find as fallback if tree not available
  try {
    output += execSync(
      `tree "${resolved.srcDir}" -I "node_modules|.git" --dirsfirst`,
      { encoding: 'utf8' }
    );
  } catch {
    // tree not installed — use find
    output += execSync(
      `find "${resolved.srcDir}" -not -path "*/node_modules/*" -not -path "*/.git/*" | sort`,
      { encoding: 'utf8' }
    );
  }

  output += '\n---\n';

  // Dependency map
  if (config.commands.map_deps) {
    try {
      output += execSync(config.commands.map_deps, {
        cwd: resolved.srcDir,
        encoding: 'utf8',
      });
    } catch (e) {
      output += `(map_deps failed: ${e.message})\n`;
    }
  }

  fs.writeFileSync(outPath, output);
}

/**
 * Append current phase heading to specs/index.md
 * First line of phaseN.md must be: # Phase N: Title
 */
function updateSpecsIndex(config, phase) {
  const { resolved } = config;
  const specsDir  = resolved.specsDir;
  const indexPath = path.join(specsDir, 'index.md');
  const phasePath = path.join(specsDir, `phase${phase}.md`);

  if (!fs.existsSync(phasePath)) {
    throw new Error(`Spec file not found: ${phasePath}`);
  }

  const firstLine = fs.readFileSync(phasePath, 'utf8').split('\n')[0];

  // Read existing index
  let index = fs.existsSync(indexPath)
    ? fs.readFileSync(indexPath, 'utf8')
    : '';

  // Only append if this phase heading isn't already there
  if (!index.includes(firstLine)) {
    fs.appendFileSync(indexPath, firstLine + '\n');
  }
}

/**
 * Regenerate specs/index.md from scratch from all existing phase files.
 * Useful for recovery.
 */
function rebuildSpecsIndex(config) {
  const { resolved } = config;
  const specsDir  = resolved.specsDir;
  const indexPath = path.join(specsDir, 'index.md');

  const files = fs.readdirSync(specsDir)
    .filter(f => f.match(/^phase\d+\.md$/))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0]);
      const nb = parseInt(b.match(/\d+/)[0]);
      return na - nb;
    });

  const lines = files.map(f => {
    const content = fs.readFileSync(path.join(specsDir, f), 'utf8');
    return content.split('\n')[0];
  });

  fs.writeFileSync(indexPath, lines.join('\n') + '\n');
}

module.exports = { generateProjectMap, updateSpecsIndex, rebuildSpecsIndex };