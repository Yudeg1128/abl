'use strict';

const fs   = require('fs');
const path = require('path');

const CSV_HEADER = 'timestamp,phase,step,role,model,input,candidates,cached,total,session_id\n';

function ensureTokensCsv(config) {
  const { tokensCsv, logsDir } = config.resolved;
  fs.mkdirSync(logsDir, { recursive: true });
  if (!fs.existsSync(tokensCsv)) {
    fs.writeFileSync(tokensCsv, CSV_HEADER);
  }
}

/**
 * Extract token usage from a Gemini CLI log file and append to tokens.csv.
 * Preserves the exact extraction logic that works in v1:
 * - Finds the JSON blob by locating "stats" in the raw log
 * - Extracts session_id separately via regex from raw log
 * - Writes ERROR row if JSON is not parseable
 */
function extractTokens(config, logPath, role, phase, step) {
  const { tokensCsv } = config.resolved;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let raw = '';
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    appendError(tokensCsv, ts, phase, step, role);
    return;
  }

  // Extract session_id from raw log before JSON parsing
  const sessionMatch = raw.match(/"session_id"\s*:\s*"([^"]+)"/);
  const sessionId = sessionMatch ? sessionMatch[1] : 'none';

  // Find JSON blob starting from "stats" line — mirrors the awk logic from v1
  const json = extractJsonBlob(raw);
  if (!json) {
    appendError(tokensCsv, ts, phase, step, role, sessionId);
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    appendError(tokensCsv, ts, phase, step, role, sessionId);
    return;
  }

  if (!parsed.stats || !parsed.stats.models) {
    appendError(tokensCsv, ts, phase, step, role, sessionId);
    return;
  }

  const models = parsed.stats.models;
  for (const [modelName, data] of Object.entries(models)) {
    const t = data.tokens || {};
    const row = [
      `"${ts}"`,
      `"${phase}"`,
      `"${step}"`,
      `"${role}"`,
      `"${modelName}"`,
      t.input      || 0,
      t.candidates || 0,
      t.cached     || 0,
      t.total      || 0,
      `"${sessionId}"`,
    ].join(',');
    fs.appendFileSync(tokensCsv, row + '\n');
  }
}

/**
 * Find the JSON blob in a raw Gemini CLI log.
 * The log has firejail/IDE preamble before the JSON.
 * Strategy: find the line containing "stats": and collect
 * from the preceding { to the matching closing }
 */
function extractJsonBlob(raw) {
  const lines = raw.split('\n');
  let startIdx = -1;
  let braceDepth = 0;
  let inJson = false;
  let jsonLines = [];

  for (let i = 0; i < lines.length; i++) {
    if (!inJson) {
      // Look for a line that is just "{"  — start of JSON object
      if (lines[i].trim() === '{') {
        startIdx = i;
        inJson = true;
        braceDepth = 1;
        jsonLines = ['{'];
      }
    } else {
      jsonLines.push(lines[i]);
      for (const ch of lines[i]) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth === 0) {
        // Found complete JSON object — check it has stats
        const candidate = jsonLines.join('\n');
        if (candidate.includes('"stats"')) {
          return candidate;
        }
        // Not our JSON, keep looking
        inJson = false;
        jsonLines = [];
      }
    }
  }
  return null;
}

function appendError(tokensCsv, ts, phase, step, role, sessionId = 'none') {
  const row = `"${ts}","${phase}","${step}","${role}","unknown","ERROR",0,0,0,"${sessionId}"`;
  fs.appendFileSync(tokensCsv, row + '\n');
}

/**
 * Print costs summary to console — mirrors `make costs` output
 */
function printCosts(config) {
  const { tokensCsv } = config.resolved;

  if (!fs.existsSync(tokensCsv)) {
    console.log('No token data yet — run a phase first.');
    return;
  }

  const lines = fs.readFileSync(tokensCsv, 'utf8').trim().split('\n').slice(1); // skip header

  let totalCalls = 0;
  let totalInput = 0;
  let totalCandidates = 0;
  let totalCached = 0;
  let totalTokens = 0;

  for (const line of lines) {
    const cols = line.split(',');
    if (!cols[5] || cols[5].includes('ERROR')) continue;
    totalCalls++;
    totalInput      += parseInt(cols[5]) || 0;
    totalCandidates += parseInt(cols[6]) || 0;
    totalCached     += parseInt(cols[7]) || 0;
    totalTokens     += parseInt(cols[8]) || 0;
  }

  const chalk = require('chalk');
  const D = '━'.repeat(57);
  console.log('');
  console.log(chalk.bold(D));
  console.log(chalk.bold('  Token Usage Summary'));
  console.log(chalk.dim(D));
  console.log(`  Total calls:      ${totalCalls.toLocaleString()}`);
  console.log(`  Input tokens:     ${totalInput.toLocaleString()}`);
  console.log(`  Output tokens:    ${totalCandidates.toLocaleString()}`);
  console.log(`  Cached tokens:    ${totalCached.toLocaleString()}`);
  console.log(`  Total tokens:     ${totalTokens.toLocaleString()}`);
  console.log(chalk.dim(D));
  console.log(chalk.dim('  Apply current model pricing to token counts above.'));
  console.log('');
}

module.exports = { ensureTokensCsv, extractTokens, printCosts };