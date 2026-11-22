#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'mcp' || args.includes('--mcp')) {
  await import('../dist/mcp.js');
} else {
  await import('../dist/server.js');
}
