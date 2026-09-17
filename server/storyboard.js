import { askClaudeForJson, formatFor } from './claudegen.js';
import { saveProject } from './projects.js';
import { ensureUsage } from './pipeline.js';
import { SHOT_TYPES, shotStats } from '../shared/catalog.js';

// ---------- Storyboard : découpage d'un épisode en plans ----------
// UN appel Claude par épisode, juste après le scénario et AVANT toute
// génération payante (aucun appel OpenArt/ElevenLabs/fal ici). Chaque scène
// reçoit un tableau `shots` ; les répliques ne sont PAS dupliquées : un plan
// pointe vers sa réplique par `lineIndex` (index dans scene.lines), la voix
// reste produite par réplique comme aujourd'hui.

function castNames(project) {
  return (project.characters || []).map((c) => c.name);
}

function locationNames(project, episode) {
  const names = new Set(Object.keys(episode.locations || {}));
  for (const l of project.locations || []) {
    names.add(l.name);
  }
  return [...names];
}

export function buildStoryboardPrompt(project, episode) {
  const format = formatFor(project);
  const target = format.seconds;
  const scenes = episode.scenes || [];

  const characters = (project.characters || [])
    .map((c) => `- ${c.name} — ${c.role} (${c.gender}, ${c.age} ans) — apparence fixe : ${c.visual}`)
    .join('\n');

  const lieux = locationNames(project, episode)
    .map((name) => {
      const desc =
        (episode.locations || {})[name] ||
        (project.locations || []).find((l) => l.name === name)?.visual ||
        '';
      return `- ${name}${desc ? ` — ${desc}` : ''}`;
    })
    .join('\n');

  const scenesTxt = scenes
    .map((scene, i) => {
      const lines = (scene.lines || [])
        .map((l, j) => {
          const who =
            l.speaker === 'narrator'
              ? 'NARRATEUR (voix off)'
              : (project.characters || []).find((c) => c.id === l.speaker)?.name || l.speaker;
          return `  [réplique ${j}] ${who} : « ${l.text} »`;
        })
        .join('\n');
      return `### Scène ${i}${scene.location ? ` — ${scene.location}` : ''}\nContexte visuel (EN) : ${scene.imagePrompt || '(aucun)'}\n${lines || '  (aucune réplique)'}`;
    })
    .join('\n\n');

  return `Tu es storyboarder et chef opérateur pour des micro-dramas verticaux (9:16) destinés à TikTok et à une appli mobile.
Tu découpes un épisode complet en plans. Contrainte absolue : la somme des durées des plans = ${target} secondes (±5 s).
Réponds UNIQUEMENT en JSON valide, sans markdown.

Épisode ${episode.number} — durée cible ${target} s — ${scenes.length} scènes.

Personnages (noms EXACTS à réutiliser) :
${characters}

Lieux (noms EXACTS à réutiliser) :
${lieux || '- (aucun lieu déclaré : reprends le décor du contexte visuel de chaque scène)'}

Scènes (répliques numérotées — à référencer par lineIndex) :
${scenesTxt}

Rends ce JSON :
{ "scenes": [ { "scene_idx": 0, "shots": [ {
  "idx": 0,
  "type": "large | champ | contrechamp | gros_plan | insert",
  "duration_s": 4,
  "characters": ["noms exacts des personnages VISIBLES dans le plan"],
  "location": "nom exact du lieu",
  "visual_desc": "Ce qu'on voit, composition verticale, 60 à 100 mots, EN ANGLAIS.",
  "motion_desc": "Mouvement de caméra et action, 15 à 30 mots, EN ANGLAIS.",
  "lineIndex": 0,
  "ambience": "Son d'ambiance en une phrase courte (français).",
  "animate": true,
  "is_cliffhanger": false
} ] } ] }

Règles de découpage :
- 12 à 18 plans au total pour un épisode de 60 s. Chaque plan dure 3 à 6 s.
- CHAQUE réplique de chaque scène (narrateur compris) est rattachée à EXACTEMENT UN plan via "lineIndex" (l'index [réplique j] donné ci-dessus). Un plan a AU PLUS une réplique ("lineIndex": null si personne ne parle).
- Réplique d'un personnage : gros plan ou champ/contrechamp sur LUI SEUL (alterne champ puis contrechamp quand deux personnages se répondent).
- Réplique du NARRATEUR : voix off posée sur un plan large ou un insert ("animate" peut rester false).
- Scène de transition ou d'action sans réplique : 1 plan.
- Le premier plan de l'épisode est un plan large qui situe le lieu.
- Un gros plan sur l'émotion clé de l'épisode.
- Un insert (objet, main, téléphone, document) UNIQUEMENT si un détail compte pour l'intrigue.
- La dernière scène a 2 plans : un plan qui pose la situation puis un gros plan qui coupe net sur la réplique ou le regard du cliffhanger ("is_cliffhanger": true sur ce dernier plan).
- Composition verticale : sujets centrés, plans rapprochés, jamais de paysage horizontal.
- "characters" liste uniquement les personnages VISIBLES dans le plan, avec leurs noms exacts.
- "animate" = true pour les plans avec réplique de personnage ou action, false pour les plans larges d'ambiance et les inserts.
- Utilise les noms exacts des personnages et des lieux fournis.`;
}

