import { spawn } from 'node:child_process';
import { EPISODE_COUNT, styleLabel, VOICES } from '../shared/catalog.js';
import { claudeBin } from './claudebin.js';

const VOICE_CATALOG = VOICES.map((v) => `"${v.id}" = ${v.name} (${v.gender}, ${v.desc})`).join(' ; ');

// Appelle Claude Code en mode non interactif (`claude -p`).
// Utilise la session Claude Code de la machine (abonnement) — aucune clé API.
export function askClaude(prompt, { timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin(), ['-p', prompt, '--output-format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Claude a mis trop de temps à répondre (délai dépassé).'));
    }, timeoutMs);

    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      if (e.code === 'ENOENT') {
        reject(
          new Error(
            "La commande `claude` est introuvable. Installe Claude Code (https://claude.com/claude-code) et connecte-toi avec `claude` puis `/login`.",
          ),
        );
      } else {
        reject(e);
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        // Le message d'erreur de Claude Code sort tantôt sur stderr, tantôt
        // dans l'enveloppe JSON sur stdout — on remonte les deux.
        let detail = `${err}\n${out}`.trim();
        try {
          const envelope = JSON.parse(out);
          if (envelope.result) {
            detail = String(envelope.result);
          }
        } catch {
          // stdout n'était pas du JSON — garder le texte brut
        }
        if (/login|logged out|authenticat|api key|credential|oauth|expired/i.test(detail)) {
          reject(
            new Error(
              "Claude Code n'est pas connecté : dans un terminal, lance `claude`, tape `/login` pour te connecter, puis réessaie ici.",
            ),
          );
          return;
        }
        reject(
          new Error(
            `claude -p a échoué (code ${code}) : ${detail.slice(0, 600) || 'aucun message renvoyé'}`,
          ),
        );
        return;
      }
      try {
        const envelope = JSON.parse(out);
        resolve(typeof envelope.result === 'string' ? envelope.result : out);
      } catch {
        resolve(out);
      }
    });
  });
}

// Extrait le premier objet JSON d'un texte (Claude entoure parfois de ```json).
export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Réponse de Claude sans JSON détectable.');
  }
  return JSON.parse(text.slice(start, end + 1));
}

const DRAMA_IMAGE_SUFFIX =
  'cinematic film still, african drama series, warm natural light, shallow depth of field, 9:16 vertical';

const sceneSchema = (suffix) => `{
  "lines": [1 à 2 répliques : {"speaker": "narrator" OU l'id d'un personnage, "text": "réplique courte et percutante en français, 18 mots maximum"}],
  "characters": [ids des personnages VISIBLES à l'image dans cette scène, [] si aucun],
  "imagePrompt": "EN ANGLAIS : le plan cinématographique précis (lieu, action, émotion, cadrage) en répétant mot pour mot la description visuelle 'visual' de chaque personnage présent, terminé par : ${suffix}"
}`;

const SCENE_SCHEMA = sceneSchema(DRAMA_IMAGE_SUFFIX);

// Le héros/l'héroïne doit crever l'écran : ces adjectifs sont OBLIGATOIRES
// dans sa description visuelle (donc dans toutes ses images).
export const LEAD_ADJECTIVES = ['beautiful', 'young', 'pretty', 'cute', 'charismatic'];

// Formats d'épisodes : classique (10 × 60 s) ou long (30 à 60 × 40 s).
export function seriesFormat({ mode, episodeCount } = {}) {
  if (mode === 'long') {
    return {
      long: true,
      count: Number.isInteger(episodeCount) ? episodeCount : 40,
      seconds: 40,
      words: 95,
      scenes: '5 à 7',
    };
  }
  return {
    long: false,
    count: Number.isInteger(episodeCount) ? episodeCount : EPISODE_COUNT,
    seconds: 60,
    words: 140,
    scenes: '8 à 10',
  };
}

export function formatFor(project) {
  return seriesFormat({ mode: project.mode, episodeCount: project.episodeCount });
}

