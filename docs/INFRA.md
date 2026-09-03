# INFRA — fiche technique

Généré le 21 août 2026 par un scan du dépôt. Pour mettre à jour : relancer ce même prompt.

## Vue d'ensemble

- **Plateforme** : application web 100 % locale sur macOS — serveur Express + interface React sur `127.0.0.1:4600`, lancée par le raccourci Bureau `Drama Studio.command`
- **Stack** : Node.js ≥ 20, Express 4, React 18, Vite 5, Remotion 4 (rendu MP4 vertical 1080×1920, 30 fps)
- **Backend** : aucun serveur distant — données en JSON local (`projects/`, gitignoré), jobs de production en mémoire, aucun compte utilisateur
- **Distribution** : dépôt GitHub public `teiki5320/Drama-Studio`, mise à jour automatique par `git pull` à chaque lancement du raccourci
- **IA** : Claude (scénarios, sans clé API), OpenArt via MCP (images + clips vidéo, visages constants), ElevenLabs (voix FR), fal.ai (synchro labiale, optionnel)
- **Particularités** : 3 versions au choix (normale 10×60 s · Synchro lèvres animées · Format long 30-60×40 s) ; export auto des MP4 vers iCloud Drive avec nom de fichier = description TikTok prête

### 1. GitHub

- **Rôle** : hébergement du code source et canal de mise à jour (le lanceur fait `git pull` au démarrage). Développement par sessions Claude Code (branches `claude/*` fusionnées dans `main`).
- **Console** : https://github.com/teiki5320/Drama-Studio (anciennement `teiki5320/bd`, redirection GitHub active)
- **Identifiants publics** : compte `teiki5320`, dépôt public, branche par défaut `main`.
- **Secrets** : aucun secret dans le dépôt. `.env`, `projects/` et `studio/` sont gitignorés. L'accès en écriture passe par la session git configurée sur le Mac (identifiants gérés par macOS/keychain).
- **Coût** : gratuit.

### 2. Anthropic — Claude Code

- **Rôle** : écriture des scénarios, personnages, hashtags et régénérations (commande `claude -p` en mode headless, JSON structuré) ; pilote aussi le MCP OpenArt pour toutes les générations d'images/vidéos.
- **Console** : https://claude.ai (abonnement) — CLI installée via `npm i -g @anthropic-ai/claude-code`.
- **Identifiants publics** : néant (outil local).
- **Secrets** : aucune clé API — authentification par la session Claude Code du Mac (`claude` puis `/login`, jeton OAuth géré par Claude Code, jamais dans le dépôt ni dans `.env`).
- **Coût** : inclus dans l'abonnement Claude existant (aucune facturation à l'usage).

### 3. OpenArt

- **Rôle** : génération des images (portraits de référence puis scènes, pour des visages constants) et des clips vidéo image-to-video (nombre et durée réglables par drama ; modèles chers Pro/Master/Omni interdits par prompt).
- **Console** : https://openart.ai (solde de crédits visible dans l'appli, panneau « Coûts »).
- **Identifiants publics** : MCP officiel `https://mcp.openart.ai/mcp`, enregistré via `claude mcp add --transport http --scope user openart …`.
- **Secrets** : authentification OAuth une seule fois via `claude` → `/mcp` → openart ; le jeton vit dans la configuration Claude Code du Mac. Variables optionnelles (sans secret) dans `~/bd/.env` : `IMAGE_PROVIDER=openart`, `OPENART_MCP_NAME`, `OPENART_VIDEO_MODEL`.
- **Coût** : crédits à l'usage — ordre de grandeur ~4-15 crédits/image, ~15-60 crédits/clip vidéo 5 s (mode Éco par défaut).

### 4. ElevenLabs

- **Rôle** : voix off et dialogues en français (modèle multilingual v2, langue ancrée par contexte anti-accent anglais) ; casting automatique par Claude depuis un catalogue de 11 voix validées, narrateur et voix modifiables par personnage dans l'appli.
- **Console** : https://elevenlabs.io (solde affiché dans l'appli avec jauge).
- **Identifiants publics** : néant.
- **Secrets** : `ELEVENLABS_API_KEY` dans `~/bd/.env` sur le Mac (fichier gitignoré, jamais commité). La clé se régénère sur elevenlabs.io → profil → API Keys.
- **Coût** : plan gratuit actuel — 10 000 crédits/mois (1 caractère = 1 crédit, ≈ 850 crédits par épisode 60 s). Replis gratuits intégrés si indisponible : Edge TTS puis voix macOS `say` (signalés dans l'appli).

### 5. fal.ai

- **Rôle** : synchronisation labiale du Format long (clip + piste voix des personnages → lèvres animées, modèle `fal-ai/sync-lipsync` par défaut) ; peut aussi servir de fournisseur d'images (`IMAGE_PROVIDER=fal`, FLUX).
- **Console** : https://fal.ai/dashboard (clés : https://fal.ai/dashboard/keys).
- **Identifiants publics** : néant.
- **Secrets** : `FAL_KEY` dans `~/bd/.env` (gitignoré). Variable optionnelle sans secret : `FAL_LIPSYNC_MODEL`.
- **Coût** : à l'usage (~0,10-0,50 $ par clip synchronisé). **Statut : pas encore activé** — le Format long affiche un rappel tant que la clé est absente.

### 6. iCloud Drive

- **Rôle** : rangement automatique des épisodes validés — un dossier par drama, nom de fichier = « Épisode N — Titre #hashtags » (description TikTok pré-remplie à l'import). Trois racines : `Dramas`, `Dramas Synchro`, `Dramas Long`.
- **Console** : https://www.icloud.com (ou le Finder → iCloud Drive).
- **Identifiants publics** : compte Apple du Mac.
- **Secrets** : aucun — accès par la session iCloud du Mac. Variable sans secret dans `~/bd/.env` : `EXPORT_DIR` (chemin personnalisé, `~/` accepté ; actuellement le dossier `01 TOA CORP/04 APPLIS/04 DRAMA/Dramas`).
- **Coût** : inclus dans le forfait iCloud+ existant.
