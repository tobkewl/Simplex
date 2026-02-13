const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let logPath = null;
let stream = null;
let currentDate = null;

function getDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function init() {
  currentDate = getDateString();
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, `poe-overlay-${currentDate}.log`);
    stream = fs.createWriteStream(logPath, { flags: 'a' });
    write('logger', 'initialized', { logPath });
  } catch (e) {
    // fallback to current directory
    try {
      logPath = path.join(process.cwd(), `poe-overlay-${currentDate}.log`);
      stream = fs.createWriteStream(logPath, { flags: 'a' });
      write('logger', 'initialized-fallback', { logPath });
    } catch {}
  }
}

function checkDateRotation() {
  const today = getDateString();
  if (today !== currentDate && stream) {
    try {
      stream.end();
      init();
    } catch {}
  }
}

function ts() {
  return new Date().toISOString();
}

function write(level, msg, data) {
  checkDateRotation();
  const line = `[${ts()}] ${level.toUpperCase()} ${msg}` + (data ? ` ${safeJson(data)}` : '') + '\n';
  try { process.stdout.write(line); } catch {}
  try { if (stream) stream.write(line); } catch {}
}

function safeJson(v) {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function info(msg, data) { write('info', msg, data); }
function warn(msg, data) { write('warn', msg, data); }
function error(msg, data) { write('error', msg, data); }
function debug(msg, data) { write('debug', msg, data); }

function getLogPath() { return logPath; }

init();

module.exports = { info, warn, error, debug, getLogPath };