const seriesSchema = (format) => `{
  "title": "titre de la série",
  "logline": "accroche en une phrase",
  "setting": "lieu et contexte (ville/pays africain précis)",${
    format.long
      ? `\n  "trope": "le trope principal de la série (en une phrase)",\n  "secret": "le secret du héros/de l'héroïne, tenu toute la saison",\n  "antagonist": "l'antagoniste principal (nom + ce qu'il veut)",`
      : ''
  }
  "characters": [3 à 5 personnages, le PREMIER de la liste est le héros ou l'héroïne principal(e) : {
    "id": "slug_court",
    "name": "prénom + nom",
    "gender": "homme" ou "femme",
    "age": nombre,
    "role": "rôle dans l'histoire",
    "visual": "EN ANGLAIS : description physique très détaillée et STABLE (âge apparent, visage, coiffure, tenue signature, corpulence) réutilisée à l'identique dans toutes les images",
    "voice": "CASTING VOCAL : l'id EXACT de la voix la plus adaptée au genre, à l'âge et à la personnalité du personnage, choisie dans ce catalogue : ${VOICE_CATALOG}"
  }],
  "episodeSummaries": [${format.count} éléments : {"number": n, "title": "titre", "summary": "résumé en 2 phrases avec le cliffhanger"}],
  "hashtags": [10 hashtags TikTok en minuscules SANS le symbole # : 4 génériques à gros volume (drama, pourtoi, storytime…) + 6 propres à la série (lieu, thème, métier, émotion)],
  "episode1": {
    "number": 1,
    "title": "titre de l'épisode 1",
    "scenes": [${format.scenes} scènes : ${SCENE_SCHEMA}],
    "cliffhanger": "phrase de suspense qui donne envie de voir l'épisode 2"
  }
}`;

const seriesRules = (format) => `Contraintes STRICTES :
- STAR DE L'ÉCRAN : le personnage principal (le PREMIER de la liste "characters", homme ou femme) doit être magnétique — sa description "visual" contient OBLIGATOIREMENT ces mots anglais : ${LEAD_ADJECTIVES.join(', ')}.
- CLARTÉ AVANT TOUT : un spectateur qui découvre l'épisode sur son téléphone doit tout comprendre du premier coup. Phrases courtes et simples, aucun sous-entendu obscur, aucune ellipse confuse. Une scène = une seule idée claire qui fait avancer l'intrigue. Les personnages s'appellent par leur prénom dans les dialogues pour qu'on sache toujours qui parle à qui.
- Le narrateur ("narrator") OUVRE l'épisode en posant la situation en une phrase simple (« Awa vient d'enterrer son père. Ce matin, le notaire lit le testament. »), puis n'intervient que pour clarifier une transition (3 fois max par épisode).
- DRAMA MAXIMAL : conflits frontaux, confrontations directes en face à face, révélations chocs, phrases qui claquent. Chaque épisode contient AU MOINS une confrontation intense et une révélation. Émotions fortes et assumées : colère, larmes, menaces, amour interdit, humiliation publique.
- Total des répliques de l'épisode ≈ ${format.words} mots (≈ ${format.seconds} secondes de voix). Répliques ≤ 18 mots, percutantes, naturelles à l'oral, expressions d'Afrique de l'Ouest francophone par petites touches.${
  format.long ? `\n${longSeasonBlock(format)}` : ''
}
- Le cliffhanger final doit donner physiquement envie de voir la suite (danger imminent, secret sur le point d'éclater, retournement).
- Les "imagePrompt" sont autonomes : quelqu'un qui n'a pas lu le script doit pouvoir générer l'image.`;

// Sans contrainte, Claude retombe toujours sur les mêmes choix (Awa, Koné,
// Abidjan…). C'est donc l'appli qui tire au sort le cadre de chaque série,
// et qui interdit les prénoms/lieux déjà utilisés dans les dramas existants.
const AFRICAN_SETTINGS = [
  { country: "Côte d'Ivoire", cities: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'San-Pédro', 'Korhogo'] },
  { country: 'Sénégal', cities: ['Dakar', 'Saint-Louis', 'Thiès', 'Ziguinchor', 'Mbour'] },
  { country: 'Cameroun', cities: ['Douala', 'Yaoundé', 'Bafoussam', 'Kribi', 'Garoua'] },
  { country: 'Mali', cities: ['Bamako', 'Ségou', 'Sikasso', 'Kayes'] },
  { country: 'Burkina Faso', cities: ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou'] },
  { country: 'Bénin', cities: ['Cotonou', 'Porto-Novo', 'Parakou', 'Abomey'] },
  { country: 'Togo', cities: ['Lomé', 'Kara', 'Sokodé'] },
  { country: 'Guinée', cities: ['Conakry', 'Kankan', 'Labé'] },
  { country: 'RD Congo', cities: ['Kinshasa', 'Lubumbashi', 'Goma', 'Kisangani'] },
  { country: 'Congo-Brazzaville', cities: ['Brazzaville', 'Pointe-Noire'] },
  { country: 'Gabon', cities: ['Libreville', 'Port-Gentil', 'Franceville'] },
  { country: 'Niger', cities: ['Niamey', 'Zinder', 'Maradi'] },
  { country: 'Madagascar', cities: ['Antananarivo', 'Toamasina', 'Mahajanga'] },
];

