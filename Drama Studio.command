#!/bin/bash
# ──────────────────────────────────────────────
#  🎬 Drama Studio — double-clique pour lancer
# ──────────────────────────────────────────────
# Le studio se trouve tout seul : on part du dossier qui contient ce
# fichier. Range-le où tu veux (~/bd, ~/apps/drama-studio, ailleurs…),
# tant que ce raccourci reste dedans, il retrouve son chemin.
DIR="$(cd "$(dirname "$0")" && pwd -P)"

if [ ! -f "$DIR/package.json" ]; then
  echo "❌ Ce raccourci doit rester DANS le dossier de Drama Studio."
  echo "   Dossier lu : $DIR"
  echo "   (pour un raccourci sur le Bureau, fais un alias : glisse le fichier"
  echo "    en maintenant ⌘ + ⌥, ne le déplace pas.)"
  read -r -p "Appuie sur Entrée pour fermer…"
  exit 1
fi

cd "$DIR" || exit 1

echo "🔄 Mise à jour de Drama Studio…"
git pull --ff-only 2>/dev/null || echo "   (mise à jour ignorée)"
npm install --no-audit --no-fund >/dev/null 2>&1 || true

# Libère le port si un ancien serveur tourne encore
lsof -ti tcp:4600 | xargs kill 2>/dev/null

# Ouvre le navigateur dès que le serveur répond
(
  until curl -s -o /dev/null http://localhost:4600/api/health; do sleep 1; done
  open "http://localhost:4600"
) &

echo ""
echo "🎬 Lancement… laisse cette fenêtre ouverte pendant que tu utilises le studio."
echo "   (pour arrêter : ferme cette fenêtre, ou Ctrl+C)"
echo ""
npm start
