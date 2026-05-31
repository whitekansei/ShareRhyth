#!/usr/bin/env node
// Starts electron-vite dev with ELECTRON_RUN_AS_NODE cleared
const { spawn } = require('child_process');
const path = require('path');

const env = Object.assign({}, process.env);
delete env.ELECTRON_RUN_AS_NODE;

console.log('Starting electron-vite dev (ELECTRON_RUN_AS_NODE cleared)...');

// Use cmd.exe with explicit quoting to handle paths with spaces/Japanese chars
const ps = spawn('cmd.exe', ['/s', '/c', '"node_modules\\.bin\\electron-vite.cmd" dev'], {
  stdio: 'inherit',
  env,
  cwd: __dirname,
  shell: false,
  windowsVerbatimArguments: true
});

ps.on('error', (err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});

ps.on('close', (code) => {
  process.exit(code ?? 0);
});