const MILIEUX = [
  'le milieu des affaires et des villas de luxe',
  'un grand marché populaire et ses commerçantes',
  'une chefferie traditionnelle et sa cour',
  'le monde de la musique et des maquis',
  'un grand hôpital et ses médecins',
  "l'université et les résidences étudiantes",
  'le football local et ses supporters',
  'les ateliers de couture et le monde de la mode',
  'une église influente et sa chorale',
  'le port de pêche et ses mareyeuses',
  'une plantation de cacao et de café',
  'les mines d\'or et leurs convoitises',
  'un hôtel de luxe en bord de mer',
  'les taxis, gbakas et gares routières',
  'une radio-télévision locale et ses vedettes',
  'la diaspora, entre Paris et le pays',
  'le tribunal, les avocats et un grand procès',
  'une auto-école ou un garage de quartier',
  'la politique locale et une campagne électorale',
  'un restaurant réputé et ses cuisines',
];

// Tropes éprouvés des applis de micro-dramas (ReelShort, DramaBox…), adaptés
// au contexte africain. Tiré au sort à chaque série, comme le cadre — l'idée
// du producteur prime toujours.
const TROPES = [
  { label: 'Le PDG caché', pitch: "un(e) riche héritier(ère) ou PDG se fait passer pour un(e) employé(e) modeste (chauffeur, serveuse, livreur) et observe qui le/la méprise" },
  { label: "L'épouse de contrat", pitch: 'un mariage arrangé « sur le papier » entre deux inconnus qui tombent lentement amoureux — malgré les clauses' },
  { label: "L'héritière répudiée", pitch: 'humiliée et chassée par sa belle-famille, elle revient plus riche et plus puissante qu\'eux tous' },
  { label: 'Le gendre méprisé', pitch: "traité comme un bon à rien par sa belle-famille, il est en secret le patron ou l'héritier que tout le monde courtise" },
  { label: 'La double vie', pitch: "le/la protagoniste mène une double identité (star masquée, guérisseuse célèbre, grand patron anonyme) que son entourage ignore" },
  { label: 'La seconde chance', pitch: "après une trahison fatale, le héros/l'héroïne obtient de « revivre » les événements en sachant tout — et corrige chaque humiliation une par une" },
  { label: 'Le bébé secret', pitch: "elle a disparu enceinte ; des années plus tard, le père puissant découvre l'enfant — et la femme qu'il a perdue" },
  { label: 'Le mariage éclair', pitch: 'mariés en 24 heures sur un pari ou une urgence — puis chacun découvre qui est vraiment l\'autre' },
  { label: "L'amour interdit", pitch: 'deux familles ou deux entreprises rivales, deux amoureux au milieu — chaque rendez-vous est une trahison' },
  { label: 'Le vrai héritier', pitch: "l'enfant échangé à la naissance : le « faux » héritier règne, le vrai revient réclamer son dû" },
  { label: 'La revanche de la co-épouse', pitch: 'méprisée par la première épouse et la belle-mère, la co-épouse patiente détient un secret qui renversera toute la maison' },
  { label: 'Le protecteur obsédé', pitch: "un homme puissant et possessif protège l'héroïne contre tous — jusqu'à l'étouffer ; elle devra le dompter" },
  { label: "L'amnésie", pitch: "après un accident, il/elle a tout oublié — y compris son mariage, sa fortune ou son ennemi juré" },
  { label: 'La servante milliardaire', pitch: "prise pour une domestique ou une vendeuse, elle est en réalité la propriétaire de tout ce que ses humiliateurs convoitent" },
  { label: 'Le retour de la diaspora', pitch: "parti(e) sans rien, revenu(e) de l'étranger avec fortune et diplômes — face à ceux qui l'avaient enterré(e)" },
  { label: 'Le testament piégé', pitch: "l'héritage ne revient qu'à celui qui remplira une condition impossible (se marier en 30 jours, réconcilier la famille, avoir un enfant…)" },
];

