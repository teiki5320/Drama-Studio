import React from 'react';

// Navigation principale : trois parties, chacune avec ses sous-onglets.
// Un sous-onglet correspond à un « mode » historique du studio (normal, long,
// pub, recette, chaine) — sauf en Publicité, où chaque appli a son propre
// onglet qui ouvre directement sa page, et « ➕ » sert à en ajouter une.
export const SECTIONS = [
  {
    id: 'dramas',
    label: '🎬 Dramas',
    subs: [
      { mode: 'normal', label: 'Drama court' },
      { mode: 'long', label: 'Drama série' },
    ],
  },
  { id: 'pub', label: '📣 Publicité', subs: [{ mode: 'pub', label: '➕', title: 'Ajouter une appli ou un site' }] },
  {
    id: 'autre',
    label: '✨ Autre',
    subs: [
      { mode: 'recette', label: '🍲 Recettes' },
      { mode: 'chaine', label: '🎥 Chaîne' },
    ],
  },
];

export const MODES = SECTIONS.flatMap((s) => s.subs.map((x) => x.mode));

export function sectionOf(mode) {
  return SECTIONS.find((s) => s.subs.some((x) => x.mode === mode)) || SECTIONS[0];
}

// Dernier onglet ouvert : simple confort, jamais indispensable (le stockage
// du navigateur peut être vide ou refusé).
const STORAGE_KEY = 'drama-studio.mode';

export function loadSavedMode() {
  try {
    const m = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(m) ? m : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // stockage indisponible : on retombera sur Drama court au prochain lancement
  }
}

// apps : les projets Publicité (une appli = un projet). activeProjectId :
// l'appli ouverte, pour surligner son onglet.
export function NavTabs({ mode, apps = [], activeProjectId = null, onPickMode, onOpenProject }) {
  const section = sectionOf(mode);
  const firstModeOf = (s) => s.subs[0].mode;

  return (
    <nav className="nav-tabs">
      <div className="nav-sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`nav-section${s.id === section.id ? ' active' : ''}`}
            onClick={() => {
              if (s.id === section.id && !activeProjectId) {
                return;
              }
              // Publicité : on ouvre la première appli s'il y en a une, sinon « ➕ ».
              if (s.id === 'pub' && apps.length > 0) {
                onOpenProject(apps[0].id);
                return;
              }
              onPickMode(firstModeOf(s));
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="nav-subs">
        {section.id === 'pub' &&
          apps.map((p) => (
            <button
              key={p.id}
              className={`nav-sub${p.id === activeProjectId ? ' active' : ''}`}
              onClick={() => onOpenProject(p.id)}
            >
              {p.title}
            </button>
          ))}
        {section.subs.map((x) => (
          <button
            key={x.mode}
            title={x.title}
            className={`nav-sub${x.mode === mode && !activeProjectId ? ' active' : ''}`}
            onClick={() => onPickMode(x.mode)}
          >
            {x.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
