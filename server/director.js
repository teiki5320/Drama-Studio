import { formatFor } from './claudegen.js';

// « Kit Director » : tout ce qu'il faut pour tourner un épisode dans OpenArt
// Director (openart.ai → menu de gauche → Director) au lieu de la chaîne
// image → clip → synchro : Director génère l'épisode ENTIER en une passe
// (voix françaises et lèvres synchronisées nativement). Le kit = le texte à
// coller dans son chat + la liste ordonnée des visages ; la planche de
// référence est assemblée côté navigateur à partir des portraits existants.

// Casting de l'épisode : les personnages réellement présents (à l'image ou
// qui parlent), dans l'ordre du casting de la série (la star d'abord) —
// c'est aussi l'ordre des visages sur la planche jointe.
export function episodeCast(project, episode) {
  const all = project.characters || [];
  const present = new Set();
  for (const scene of episode.scenes || []) {
    for (const id of scene.characters || []) {
      present.add(id);
    }
    for (const l of scene.lines || []) {
      if (l.speaker && l.speaker !== 'narrator') {
        present.add(l.speaker);
      }
    }
  }
  const cast = all.filter((c) => present.has(c.id));
  return cast.length > 0 ? cast : all;
}

function speakerName(project, id) {
  const c = (project.characters || []).find((x) => x.id === id);
  return c ? c.name : id;
}

export function buildDirectorKit(project, episode) {
  const cast = episodeCast(project, episode);
  const seconds = formatFor(project).seconds;
  const prev = (project.episodeSummaries || []).find((s) => s.number === episode.number - 1);

  const lines = [
    `Réalise l'épisode ${episode.number} de ma mini-série verticale. L'histoire et les dialogues sont DÉJÀ écrits ci-dessous : mets-les en scène tels quels, sans les changer.`,
    '',
    'RÉGLAGES DÉFINITIFS (ne me redemande ni format, ni résolution, ni durée)',
    `- Vidéo verticale 9:16 (TikTok), durée totale d'environ ${seconds} secondes.`,
    '- Résolution : 480p pour ce premier essai (je passerai en qualité supérieure ensuite).',
    '- Tous les dialogues et la voix off sont EN FRANÇAIS : voix naturelles en français, lèvres synchronisées sur le français.',
    '- Ajoute des sous-titres automatiques en français.',
    '- Style : mini-série africaine glamour type DramaWave/ReelShort — image léchée, gros plans dramatiques sur celui qui parle, plans de réaction, étalonnage riche.',
    "- L'image jointe est la planche OFFICIELLE des visages, dans l'ordre de la liste ci-dessous : garde ces visages EXACTEMENT, dans tous les plans.",
    '',
    `LA SÉRIE : ${project.title}`,
  ];
  if (project.logline) {
    lines.push(project.logline);
  }
  if (project.setting) {
    lines.push(`Cadre : ${project.setting}`);
  }
  lines.push('', "PERSONNAGES (dans l'ordre de la planche jointe)");
  cast.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.name} — ${c.role} (${c.gender}, ${c.age} ans). Apparence : ${c.visual}`);
  });
  lines.push('Aucun autre personnage ne parle (des figurants muets sont permis).');
  // Les lieux sont des références à part entière, comme le casting : Director
  // (et les outils du même genre) crée une fiche par décor et la réutilise.
  const locations =
    episode.locations && Object.keys(episode.locations).length > 0 ? episode.locations : null;
  const locationNames = locations
    ? []
    : [...new Set((episode.scenes || []).map((s) => s.location).filter(Boolean))];
  if (locations) {
    lines.push(
      '',
      "LIEUX (crée une référence visuelle par lieu et garde-la EXACTEMENT dans tous les plans qui s'y déroulent)",
    );
    Object.entries(locations).forEach(([name, desc]) => {
      lines.push(`- ${name} : ${desc}`);
    });
  } else if (locationNames.length > 0) {
    lines.push(
      '',
      'LIEUX (un décor = une référence visuelle, gardée identique dans tous ses plans)',
      ...locationNames.map((n) => `- ${n}`),
    );
  }
  if (prev && prev.summary) {
    lines.push('', `PRÉCÉDEMMENT (épisode ${episode.number - 1}) : ${prev.summary}`);
  }
  lines.push('', `ÉPISODE ${episode.number} — ${episode.title}`);
  (episode.scenes || []).forEach((scene, i) => {
    lines.push('', `Scène ${i + 1}${scene.location ? ` — ${scene.location}` : ''}`);
    if (scene.imagePrompt) {
      lines.push(`Plan : ${scene.imagePrompt}`);
    }
    for (const l of scene.lines || []) {
      lines.push(
        l.speaker === 'narrator'
          ? `VOIX OFF (narrateur) : « ${l.text} »`
          : `${speakerName(project, l.speaker).toUpperCase()}, en gros plan : « ${l.text} »`,
      );
    }
  });
  if (episode.cliffhanger) {
    lines.push('', `FIN : l'épisode se termine EXACTEMENT sur ce cliffhanger : ${episode.cliffhanger}`);
  }
  lines.push(
    '',
    'DÉROULÉ',
    "Montre-moi le casting et les lieux en UNE seule validation, puis génère TOUS les plans d'un coup, dans l'ordre, sans autre question. Assemble le montage avec les sous-titres français et donne-moi la vidéo finale.",
  );

  return {
    text: lines.join('\n'),
    seconds,
    cast: cast.map((c) => ({
      id: c.id,
      name: c.name,
      portrait: c.portrait || null,
      portraitVersion: c.portraitVersion || 0,
    })),
    missing: cast.filter((c) => !c.portrait).map((c) => c.name),
  };
}