// La « promesse secondaire » : le type de révélation qui rythme les retournements.
const SECONDARY_TWISTS = [
  'une identité cachée révélée en public au pire moment',
  'un enfant ou une grossesse gardés secrets',
  'un document qui change tout (testament, test ADN, contrat signé)',
  "un retour que personne n'attendait (mort présumé, disparu, exilé)",
  'une alliance secrète entre deux ennemis apparents',
  'une dette ou une promesse ancienne qui lie deux familles',
  "un enregistrement/une photo qui prouve la trahison",
];

// Prénoms que les IA recyclent sans arrêt — bannis d'office.
const OVERUSED_NAMES = ['Awa', 'Aminata', 'Fatou', 'Fatoumata', 'Aïcha', 'Mariam', 'Kwame', 'Kofi', 'Amara', 'Ismaël', 'Moussa', 'Sekou'];

// ---------- Canevas professionnel du Format long (fourni par le producteur) ----------
// Saison en 3 actes avec paywall, règles de placement, et blocs de 2 épisodes
// aux beats chronométrés. Les bornes s'adaptent au nombre d'épisodes choisi.

function longActBounds(count) {
  if (count >= 55) {
    return { a1: 8, a2a: 25, a2b: 50 };
  }
  return {
    a1: Math.max(5, Math.round(count * 0.13)),
    a2a: Math.round(count * 0.4),
    a2b: Math.round(count * 0.8),
  };
}

function longSeasonBlock(format) {
  const c = format.count;
  const b = longActBounds(c);
  const mid = (x, y) => Math.round((x + y) / 2);
  return `
STRUCTURE DE SAISON OBLIGATOIRE (canevas professionnel des micro-dramas, ${c} épisodes) :
Fondations à définir AVANT d'écrire, et à tenir toute la saison :
- un TROPE principal fort (vengeance, héritier(e) caché(e), mariage contractuel, Cendrillon moderne, retour du fils prodigue…) ;
- un SECRET du héros/de l'héroïne (révélé progressivement, indice par indice) ;
- un ANTAGONISTE principal.
■ ACTE 1 — MISE EN PLACE (ép. 1-${b.a1}) : injustice fondatrice dès l'ép. 1 ; UNE humiliation par épisode ; indices du secret distillés ; introduction de l'allié/love interest vers l'ép. ${Math.min(4, b.a1)} ; l'ép. ${b.a1} se termine sur le CLIFFHANGER LE PLUS FORT depuis le début (c'est lui qui accroche définitivement le spectateur).
■ ACTE 2A — ESCALADE (ép. ${b.a1 + 1}-${b.a2a}) : le secret se révèle PARTIELLEMENT à un personnage ; première mini-revanche vers l'ép. ${mid(b.a1 + 3, b.a2a - 5)} ; un deuxième antagoniste/obstacle apparaît ; RETOURNEMENT MAJEUR n°1 vers l'ép. ${Math.round(b.a2a * 0.8)}.
■ ACTE 2B — MONTAGNES RUSSES (ép. ${b.a2a + 1}-${b.a2b}) : cycles victoire → trahison → chute → remontée ; moment de satisfaction PUBLIQUE n°1 vers l'ép. ${mid(b.a2a, b.a2b) - Math.round(c * 0.1)} ; FAUSSE DÉFAITE (le héros perd tout) vers l'ép. ${Math.round(b.a2b * 0.8)} ; RETOURNEMENT MAJEUR n°2 vers l'ép. ${b.a2b - Math.max(3, Math.round(c * 0.06))}.
■ ACTE 3 — REVANCHE TOTALE (ép. ${b.a2b + 1}-${c}) : révélation PUBLIQUE du secret vers l'ép. ${mid(b.a2b, c)} ; antagoniste détruit/humilié publiquement ; résolution de la romance ; happy end RAPIDE (2-3 épisodes maximum).
■ RÈGLES DE PLACEMENT (les "episodeSummaries" doivent les refléter épisode par épisode) :
- un retournement toutes les 3 à 5 épisodes ;
- une satisfaction/revanche partielle toutes les 10 à 15 épisodes ;
- cliffhanger MAXIMAL aux épisodes multiples de 10 ;
- ratio injustice/revanche : 80/20 dans l'acte 1 → 50/50 au milieu → 20/80 à la fin.`;
}

