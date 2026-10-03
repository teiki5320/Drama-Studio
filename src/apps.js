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
  avelor: { name: 'Avelor', icon: '🧭' },
  survival: { name: 'Survival', icon: '🏕️' },
};

// Dépôts qui ne sont pas des produits à promouvoir.
export const NOT_ADVERTISED = new Set(['dashboard', 'drama-studio', 'bd']);

export function appLook(repoName, fallbackLabel = '') {
  const key = String(repoName || '').toLowerCase();
  return APP_LOOKS[key] || { name: fallbackLabel || repoName, icon: '📦' };
}
