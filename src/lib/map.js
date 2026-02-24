'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

function generateMap(config) {
  const { srcDir, projectMap } = config.resolved;
  
  try {
    // Generate file tree
    let map = execSync(`tree "${srcDir}" -I 'node_modules|.git' --dirsfirst`, { encoding: 'utf8' });
    
    // Append dependency info if available
    const pkgPath = require('path').join(srcDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      map += '\n--- Dependencies ---\n';
      map += fs.readFileSync(pkgPath, 'utf8');
    }

    fs.writeFileSync(projectMap, map);
  } catch (e) {
    fs.writeFileSync(projectMap, `Error generating map: ${e.message}`);
  }
}

module.exports = { generateMap };