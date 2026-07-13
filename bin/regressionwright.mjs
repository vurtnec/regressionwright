#!/usr/bin/env node
const command = process.argv[2];

if (command === 'auth') {
  process.argv.splice(2, 1);
  await import('../scripts/refresh-auth.mjs');
} else if (command === 'profile') {
  process.argv.splice(2, 1);
  await import('../scripts/open-browser-profile.mjs');
} else {
  await import('../scripts/harness.mjs');
}
