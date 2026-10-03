import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');

// Charge le fichier .env AVANT de lire la configuration (sans dépendance).
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      // Valeur entre guillemets (« EXPORT_DIR="~/Mon dossier" ») : on retire
      // les guillemets, sinon ils feraient partie du chemin ou de la clé.
      process.env[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

export const PROJECTS_DIR = path.join(ROOT, 'projects');
export const DIST_DIR = path.join(ROOT, 'dist');
export const PORT = Number(process.env.PORT || 4600);
// Ce Mac seulement : le studio n'a pas de mot de passe (voir aussi le
// contrôle de l'en-tête Host dans index.js).
export const HOST = '127.0.0.1';
export const IMAGE_PROVIDER = (process.env.IMAGE_PROVIDER || 'pollinations').toLowerCase();
// Clips vidéo automatiques (1re scène, milieu, dernière) — VIDEO_SCENES=off pour couper.
export const VIDEO_SCENES = !['off', '0', 'false', 'non'].includes(
  (process.env.VIDEO_SCENES || 'on').toLowerCase(),
);

fs.mkdirSync(PROJECTS_DIR, { recursive: true });
