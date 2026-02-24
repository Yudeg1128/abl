'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STATUS = { 
  CLEAN: 'clean', 
  BUILDING: 'building', 
  VERIFYING: 'verifying', 
  CONTRACTS_FAILED: 'contracts_failed', 
  STUCK: 'stuck', 
  COMPLETED: 'completed' 
};

function read(config) {
  const p = config.resolved.stateFile;
  let state = { phases_completed: [], current: null, last_updated: null, phase_titles: {} };
  
  if (fs.existsSync(p)) {
    try { state = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
  }

  // Sync titles from filesystem (force integers for keys)
  const specsDir = config.resolved.specsDir;
  if (fs.existsSync(specsDir)) {
    fs.readdirSync(specsDir).filter(f => f.match(/^phase(\d+)\.md$/)).forEach(f => {
      const n = parseInt(f.match(/\d+/)[0]);
      const content = fs.readFileSync(path.join(specsDir, f), 'utf8');
      state.phase_titles[n] = content.split('\n')[0].replace(/^#\s*/, '').trim();
    });
  }
  return state;
}

function write(config, state) {
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(config.resolved.stateFile, JSON.stringify(state, null, 2));
}

function syncWithGit(config, state) {
  const gitDir = path.join(config.resolved.srcDir, '.git');
  if (!fs.existsSync(gitDir)) return state;

  try {
    const log = execSync('git log --oneline', { cwd: config.resolved.srcDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const matches = [...log.matchAll(/phase(\d+)\/passed/g)];
    
    matches.forEach(m => {
      const phaseNum = parseInt(m[1]);
      if (!state.phases_completed.includes(phaseNum)) {
        state.phases_completed.push(phaseNum);
      }
    });
    
    state.phases_completed.sort((a, b) => a - b);
  } catch (e) {}
  return state;
}

function resolveNextAction(config, state) {
  if (!fs.existsSync(config.resolved.specsDir)) return { action: 'done', phase: null, reason: 'no_specs' };
  
  const specs = fs.readdirSync(config.resolved.specsDir)
    .filter(f => f.match(/^phase(\d+)\.md$/))
    .map(f => parseInt(f.match(/\d+/)[0]))
    .sort((a, b) => a - b);

  if (specs.length === 0) return { action: 'done', phase: null, reason: 'no_specs' };
  
  if (state.current && state.current.status !== STATUS.COMPLETED && state.current.status !== STATUS.STUCK) {
    return { action: 'resume', phase: state.current.phase, status: state.current.status };
  }

  const next = specs.find(n => !state.phases_completed.includes(n));
  return next ? { action: 'run', phase: next } : { action: 'done', phase: null, reason: 'all_complete' };
}

module.exports = { 
  STATUS, 
  read, 
  write, 
  syncWithGit, 
  resolveNextAction, 
  startPhase: (config, phase) => { 
    const s = read(config); 
    s.current = { 
      phase: parseInt(phase), 
      verifier_iteration: 1, 
      status: STATUS.CLEAN,
      builder_success: false,
      verifier_success: false
    }; 
    write(config, s); 
  },
  updateProgress: (config, updates) => { 
    const s = read(config); 
    if (s.current) { 
      if (updates.verifierIteration) s.current.verifier_iteration = updates.verifierIteration; 
      if (updates.status) s.current.status = updates.status; 
      if (updates.builder_success !== undefined) s.current.builder_success = updates.builder_success;
      if (updates.verifier_success !== undefined) s.current.verifier_success = updates.verifier_success;
      write(config, s); 
    } 
  },
  completePhase: (config, phase) => { 
    const s = read(config); 
    const p = parseInt(phase);
    if (!s.phases_completed.includes(p)) s.phases_completed.push(p); 
    s.current = null; 
    write(config, s); 
  },
  resetPhase: (config, phase) => { 
    const s = read(config); 
    const p = parseInt(phase);
    s.phases_completed = s.phases_completed.filter(n => n !== p); 
    s.current = null; 
    write(config, s); 
  }
};