// Position d'un épisode long dans son bloc de 2 et dans la saison → découpage
// seconde par seconde (beats adaptés à la durée réelle des épisodes).
export function longEpisodeBeats(format, number) {
  const s = format.seconds;
  const t = (f) => Math.round(s * f);
  const b = longActBounds(format.count);
  const isFirst = number % 2 === 1;
  const blocStart = isFirst ? number : number - 1;
  const act =
    number <= b.a1
      ? 'ACTE 1 — MISE EN PLACE (ratio injustice/revanche ≈ 80/20 : le héros subit)'
      : number <= b.a2a
        ? 'ACTE 2A — ESCALADE (le secret commence à filtrer, premières mini-revanches)'
        : number <= b.a2b
          ? 'ACTE 2B — MONTAGNES RUSSES (ratio ≈ 50/50 : victoire → trahison → chute → remontée)'
          : 'ACTE 3 — REVANCHE TOTALE (ratio ≈ 20/80 : le héros domine)';
  return `
POSITION DANS LA SAISON : ${act}.
DÉCOUPAGE OBLIGATOIRE (bloc d'épisodes ${blocStart}-${blocStart + 1} — celui-ci est le ${isFirst ? 'PREMIER' : 'SECOND'} du bloc, même question dramatique, AUCUNE ellipse de temps entre les deux) :
■ 0-${t(0.05)} s — HOOK : ${
    isFirst
      ? "reprise DIRECTE du cliffhanger de l'épisode précédent"
      : "réponse IMMÉDIATE au cliffhanger de l'épisode précédent"
  } ;
■ ${t(0.05)}-${t(0.42)} s — ${
    isFirst
      ? 'DÉVELOPPEMENT : le conflit avance + une information nouvelle'
      : "CONSÉQUENCE : la situation empire OU s'inverse"
  } ;
■ ${t(0.42)}-${t(0.75)} s — ${
    isFirst
      ? 'ESCALADE : humiliation ou tension, avec un TÉMOIN présent'
      : 'ÉLARGISSEMENT : le conflit devient plus public'
  } ;
■ ${t(0.75)}-${t(0.92)} s — INDICE DU SECRET, visible pour le spectateur${
    isFirst ? '' : ", PLUS GROS que celui de l'épisode précédent"
  } ;
■ ${t(0.92)}-${s} s — CLIFFHANGER${
    isFirst ? '' : " PLUS FORT que celui de l'épisode précédent"
  }${number % 10 === 0 ? ' — épisode multiple de 10 : cliffhanger MAXIMAL' : ''}.
Règle d'or : UN SEUL beat dramatique par épisode — pas deux.`;
}

export function drawVariety() {
  const s = AFRICAN_SETTINGS[Math.floor(Math.random() * AFRICAN_SETTINGS.length)];
  const trope = TROPES[Math.floor(Math.random() * TROPES.length)];
  return {
    country: s.country,
    city: s.cities[Math.floor(Math.random() * s.cities.length)],
    milieu: MILIEUX[Math.floor(Math.random() * MILIEUX.length)],
    trope,
    twist: SECONDARY_TWISTS[Math.floor(Math.random() * SECONDARY_TWISTS.length)],
  };
}

export function buildSeriesPrompt(styles, theme, variety = null, avoid = null, format = seriesFormat()) {
  const styleNames = styles.map((s) => styleLabel(s)).join(' + ');
  const bannedNames = [...new Set([...OVERUSED_NAMES, ...((avoid && avoid.names) || [])])];
  const varietyBlock = variety
    ? `
Cadre TIRÉ AU SORT pour cette série (chaque série doit dépayser par rapport aux précédentes) :
- Pays : ${variety.country} — ville principale : ${variety.city}.
- Univers de l'intrigue : ${variety.milieu}.${
        variety.trope
          ? `\n- TROPE PRINCIPAL imposé (recette éprouvée des micro-dramas à succès) : ${variety.trope.label} — ${variety.trope.pitch}. Adapte-le à fond au cadre ci-dessus ; c'est le moteur de toute l'histoire.`
          : ''
      }${
        variety.twist
          ? `\n- PROMESSE SECONDAIRE imposée (le type de révélation qui rythme les retournements) : ${variety.twist}.`
          : ''
      }
Ce cadre est OBLIGATOIRE${theme ? " — sauf si l'idée du producteur impose un autre lieu ou une autre intrigue, auquel cas elle prime" : ''}.

Diversité OBLIGATOIRE (anti-répétition) :
- Prénoms ET noms de famille authentiques et variés du pays choisi (${variety.country}), crédibles pour chaque ethnie/région.
- Prénoms INTERDITS (déjà vus ou sur-utilisés) : ${bannedNames.join(', ')}.${
        avoid && avoid.places && avoid.places.length > 0
          ? `\n- Contextes déjà exploités dans les séries précédentes, à NE PAS recycler :\n${avoid.places.map((p) => `  - ${p}`).join('\n')}`
          : ''
      }
- Trouve un angle d'intrigue original : surprends, ne refais pas l'histoire attendue.
`
    : '';
  return `Tu es scénariste de micro-dramas africains au format vertical (type TikTok), épisodes de ${format.seconds} secondes très addictifs.

Crée une NOUVELLE série en ${format.count} épisodes mêlant ces thèmes : ${styleNames}.${theme ? `\nIdée imposée par le producteur : ${theme}` : ''}
${varietyBlock}
Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, aucun commentaire), selon ce schéma exact :
${seriesSchema(format)}

${seriesRules(format)}`;
}

