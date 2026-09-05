# PUBLICATION — état des boutiques

> Généré le 5 septembre 2026 d'après les consoles. Pour mettre à jour :
> relancer ce même prompt.
>
> **Aucun secret ici** — uniquement des références publiques :
> identifiants d'app, numéros de version, liens de console.

## Vue d'ensemble

- **iOS / Android** : non concernés — Drama Studio n'est présent sur aucune boutique d'applications, et rien dans le dépôt ne prépare un empaquetage mobile ou desktop (pas de Capacitor, Expo, Electron ou Tauri)
- **macOS** : outil local hors boutiques — distribué par clonage du dépôt GitHub + lanceur `Drama Studio.command` (mise à jour par `git pull` à chaque démarrage)
- **Web** : serveur local uniquement (`localhost:4600`), accès iPad via Tailscale — aucun hébergement public
- **Version commune** : `0.1.0` (`package.json`, nom de paquet `drama-studio`) — pas de numérotation de boutique
- **Identifiant** : aucun identifiant de bundle — l'app n'est pas empaquetée ; dépôt <https://github.com/teiki5320/Drama-Studio>
- **Monétisation** : aucune monétisation directe de l'outil ; à terme, récompenses créateurs sur les plateformes de diffusion (voir `docs/MARKETING.md`)
- **Chemin critique** : ce ne sont pas des boutiques d'applications qui publient ce produit, mais des plateformes vidéo — la prochaine marche est la **première publication TikTok** des séries déjà exportées

L'application elle-même est un outil interne : elle ne se soumet nulle
part et n'attend l'examen de personne. Ce qui se publie, ce sont les
épisodes qu'elle produit (MP4 verticaux, nom de fichier = titre +
hashtags, déposés dans iCloud). L'état « boutiques » de ce produit se
lit donc sur les plateformes de diffusion, TikTok en tête.

---

### 1. macOS · Hors boutiques (outil local)

| | |
|---|---|
| État | **En production locale — aucune boutique visée** |
| Console | aucune — dépôt <https://github.com/teiki5320/Drama-Studio> |
| Version publiée | sans objet (jamais distribuée hors du Mac de l'auteur) |
| Version en cours | `0.1.0`, branche `main`, mise à jour continue |
| Distribution | `git clone` + lanceur `Drama Studio.command` (git pull + npm install + démarrage à chaque lancement) |

**Ce qui bloque.** Rien : c'est un choix. L'outil tourne sur le Mac mini
de l'auteur (Node + Express + Vite/React + Remotion) et se met à jour
tout seul au lancement. Ni notarisation, ni Mac App Store, ni
empaquetage `.app` ne sont préparés dans le dépôt.

**Prochaine action.** Aucune côté boutique. Si un jour l'outil devait
être distribué à d'autres machines, il faudrait choisir un empaquetage
(Electron/Tauri ou simple script d'installation) — décision non prise,
non planifiée.

---

### 2. Web

| | |
|---|---|
| État | **Local uniquement — aucun hébergement public** |
| Console | aucune (pas d'hébergeur, pas de domaine) |
| Version publiée | sans objet |
| Version en cours | `0.1.0` servie sur `http://localhost:4600` |
| Distribution | serveur Express local ; accès distant privé via Tailscale (`HOST=0.0.0.0`, pilotage depuis l'iPad) |

**Ce qui bloque.** Rien à publier : l'interface web est le poste de
pilotage de l'outil, pas un produit à héberger. Elle dépend de services
et de clés installés sur le Mac (Claude Code, OpenArt via MCP,
ElevenLabs, fal.ai) — la mettre en ligne n'aurait pas de sens en l'état.

**Prochaine action.** Aucune.

---

### 3. TikTok · Diffusion des contenus

| | |
|---|---|
| État | **Rien de publié à ce jour** (`docs/MARKETING.md` : canal TikTok ⬜) |
| Console | <https://www.tiktok.com/tiktokstudio> — état du compte à vérifier dans la console |
| Version publiée | aucune vidéo publiée |
| Version en cours | 4 séries exportées prêtes à publier : « Ma Sœur, Mon Poison », « Le Contrat de Bassam », « La Reine du Plateau », « La Fille aux Poulets » — plus « La Tache du Trône » (Format long, en production) |
| Distribution | publication manuelle depuis iCloud Drive (`…/04 DRAMA/Dramas…`) — le nom de fichier pré-remplit la description TikTok (titre + hashtags) |

**Ce qui bloque.** Une décision de stratégie de compte, pas un travail :
une chaîne TikTok par série, ou une chaîne « studio » unique
(`docs/MARKETING.md`, décision non prise). Le nombre de comptes,
leur nom et leur état de vérification sont à vérifier dans la console.

**Prochaine action.** Publier les 3 premiers épisodes d'une série déjà
exportée et noter les premières métriques réelles — c'est la première
étape du plan marketing, toujours en attente. Le Format long
(épisodes tout vidéo, lèvres synchronisées) vise ensuite le programme de
récompenses créateurs (vidéos de plus d'une minute à privilégier).

**Autres canaux envisagés** (tous ⬜ dans `docs/MARKETING.md`) : YouTube
Shorts, Instagram Reels, Facebook Reels — aucune console ouverte à ce
jour, à vérifier le moment venu.
