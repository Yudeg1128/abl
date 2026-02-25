'use strict';

const fs = require('fs');
const path = require('path');
const stateLib = require('./state');
const { buildCommandContext } = require('./config');

function buildPipedContext(config, role, phase, iteration) {
  const state = stateLib.read(config);
  const workspacePath = role === 'builder' ? config.resolved.srcDir : config.resolved.testsDir;

  const projectMd = fs.existsSync(path.join(config.resolved.ablDir, 'project.md'))
    ? fs.readFileSync(path.join(config.resolved.ablDir, 'project.md'), 'utf8')
    : '# Project\nNo description provided.';

  const projectMap = fs.existsSync(config.resolved.projectMap)
    ? fs.readFileSync(config.resolved.projectMap, 'utf8')
    : 'No project map available.';

  const rolePromptPath = path.join(config.resolved.promptsDir, `${role}.md`);
  const rolePrompt = fs.existsSync(rolePromptPath)
    ? fs.readFileSync(rolePromptPath, 'utf8')
    : `You are the ${role}. Implement the requested phase.`;

  const currentSpecPath = path.join(config.resolved.specsDir, `phase${phase}.md`);
  const currentSpec = fs.existsSync(currentSpecPath)
    ? fs.readFileSync(currentSpecPath, 'utf8')
    : 'No spec found for this phase.';

  // --- Failure Context for Builder ---
  let failureContext = '';
  if (role === 'builder') {
    const failPath = path.join(config.resolved.testsDir, 'failed_specs.md');
    if (fs.existsSync(failPath) && fs.readFileSync(failPath, 'utf8').trim().length > 0) {
      failureContext = [
        '# PREVIOUS ATTEMPT FAILED',
        'Your previous implementation did not satisfy all contracts.',
        'Address the following failures in your next implementation:',
        '',
        fs.readFileSync(failPath, 'utf8'),
        ''
      ].join('\n');
    } else {
      failureContext = '# INITIAL BUILD\nThis is a fresh iteration. No prior failures detected.';
    }
  }

  const historyLines = Object.entries(state.phase_titles)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([num, title]) => {
      const status = state.phases_completed.includes(parseInt(num)) ? '[COMPLETED]' : '[PENDING]';
      return `- Phase ${num}: ${title} ${status}`;
    });

  const cmdContext = buildCommandContext(config, role);

  return [
    rolePrompt,
    '',
    '# Project Context',
    projectMd,
    '',
    '# Session State',
    `Current Phase: ${phase} (${state.phase_titles[phase] || 'Unknown'})`,
    `Current Iteration: ${iteration}`,
    `Workspace Root: ${workspacePath}`, // 2. FIXED: Explicit Spatial Awareness
    '',
    failureContext,
    '',
    '# Phase History',
    historyLines.join('\n'),
    '',
    '# Current Phase Spec (CONTRACTS)',
    currentSpec,
    '',
    '# Available Commands',
    cmdContext
  ].join('\n');
}

module.exports = { buildPipedContext };