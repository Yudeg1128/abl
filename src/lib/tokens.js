'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CSV_HEADER = 'timestamp,phase,step,role,model,input,candidates,cached,total,session_id\n';

/**
 * Nuclear fallback: Extracts the largest valid JSON object containing "stats" 
 * by tracking brace depth.
 */
function findStatsJson(str) {
  let startIdx = str.indexOf('{');
  while (startIdx !== -1) {
    let depth = 0;
    let inString = false;
    for (let i = startIdx; i < str.length; i++) {
      const char = str[i];
      // Handle strings to avoid miscounting braces inside quotes
      if (char === '"' && str[i - 1] !== '\\') inString = !inString;
      if (!inString) {
        if (char === '{') depth++;
        else if (char === '}') {
          depth--;
          if (depth === 0) {
            const candidate = str.substring(startIdx, i + 1);
            if (candidate.includes('"stats"')) {
              try {
                return JSON.parse(candidate);
              } catch (e) {
                // Not valid JSON, keep looking
              }
            }
          }
        }
      }
    }
    startIdx = str.indexOf('{', startIdx + 1);
  }
  return null;
}

function extractTokens(config, logPath, role, phase, step) {
  const { tokensCsv } = config.resolved;
  if (!fs.existsSync(tokensCsv)) fs.writeFileSync(tokensCsv, CSV_HEADER);
  
  let raw = '';
  try { raw = fs.readFileSync(logPath, 'utf8'); } catch (e) { return; }

  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const parsed = findStatsJson(raw);
  const sessionId = parsed?.session_id || 'none';

  if (!parsed || !parsed.stats || !parsed.stats.models) {
    const errorRow = [`"${ts}"`,`"${phase}"`,`"${step}"`,`"${role}"`,'"unknown"','"ERROR"',0,0,0,`"${sessionId}"`].join(',');
    fs.appendFileSync(tokensCsv, errorRow + '\n');
    return;
  }

  try {
    for (const [model, data] of Object.entries(parsed.stats.models)) {
      const t = data.tokens || {};
      const row = [
        `"${ts}"`,
        `"${phase}"`,
        `"${step}"`,
        `"${role}"`,
        `"${model}"`,
        t.input || 0,
        t.candidates || 0,
        t.cached || 0,
        t.total || 0,
        `"${sessionId}"`
      ].join(',');
      fs.appendFileSync(tokensCsv, row + '\n');
    }
  } catch (e) {
    const errorRow = [`"${ts}"`,`"${phase}"`,`"${step}"`,`"${role}"`,'"unknown"','"ERROR"',0,0,0,`"${sessionId}"`].join(',');
    fs.appendFileSync(tokensCsv, errorRow + '\n');
  }
}

function printCosts(config) {
  const { tokensCsv } = config.resolved;
  if (!fs.existsSync(tokensCsv)) return console.log('No costs logged.');
  
  const lines = fs.readFileSync(tokensCsv, 'utf8').trim().split('\n').slice(1);
  let totals = { calls: 0, input: 0, output: 0, total: 0 };
  
  lines.forEach(l => {
    const c = l.split(',');
    // Handle quoted or unquoted ERROR strings
    if (c[5]?.includes('ERROR')) return;
    totals.calls++;
    totals.input += parseInt(c[5]) || 0;
    totals.output += parseInt(c[6]) || 0;
    totals.total += parseInt(c[8]) || 0;
  });

  console.log(chalk.bold(`\n  Total Calls: ${totals.calls}`));
  console.log(chalk.bold(`  Total Tokens: ${totals.total.toLocaleString()}\n`));
}

module.exports = { extractTokens, printCosts, findStatsJson };