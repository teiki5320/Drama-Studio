import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Localise la commande `claude` même quand le serveur est lancé par un
// processus dont le PATH ne la contient pas (relance par script, launchd…).
// CLAUDE_BIN dans .env permet de forcer un chemin précis.
let cached = null;

export function claudeBin() {
  if (cached) {
    return cached;
  }
  const forced = (process.env.CLAUDE_BIN || '').trim();
  if (forced && fs.existsSync(forced)) {
    cached = forced;
    return cached;
  }
  const home = os.homedir();
  const candidates = [
    path.join(home, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    path.join(home, '.npm-global', 'bin', 'claude'),
    path.join(home, '.local', 'bin', 'claude'),
  ];
  // Installations via nvm : ~/.nvm/versions/node/vX.Y.Z/bin/claude (la plus récente).
  try {
    const nvmDir = path.join(home, '.nvm', 'versions', 'node');
    const versions = fs.readdirSync(nvmDir).sort().reverse();
    for (const v of versions) {
      candidates.push(path.join(nvmDir, v, 'bin', 'claude'));
    }
  } catch {
    // pas de nvm
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      cached = c;
      return cached;
    }
  }
  // Dernier recours : le PATH du processus.
  cached = 'claude';
  return cached;
}