// Valide et normalise la réponse de Claude. Lève une Error descriptive si la
// structure est inutilisable (l'appelant retente une fois avec le message).
function normalizeStoryboard(project, episode, data) {
  if (!data || !Array.isArray(data.scenes)) {
    throw new Error('le JSON ne contient pas "scenes" (tableau)');
  }
  const names = new Set(castNames(project));
  const knownLocations = new Set(locationNames(project, episode));
  const warnings = [];
  const scenes = episode.scenes || [];
  const byIdx = new Map();
  for (const s of data.scenes) {
    if (Number.isInteger(s?.scene_idx) && Array.isArray(s.shots)) {
      byIdx.set(s.scene_idx, s.shots);
    }
  }
  if (byIdx.size === 0) {
    throw new Error('aucune scène exploitable ("scene_idx" + "shots")');
  }

  const result = scenes.map((scene, si) => {
    const raw = byIdx.get(si) || [];
    const usedLines = new Set();
    const shots = raw
      .filter((sh) => sh && typeof sh === 'object')
      .map((sh, i) => {
        // Personnages : noms exacts uniquement, les inconnus sont retirés.
        const chars = (Array.isArray(sh.characters) ? sh.characters : [])
          .map(String)
          .filter((n) => {
            if (names.has(n)) {
              return true;
            }
            warnings.push(`scène ${si} plan ${i} : personnage inconnu « ${n} » retiré`);
            return false;
          });
        // lineIndex : doit exister dans scene.lines et n'être utilisé qu'une fois.
        let lineIndex = Number.isInteger(sh.lineIndex) ? sh.lineIndex : null;
        if (lineIndex != null && (lineIndex < 0 || lineIndex >= (scene.lines || []).length)) {
          warnings.push(`scène ${si} plan ${i} : lineIndex ${lineIndex} hors limites, ignoré`);
          lineIndex = null;
        }
        if (lineIndex != null && usedLines.has(lineIndex)) {
          warnings.push(`scène ${si} plan ${i} : réplique ${lineIndex} déjà rattachée, ignorée`);
          lineIndex = null;
        }
        if (lineIndex != null) {
          usedLines.add(lineIndex);
        }
        const type = SHOT_TYPES.includes(sh.type) ? sh.type : 'gros_plan';
        const loc =
          typeof sh.location === 'string' && knownLocations.has(sh.location)
            ? sh.location
            : scene.location || String(sh.location || '');
        return {
          idx: i,
          type,
          durationSec: Math.min(8, Math.max(3, Math.round(Number(sh.duration_s) || 4))),
          characters: chars,
          location: loc,
          visualDesc: String(sh.visual_desc || '').trim(),
          motionDesc: String(sh.motion_desc || '').trim(),
          lineIndex,
          ambience: String(sh.ambience || '').trim(),
          animate: Boolean(sh.animate),
          isCliffhanger: Boolean(sh.is_cliffhanger),
          image: null,
          imageUrl: null,
          video: null,
          lipsynced: false,
          version: 0,
        };
      });

    // Réparation : toute réplique oubliée reçoit son plan (la voix de chaque
    // réplique DOIT avoir un plan porteur, sinon elle disparaît du montage).
    (scene.lines || []).forEach((line, j) => {
      if (usedLines.has(j)) {
        return;
      }
      const isNarrator = line.speaker === 'narrator';
      const speakerName = isNarrator
        ? null
        : (project.characters || []).find((c) => c.id === line.speaker)?.name || null;
      warnings.push(`scène ${si} : réplique ${j} sans plan — plan ajouté automatiquement`);
      shots.push({
        idx: shots.length,
        type: isNarrator ? 'large' : 'gros_plan',
        durationSec: 4,
        characters: speakerName ? [speakerName] : [],
        location: scene.location || '',
        visualDesc: String(scene.imagePrompt || '').slice(0, 400),
        motionDesc: '',
        lineIndex: j,
        ambience: '',
        animate: !isNarrator,
        isCliffhanger: false,
        image: null,
        imageUrl: null,
        video: null,
        lipsynced: false,
        version: 0,
      });
    });
    return shots;
  });

  if (result.every((shots) => shots.length === 0)) {
    throw new Error('storyboard vide (aucun plan)');
  }
  return { shotsByScene: result, warnings };
}