// Série construite à partir du script fourni par l'auteur (mode « mon script »).
export function buildCustomSeriesPrompt(answers) {
  const { script, title, setting, charactersText, styles = [], mustHappen, fidelity } = answers;
  const format = seriesFormat(answers);
  const styleNames = styles.map((s) => styleLabel(s)).join(' + ');
  return `Tu es scénariste de micro-dramas africains au format vertical (type TikTok), épisodes de ${format.seconds} secondes très addictifs.

Un auteur te confie SON histoire. Ta mission : la structurer en une série de ${format.count} épisodes SANS la dénaturer — c'est son histoire, pas la tienne.

=== MATÉRIAU DE L'AUTEUR ===
${title ? `Titre imposé : ${title}\n` : ''}${setting ? `Lieu et contexte imposés : ${setting}\n` : ''}${styleNames ? `Ton souhaité : ${styleNames}\n` : ''}${
    charactersText
      ? `Personnages décrits par l'auteur (noms, genres, âges et apparences à RESPECTER) :\n${charactersText}\n`
      : ''
  }Histoire / script :
"""
${script}
"""
${mustHappen ? `Moments imposés (doivent absolument arriver dans la saison) : ${mustHappen}\n` : ''}=== FIN DU MATÉRIAU ===

Règles de FIDÉLITÉ (prioritaires sur tout le reste) :
- L'intrigue, les personnages et leurs noms viennent de l'auteur : tu ne changes RIEN à l'histoire. Tu la découpes en ${format.count} épisodes équilibrés, tu la clarifies, et tu complètes UNIQUEMENT ce que l'auteur n'a pas précisé.
- ${
    fidelity === 'libre'
      ? `Tu peux réécrire les dialogues pour le format ${format.seconds} secondes, à condition de garder le sens des scènes et le caractère des personnages.`
      : "Si l'auteur a écrit des dialogues, reprends-les tels quels dans les répliques (raccourcis à 18 mots maximum si nécessaire, sans changer le sens)."
  }
- Complète sans contredire : genre, âge, rôle et description visuelle détaillée des personnages s'ils manquent ; lieu précis s'il manque ; cliffhanger par épisode.
- Histoire trop courte pour ${format.count} épisodes → développe des rebondissements cohérents avec l'univers de l'auteur. Trop longue → condense sans perdre les moments clés.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour, aucun commentaire), selon ce schéma exact :
${seriesSchema(format)}

${seriesRules(format)}`;
}

export function buildEpisodePrompt(project, number) {
  const format = formatFor(project);
  const summaries = project.episodeSummaries
    .map((s) => `Épisode ${s.number} — ${s.title} : ${s.summary}`)
    .join('\n');
  const previous = (project.episodes || [])
    .filter((e) => e.number < number && (e.scenes || []).length > 0)
    .map((e) => `Épisode ${e.number} (déjà produit) — cliffhanger final : ${e.cliffhanger}`)
    .join('\n');
  const characters = project.characters
    .map((c) => `- id "${c.id}" : ${c.name}, ${c.gender}, ${c.age} ans, ${c.role}. Visual (EN, à recopier tel quel dans les imagePrompt) : ${c.visual}`)
    .join('\n');

  // Mode « mon script » : l'histoire de l'auteur reste la référence absolue.
  const source =
    project.source && project.source.script
      ? `\nSCRIPT SOURCE DE L'AUTEUR — l'épisode doit y rester FIDÈLE${
          project.source.fidelity === 'libre'
            ? ' (dialogues adaptables, sens des scènes intouchable)'
            : ' (reprends ses dialogues tels quels quand ils existent, raccourcis à 18 mots max)'
        } :\n"""\n${project.source.script.slice(0, 30000)}\n"""\n${
          project.source.mustHappen
            ? `Moments imposés par l'auteur : ${project.source.mustHappen}\n`
            : ''
        }`
      : '';

  // Format long : fondations de la saison + découpage du bloc de 2 épisodes.
  const foundations =
    format.long && (project.trope || project.secret || project.antagonist)
      ? `\nFondations de la saison (à respecter dans CHAQUE épisode) :${
          project.trope ? `\n- Trope principal : ${project.trope}` : ''
        }${project.secret ? `\n- Secret du héros/de l'héroïne : ${project.secret}` : ''}${
          project.antagonist ? `\n- Antagoniste principal : ${project.antagonist}` : ''
        }\n`
      : '';
  const beats = format.long ? `\n${longEpisodeBeats(format, number)}\n` : '';

  return `Tu es scénariste de la série micro-drama africaine "${project.title}" (${project.logline}).
