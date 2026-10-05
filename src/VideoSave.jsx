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

// État d'une vidéo dans la liste : à monter, à valider (bouton Valider), ou
// validée (un clic la remet à valider). Seules les validées vont au planning.
export function EtatValidation({ project, ep, onChange }) {
  if (!ep.renderedFile) {
    return <span className="clay-state att">à monter</span>;
  }
  const change = (e, ok) => {
    e.stopPropagation();
    api
      .validateEpisode(project.id, ep.number, ok)
      .then(onChange)
      .catch((err) => alert(err.message));
  };
  return ep.validation === 'validee' ? (
    <button className="clay-state ok" style={{ cursor: 'pointer', border: 'none' }} title="Remettre à valider" onClick={(e) => change(e, false)}>
      validée ✓
    </button>
  ) : (
    <button className="clay-btn small" title="Valider : la vidéo passe dans « Validées » et au planning" onClick={(e) => change(e, true)}>
      ✅ Valider
    </button>
  );
}
