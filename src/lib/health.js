'use strict';

const { execSync, spawn } = require('child_process');
const fs                  = require('fs');
const path                = require('path');
const http                = require('http');

let devServerProcess = null;

/**
 * Run the project health check command.
 * Captures output to logs/health.log.
 * Returns true on pass, false on fail.
 */
function runHealthCheck(config) {
  const { resolved } = config;
  const logPath = path.join(resolved.logsDir, 'health.log');

  fs.mkdirSync(resolved.logsDir, { recursive: true });

  try {
    const output = execSync(config.commands.health_check, {
      cwd: resolved.srcDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    // Pass — clear health log
    if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
    return true;
  } catch (e) {
    // Fail — write combined output to health.log
    const output = [e.stdout, e.stderr].filter(Boolean).join('\n');
    fs.writeFileSync(logPath, output);
    return false;
  }
}

/**
 * Run reset_state command on host.
 */
function resetState(config) {
  if (!config.commands.reset_state) return;
  execSync(config.commands.reset_state, {
    cwd: config.resolved.srcDir,
    stdio: 'inherit',
  });
}

/**
 * Start the dev server as a detached child process.
 * Writes PID to logs/dev.pid, stdout/stderr to logs/dev.log.
 */
function startDevServer(config) {
  const { resolved } = config;
  const logPath = path.join(resolved.logsDir, 'dev.log');
  const pidPath = path.join(resolved.logsDir, 'dev.pid');

  fs.mkdirSync(resolved.logsDir, { recursive: true });

  const logStream = fs.openSync(logPath, 'w');

  const [cmd, ...args] = config.commands.start_dev.split(' ');
  devServerProcess = spawn(cmd, args, {
    cwd: resolved.srcDir,
    detached: false,
    stdio: ['ignore', logStream, logStream],
  });

  fs.writeFileSync(pidPath, String(devServerProcess.pid));
}

/**
 * Poll the dev server ready endpoint until it responds 200
 * or timeout is reached.
 */
function waitForDevServer(config) {
  const { port, ready_endpoint, timeout_ms } = config.dev_server;
  const deadline = Date.now() + timeout_ms;

  return new Promise((resolve, reject) => {
    function poll() {
      if (Date.now() > deadline) {
        reject(new Error(`Dev server did not become ready within ${timeout_ms}ms`));
        return;
      }

      const req = http.get(
        { host: 'localhost', port, path: ready_endpoint, timeout: 2000 },
        (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(poll, 1000);
          }
        }
      );

      req.on('error', () => setTimeout(poll, 1000));
      req.on('timeout', () => { req.destroy(); setTimeout(poll, 1000); });
    }

    poll();
  });
}

/**
 * Stop the dev server gracefully.
 */
function stopDevServer(config) {
  const pidPath = path.join(config.resolved.logsDir, 'dev.pid');

  if (devServerProcess) {
    try {
      devServerProcess.kill('SIGTERM');
      devServerProcess = null;
    } catch {}
  }

  // Also kill by PID file in case of crash/resume
  if (fs.existsSync(pidPath)) {
    const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim());
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
    fs.unlinkSync(pidPath);
  }

  // Kill anything still on the port
  try {
    const port = config.dev_server.port;
    if (process.platform === 'win32') {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}"') do taskkill /F /PID %a`, { stdio: 'pipe' });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'pipe' });
    }
  } catch {}
}

module.exports = { runHealthCheck, resetState, startDevServer, waitForDevServer, stopDevServer };