Contexte : ${project.setting}
${foundations}
Personnages (ids et descriptions visuelles à réutiliser EXACTEMENT) :
${characters}

Plan de la saison :
${summaries}
${previous ? `\n${previous}\n` : ''}${source}${beats}
Écris maintenant le scénario COMPLET de l'épisode ${number}, fidèle au plan de saison et à la continuité.

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour) :
{
  "number": ${number},
  "title": "titre de l'épisode",
  "scenes": [${format.scenes} scènes : ${SCENE_SCHEMA}],
  "cliffhanger": "phrase de suspense finale"
}

Contraintes STRICTES :
- CLARTÉ AVANT TOUT : tout doit se comprendre du premier coup. Phrases courtes et simples, une seule idée par scène, les personnages s'appellent par leur prénom. Le narrateur ouvre l'épisode en rappelant la situation en une phrase simple, puis 3 interventions max.
- DRAMA MAXIMAL : au moins une confrontation intense en face à face et une révélation choc dans l'épisode. Émotions fortes et assumées, phrases qui claquent.
- Total des répliques ≈ ${format.words} mots (≈ ${format.seconds} secondes de voix) ; répliques ≤ 18 mots, percutantes et naturelles à l'oral.
- Cliffhanger final irrésistible (danger imminent, secret sur le point d'éclater, retournement).
- "speaker" = "narrator" ou un id de personnage listé ci-dessus ; imagePrompt autonomes incluant les descriptions visuelles complètes.`;
}

// ---------- Chaînes (vidéos 60-120 s, narrateur seul, hors dramas) ----------

export const CHANNEL_GENRES = {
  storytime: 'storytime / histoires et faits réels racontés',
  educatif: 'éducatif / conseils pratiques',
  classement: 'classements / tops',
};

export const CHANNEL_VISUAL_STYLES = {
  photorealiste: 'photorealistic, cinematic, warm natural light, shallow depth of field, 9:16 vertical',
  illustration: 'modern digital illustration, bold colors, clean shapes, 9:16 vertical',
  archives: 'vintage archival photograph style, sepia tones, film grain, documentary feel, 9:16 vertical',
  epure: 'minimalist clean aesthetic, soft gradients, elegant simple composition, 9:16 vertical',
};

function channelImageSuffix(project) {
  return CHANNEL_VISUAL_STYLES[project.visualStyle] || CHANNEL_VISUAL_STYLES.photorealiste;
}

function channelDesc(ch) {
  return `Chaîne "${ch.title}" — genre : ${CHANNEL_GENRES[ch.genre] || ch.genre || 'libre'} — thème : ${ch.themeDesc || 'libre'}. Vidéos verticales de ${ch.targetSeconds || 90} secondes, un NARRATEUR unique en voix off (aucun dialogue).`;
}

// À la création d'une chaîne : hashtags de la chaîne + 10 idées de sujets.
export function buildChannelPrompt(ch) {
  return `Tu es le directeur éditorial d'une chaîne TikTok francophone.
${channelDesc(ch)}

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour) :
{
  "hashtags": [10 hashtags TikTok en minuscules SANS le symbole # : 4 génériques à gros volume adaptés au genre + 6 propres au thème de la chaîne],
  "topics": [10 idées de sujets de vidéos pour cette chaîne — chacun en une phrase accrocheuse, précise et FACTUELLE (pas de sujet vague), variés, classés du plus fort au moins fort]
}`;
}

// 10 nouvelles idées de sujets (en évitant celles déjà proposées ou produites).
export function buildTopicsPrompt(project) {
  const done = [
    ...(project.episodes || []).map((e) => e.topic || e.title),
    ...(project.topicIdeas || []),
  ].filter(Boolean);
  return `Tu es le directeur éditorial d'une chaîne TikTok francophone.
${channelDesc(project)}
${done.length > 0 ? `\nSujets déjà traités ou déjà proposés — INTERDIT de les répéter ou de les paraphraser :\n${done.map((t) => `- ${t}`).join('\n')}\n` : ''}
Réponds UNIQUEMENT avec un objet JSON valide : {"topics": [10 NOUVELLES idées de sujets, une phrase accrocheuse et factuelle chacune, variées]}`;
}

// Script complet d'une vidéo de chaîne sur un sujet donné.
export function buildChannelVideoPrompt(project, topic, number) {
  const seconds = project.targetSeconds || 90;
  const words = Math.round(seconds * 2.3);
  const sMin = Math.max(6, Math.round(seconds / 10));
  const sMax = Math.max(sMin + 2, Math.round(seconds / 7));
  return `Tu écris les vidéos d'une chaîne TikTok francophone.
${channelDesc(project)}

SUJET DE CETTE VIDÉO (n°${number}) : ${topic}

Réponds UNIQUEMENT avec un objet JSON valide (aucun texte autour) :
{
  "number": ${number},
  "title": "titre court et accrocheur de la vidéo (pas le sujet recopié)",
  "scenes": [${sMin} à ${sMax} scènes : ${sceneSchema(channelImageSuffix(project))}],
  "cliffhanger": ""
}

Contraintes STRICTES :
- NARRATEUR SEUL : toutes les répliques ont "speaker": "narrator", "characters": [] partout. C'est une voix off qui raconte, jamais un dialogue.
- STRUCTURE OBLIGATOIRE (≈ ${seconds} secondes, ≈ ${words} mots au total) :
  ■ HOOK (scène 1, 0-3 s) : la promesse choc ou la question qui interdit de scroller — jamais d'introduction molle.
  ■ DÉVELOPPEMENT en 3 à 4 blocs (~20-25 s chacun) : UNE seule idée forte par bloc, et une relance de curiosité entre les blocs (« mais ce n'est pas le pire… », « et c'est là que tout bascule »).
  ■ CHUTE (dernière scène) : l'information ou la phrase qu'on retient, PUIS un appel à l'abonnement naturel en toute fin (« abonne-toi pour la suite »).
- FACTUEL ET CLAIR : si le sujet est réel, aucune invention — des faits vérifiables racontés simplement. Phrases courtes, orales, ≤ 18 mots par réplique.
- Les "imagePrompt" sont autonomes et illustrent chaque moment du récit (lieux, objets, ambiances, silhouettes — PAS de personnage récurrent à visage constant), tous terminés par le style imposé de la chaîne.`;
}

export function buildNewFacePrompt(character, instructions, isLead = false) {
  return `Personnage d'une série micro-drama africaine : ${character.name}, ${character.gender}, ${character.age} ans, ${character.role}.
Description visuelle actuelle (EN ANGLAIS) : ${character.visual}
${
  instructions
    ? `Consignes du réalisateur pour la NOUVELLE apparence : ${instructions}`
    : `Invente une apparence NETTEMENT différente de l'actuelle (autre visage, autre coiffure, autre tenue signature), cohérente avec l'âge, le genre et le rôle.`
}${
    isLead
      ? `\nC'est le personnage PRINCIPAL de la série : la nouvelle description doit contenir OBLIGATOIREMENT ces mots anglais : ${LEAD_ADJECTIVES.join(', ')}.`
      : ''
  }
Réponds UNIQUEMENT avec un objet JSON valide : {"visual": "nouvelle description physique EN ANGLAIS, très détaillée et STABLE (âge apparent, visage, coiffure, tenue signature, corpulence)"}`;
}

export async function askClaudeForJson(prompt) {
  const first = await askClaude(prompt);
  try {
    return extractJson(first);
  } catch (e) {
    // Seconde chance : demande de correction du JSON.
    const retry = await askClaude(
      `Le JSON suivant est invalide ou incomplet (${e.message}). Renvoie UNIQUEMENT ce contenu corrigé en JSON strictement valide, sans aucun texte autour :\n\n${first.slice(0, 30000)}`,
    );
    return extractJson(retry);
  }
}
