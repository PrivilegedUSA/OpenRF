'use strict';
/* Launch only an OpenRF-owned loopback Python backend, and stop only that child.
   An already-running compatible user's OpenRF server is left untouched. */
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');

const EXPECTED_VERSION = '0.2.188';
let backendChild = null;

function rootFor(appResources, sourceDir) {
  const packaged = appResources && path.join(appResources, 'project');
  if (packaged && fs.existsSync(path.join(packaged, 'openrf', '__main__.py'))) return packaged;
  return path.resolve(sourceDir, '..', '..');
}

async function checkHealth(url, get = global.fetch) {
  try {
    const response = await get(new URL('/api/health', url).toString(), {signal: AbortSignal.timeout(1200), cache: 'no-store'});
    if (!response.ok) return {state: 'occupied'};
    const data = await response.json();
    return data.status === 'ok' && data.version === EXPECTED_VERSION
      ? {state: 'ready', version: data.version}
      : {state: 'occupied', version: data.version};
  } catch (_error) {
    return {state: 'unreachable'};
  }
}

async function ensureBackend({url, projectRoot, python = 'python3', get = global.fetch,
                              start = spawn, pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const status = await checkHealth(url, get);
  if (status.state === 'ready') return {owned: false, status};
  if (status.state === 'occupied') {
    throw Error('Port is occupied by another service or OpenRF version. Stop the old server before launching v' + EXPECTED_VERSION + '.');
  }
  if (!fs.existsSync(path.join(projectRoot, 'openrf', '__main__.py'))) {
    throw Error('OpenRF Python backend is missing from the application resources.');
  }
  const port = Number(new URL(url).port || 80);
  const env = {...process.env, PYTHONPATH: projectRoot + (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : '')};
  backendChild = start(python, ['-m', 'openrf', '--port', String(port)], {
    cwd: projectRoot, env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true
  });
  let spawnError = null;
  backendChild.on('error', err => {spawnError = err;});
  for (let attempt = 0; attempt < 65; attempt++) {
    if (spawnError || backendChild.exitCode !== null) break;
    await pause(200);
    const seen = await checkHealth(url, get);
    if (seen.state === 'ready') return {owned: true, status: seen};
    if (seen.state === 'occupied') break;
  }
  stopBackend();
  throw Error('Could not start the OpenRF Python backend. Check Python 3.11+, port availability and the app log.');
}

function stopBackend() {
  if (backendChild && backendChild.exitCode === null && !backendChild.killed) backendChild.kill('SIGTERM');
  backendChild = null;
}

module.exports = {rootFor, checkHealth, ensureBackend, stopBackend, EXPECTED_VERSION};
