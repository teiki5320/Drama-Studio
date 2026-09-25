# 🎬 Drama Studio

Studio local de **micro-dramas africains** au format vertical : un clic, et l'application écrit
une série en 10 épisodes de 60 secondes (via **Claude**, avec ton abonnement — pas de clé API),
génère les **images** de chaque scène, les **voix** des personnages, puis monte l'épisode en
vidéo avec **Remotion**. Tu visionnes, tu retouches, tu valides — et tu produis l'épisode suivant.

## Prérequis (sur ton Mac)

1. **Node.js 20 ou plus** — https://nodejs.org
2. **Claude Code**, connecté à ton compte Claude (abonnement Pro/Max) :
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude          # puis /login pour te connecter
   ```
3. C'est tout. La génération d'images utilise par défaut **Pollinations.ai** (gratuit, sans clé).

## Lancer le studio

```bash
npm install        # la première fois
npm start          # construit l'interface et lance le serveur
```

Puis ouvre **http://localhost:4600** dans ton navigateur.

> Pour développer avec rechargement à chaud : `npm run dev` puis http://localhost:5173.

## Utilisation

1. **Choisis 1 à 3 styles** (Argent, Héritage, Romance, Trahison, Mystique…) et, si tu veux,
   une idée de départ. Clique **« Créer mon drama »**.
2. L'app enchaîne : scénario complet (Claude) → images de l'épisode 1 → voix de chaque réplique.
   Compte 3 à 6 minutes.
3. **Visionne l'épisode 1** instantanément dans le lecteur intégré. Pour chaque scène tu peux :
   - modifier les répliques (puis « Régénérer la voix »),
   - modifier le prompt et **régénérer l'image**, ou importer la tienne,
   - copier le prompt pour générer l'image sur **OpenArt** et la déposer ici.
4. Quand c'est bon : **« Valider et produire le MP4 »** — le rendu se fait sur ta machine
   (le fichier arrive dans `projects/<id>/renders/`).
5. **« Produire l'épisode suivant »** relance le pipeline pour l'épisode 2, et ainsi de suite
   jusqu'au 10ᵉ.

Ajoute une **musique de fond** (MP3 libre de droits) via le bouton 🎵 en haut du projet —
elle sera mixée en boucle, à bas volume, dans tous les épisodes.

## Fournisseur d'images

Copie `.env.example` vers `.env` pour configurer :

| `IMAGE_PROVIDER` | Description |
|---|---|
| `openart` | **Recommandé.** Ton compte OpenArt via son MCP officiel : meilleurs modèles (Seedream, Nano Banana…) et **visages constants** — l'app crée d'abord un portrait de référence par personnage, puis le réutilise dans chaque scène. Consomme tes crédits OpenArt. |
| `pollinations` *(défaut)* | Gratuit, sans compte. Qualité correcte, idéal pour itérer. |
| `fal` | fal.ai (modèle FLUX dev) — très bonne qualité, nécessite `FAL_KEY` (payant au volume). |
| `manual` | Aucune génération automatique : copie le prompt de chaque scène dans OpenArt, puis importe l'image dans la scène. |

### Activer OpenArt (visages constants)

```bash
# 1. Enregistrer le MCP officiel d'OpenArt dans Claude Code (une fois)
claude mcp add --transport http --scope user openart https://mcp.openart.ai/mcp
# 2. L'authentifier : lance `claude`, tape /mcp, choisis openart → Authenticate
# 3. Dans .env :
#    IMAGE_PROVIDER=openart
```

Au premier épisode, l'app génère un **portrait de référence** par personnage (visibles en haut
du projet, avec un bouton 🔄 pour les refaire), puis chaque scène est générée en passant ces
portraits comme références de visage.

## Les voix

Trois moteurs, essayés dans cet ordre en mode `auto` :

| Moteur | Qualité | Configuration |
|---|---|---|
| **ElevenLabs** | ⭐⭐⭐ studio, voix naturelles | `ELEVENLABS_API_KEY=...` dans `.env` (compte gratuit ~10 000 caractères/mois ≈ 1 saison, puis ~5 $/mois) |
| **Edge TTS** | ⭐⭐ bonnes voix neuronales | Rien — mais le service non officiel est parfois bloqué par Microsoft |
| **Voix macOS** | ⭐ à ⭐⭐ selon les voix installées | Rien. Pour un gros gain gratuit : Réglages Système → Accessibilité → Contenu énoncé → Voix du système → **télécharger les voix françaises « Premium » / « Enhanced »** (Audrey, Thomas, Aurélie, Nicolas, Amélie…). L'app choisit automatiquement la meilleure variante installée. |

Chaque personnage garde une voix distincte (selon son genre) quel que soit le moteur.

## Notes techniques

- **Claude** est appelé en mode headless (`claude -p`) : la génération de scénario passe par
  ton abonnement, dans les limites d'usage de ton forfait.
- **Rendu vidéo** : Remotion (`@remotion/renderer`), H.264 1080×1920, 30 i/s. Le premier rendu
  télécharge un navigateur headless (~150 Mo), les suivants sont directs.
- **Stockage** : tout est sur ton disque, dans `projects/` (un dossier par drama).
- Les épisodes durent ~60 s : la durée exacte s'adapte automatiquement aux voix générées.

## Structure du code

```
server/          Serveur Express : pipeline (Claude → images → voix), rendu Remotion, API
src/             Interface React (Vite)
src/remotion/    Composition vidéo partagée entre l'aperçu (Player) et le rendu final
shared/          Catalogue des styles (source unique front + serveur)
projects/        Tes dramas (créé automatiquement, non versionné)
```

## Storyboard (découpage en plans)

Depuis la version storyboard, la production interne d'un drama insère une étape entre le
scénario et les images : **Claude découpe chaque épisode en 12-18 plans** (plan large,
champ/contrechamp, gros plan, insert) — un seul appel Claude, aucun crédit image/voix.
Chaque plan porte sa durée cible, son lieu, ses personnages et, s'il y en a une, SA réplique
(pointée par `lineIndex` — la voix reste générée par réplique). La production itère ensuite
par plan : une image par plan (références visages + décor du lieu), un clip pour les seuls
plans animés retenus, la synchro labiale calée sur la réplique du plan. Le réglage
**« 🎬 Plans animés/épisode »** plafonne les clips payants : priorité aux plans avec
réplique, puis au cliffhanger, puis aux autres. Le montage enchaîne les plans en coupes
franches (image fixe = zoom lent), et « 🎬 Refaire le storyboard » redécoupe l'épisode.
Les épisodes produits avant cette version restent lus et montés comme avant (une scène = une image).

## 🍲 Format Recettes (Alohash)

Le 4ᵉ format transforme une recette du site **Alohash** en vidéo verticale de 45 s à 1 min 30.

1. **Crée un atelier** (« 🍲 Recettes » sur l'écran d'accueil) : son nom, sa voix, son ton
   (chaleureux, street food, gourmand) et sa durée par défaut. Le nom devient le dossier iCloud.
2. **Importe une recette** : la liste déroulante est remplie depuis le `sitemap.xml` du site
   (46 recettes) — avec recherche. L'app lit le bloc JSON-LD `schema.org/Recipe` de la fiche
   (ingrédients, étapes, temps, photo). Un formulaire manuel sert de repli si la fiche n'est
   pas lisible.
3. **Claude écrit le script** en 6 à 10 plans : accroche sur le plat fini, titre (plat + pays +
   temps), ingrédients affichés ligne par ligne (les produits rares sont mis en avant), une
   étape par plan, plat fini, puis « Recette complète et produits rares sur alohash.fr ».
4. **Production** identique aux autres formats : images (style culinaire sombre et chaud, mains
   sans visage), 2-3 plans clés animés en clip si OpenArt est actif, voix off du narrateur,
   aperçu dans le lecteur, rendu MP4. La photo du site peut servir telle quelle pour le plat
   fini (aucun crédit).
5. **Export** : dossier au nom de l'atelier, nom de fichier = plat + pays + accroche + hashtags
   (`#recetteafricaine #cuisineafricaine #<pays> #<plat> #fyp #pourtoi`).

**Aucune allégation de santé** n'est autorisée dans les textes générés : la consigne est dans le
prompt, et une vérification bloque le rendu en nommant le mot fautif (santé, bienfaits, digestion,
vitamines, détox…). On parle de goût, de texture et de tradition.

Source réglable dans `.env` : `RECIPE_SITE_URL` (défaut `https://teiki5320.github.io/alohash`).
