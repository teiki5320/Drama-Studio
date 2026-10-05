// Récupérer la vidéo finie. Sur le Mac, le bouton ouvre le dossier iCloud
// dans le Finder ; depuis l'iPad (studio.keurcook.com), le Finder s'ouvrirait
// sur l'écran du Mac : on propose donc d'enregistrer le MP4 sur l'appareil
// (il arrive dans Fichiers → Téléchargements, prêt pour TikTok).
import React from 'react';
import { api } from './api.js';
import { APPLIS_MOBILES } from './apps.js';

export const surLeMac = () => ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

// Lien qui force l'enregistrement du MP4 (Safari l'ouvrirait sinon dans le lecteur).
export const lienVideo = (projectId, file, nom) =>
  `/files/${projectId}/${file}?dl=1&name=${encodeURIComponent(`${String(nom || 'video').slice(0, 120)}.mp4`)}`;

export function VideoSave({ project, episode, style }) {
  if (!episode || !episode.renderedFile) {
    return null;
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', ...style }}>
      {surLeMac() ? (
        // Sur le Mac, la vidéo est déjà rangée sur le Bureau : on l'y montre.
        <button className="clay-btn small" onClick={() => api.openFolder(project.id, episode.number).catch((e) => alert(e.message))}>
          📂 Ouvrir le dossier
        </button>
      ) : (
        <a className="clay-btn small" href={lienVideo(project.id, episode.renderedFile, episode.title)}>
          ⬇️ Enregistrer la vidéo
        </a>
      )}
    </div>
  );
}

// Case à cocher : le logo Afrotok dans le coin des prochaines vidéos.
export function LogoAfrotok({ project, onChange }) {
  return (
    <label className="clay-muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={!project.noSticker}
        onChange={(e) =>
          api
            .patchProject(project.id, { noSticker: !e.target.checked })
            .then(onChange)
            .catch((err) => alert(err.message))
        }
      />
      Logo Afrotok
    </label>
  );
}

// Appli mobile : où elle est publiée (badges sur l'écran de fin).
export function CasesBoutiques({ project, onChange }) {
  const depot = String(project.repo || '').split('/').pop().toLowerCase();
  if (project.kind !== 'pub' || !APPLIS_MOBILES.has(depot)) {
    return null;
  }
  const b = project.boutiques || {};
  const coche = (cle, valeur) =>
    api
      .patchProject(project.id, { boutiques: { ...b, [cle]: valeur } })
      .then(onChange)
      .catch((err) => alert(err.message));
  const cas = (cle, libelle) => (
    <label className="clay-muted small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      <input type="checkbox" checked={Boolean(b[cle])} onChange={(e) => coche(cle, e.target.checked)} />
      {libelle}
    </label>
  );
  return (
    <>
      {cas('appStore', 'App Store')}
      {cas('googlePlay', 'Google Play')}
    </>
  );
}
