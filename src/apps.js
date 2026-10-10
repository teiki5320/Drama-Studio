// Mes applis et sites : nom et icône affichés sur les boutons de l'onglet
// Publicité — les mêmes que dans le Dashboard. La clé est le nom du dépôt
// GitHub en minuscules ; un dépôt absent de la liste garde son nom et 📦.
export const APP_LOOKS = {
  erea: { name: 'Erea', icon: '⏳' },
  kultiva: { name: 'Kultiva', icon: '🌱' },
  kultivaprix: { name: 'Kultiva Prix', icon: '🏷️' },
  keurcook: { name: 'Keur Cook', icon: '🍲' },
  tama: { name: 'Tama TV', icon: '📺' },
  palabre: { name: 'Palabre', icon: '🃏' },
  'd-sign': { name: 'D-Sign', icon: '🎮' },
  optiled: { name: 'OptiLED', icon: '💡' },
  keurdeco: { name: 'Keur Déco', icon: '🛋️' },
  keurbook: { name: 'Keurbook', icon: '📚' },
  avelor: { name: 'Solelis', icon: '🧭' },
  survival: { name: 'Survival', icon: '🏕️' },
};

// Applis mobiles (les autres sont des sites) : leurs pubs peuvent finir sur
// les badges officiels des boutiques où elles sont publiées.
export const APPLIS_MOBILES = new Set(['erea', 'palabre', 'kultiva', 'kultivaprix', 'tama', 'd-sign', 'survival']);

// Badges officiels (Apple, Google), rangés dans studio/.
export function badgesBoutiques(project, studioBase) {
  const depot = String(project?.repo || '').split('/').pop().toLowerCase();
  const b = project?.boutiques || {};
  if (project?.kind !== 'pub' || !APPLIS_MOBILES.has(depot)) {
    return [];
  }
  return [b.appStore ? `${studioBase}/badge-app-store.svg` : null, b.googlePlay ? `${studioBase}/badge-google-play.png` : null].filter(Boolean);
}

// Logo Afrotok dans le coin : plus nulle part (pubs, recettes, chaînes) ;
// seuls les anciens dramas le gardent.
export function logoAfrotokVisible(project) {
  return Boolean(project) && !['chaine', 'recette'].includes(project.mode) && project.kind !== 'pub';
}

// La vidéo de fin Afrotok (« Abonne-toi ») : seulement sur les anciens dramas.
export function outroAfrotok(project) {
  return logoAfrotokVisible(project);
}

// Dépôts qui ne sont pas des produits à promouvoir.
export const NOT_ADVERTISED = new Set(['dashboard', 'drama-studio', 'bd']);

export function appLook(repoName, fallbackLabel = '') {
  const key = String(repoName || '').toLowerCase();
  return APP_LOOKS[key] || { name: fallbackLabel || repoName, icon: '📦' };
}
