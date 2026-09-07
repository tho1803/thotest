#!/usr/bin/env bash
# Hebt diesen Ordner in ein eigenes GitHub-Repository.
#
# Voraussetzung: unter github.com/new ist ein leeres, privates Repository
# angelegt worden (ohne README, ohne .gitignore, ohne Lizenz).
#
#   ./scripts/init-repo.sh git@github.com:tho1803/bws-sepa.git

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Aufruf: $0 <URL des leeren Repositories>" >&2
  exit 1
fi

VERZEICHNIS="$(cd "$(dirname "$0")/.." && pwd)"
cd "$VERZEICHNIS"

if [ -d .git ]; then
  echo "Hier liegt bereits ein Git-Repository." >&2
  exit 1
fi

git init -b main
git add .
git commit -m "SEPA-Mandate aus Paperless in eine windata-Importdatei überführen"
git remote add origin "$1"
git push -u origin main

echo
echo "Fertig. Das Repository liegt jetzt unter $1"