// Ajuste proportionnellement les durées cibles pour tenir dans ±5 s de la
// durée de l'épisode (arrondi à l'entier, minimum 3 s).
function adjustDurations(shotsByScene, target) {
  const all = shotsByScene.flat();
  const total = all.reduce((s, sh) => s + sh.durationSec, 0);
  if (all.length === 0 || Math.abs(total - target) <= 5) {
    return;
  }
  const ratio = target / total;
  for (const sh of all) {
    sh.durationSec = Math.max(3, Math.round(sh.durationSec * ratio));
  }
}

export async function generateStoryboard(project, episode, update) {
  const prompt = buildStoryboardPrompt(project, episode);
  update(`Épisode ${episode.number} — storyboard (découpage en plans) par Claude…`);
  let data = await askClaudeForJson(prompt);
  ensureUsage(project).claudeCalls += 1;
  let normalized;
  try {
    normalized = normalizeStoryboard(project, episode, data);
  } catch (e) {
    // Seconde chance : on redonne le prompt avec l'erreur constatée.
    update(`Épisode ${episode.number} — storyboard invalide (${e.message}), nouvel essai…`);
    data = await askClaudeForJson(
      `${prompt}\n\nTa réponse précédente était invalide : ${e.message}. Recommence en corrigeant, JSON UNIQUEMENT.`,
    );
    ensureUsage(project).claudeCalls += 1;
    try {
      normalized = normalizeStoryboard(project, episode, data);
    } catch (e2) {
      throw new Error(`Storyboard impossible : ${e2.message}`);
    }
  }
  adjustDurations(normalized.shotsByScene, formatFor(project).seconds);
  (episode.scenes || []).forEach((scene, si) => {
    scene.shots = normalized.shotsByScene[si];
  });
  for (const w of normalized.warnings) {
    console.warn(`Storyboard ép.${episode.number} :`, w);
  }
  const stats = shotStats(episode);
  console.log(
    `Storyboard ép.${episode.number} : ${stats.count} plans · ${stats.seconds} s · ${stats.animated} animés`,
  );
  saveProject(project);
  return stats;
}

// Supprime le storyboard (et les fichiers d'assets de ses plans) pour le
// regénérer : les images/clips déjà produits par plan sont invalidés.
export function clearStoryboard(episode) {
  for (const scene of episode.scenes || []) {
    delete scene.shots;
  }
}
