#!/bin/bash
# Doppelklick auf diese Datei holt die Mandate aus paperless.io.
#
# Sie muss im selben Ordner liegen wie mandate-holen.mjs.
# Beim ersten Mal einmal das Ausführungsrecht setzen:
#     chmod +x "Mandate holen.command"

cd "$(dirname "$0")" || exit 1

echo "──────────────────────────────────────────────────────────────"
echo "  SEPA-Mandate aus paperless.io holen"
echo "  BildungsWerkstatt e.V."
echo "──────────────────────────────────────────────────────────────"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node ist auf diesem Rechner nicht installiert."
  echo "Zu holen unter https://nodejs.org — die Fassung mit \"LTS\"."
  echo
  read -r -p "Mit der Eingabetaste schließen. "
  exit 1
fi

if [ ! -f mandate-holen.mjs ]; then
  echo "mandate-holen.mjs liegt nicht in diesem Ordner:"
  echo "   $(pwd)"
  echo
  echo "Beide Dateien gehören in denselben Ordner."
  echo
  read -r -p "Mit der Eingabetaste schließen. "
  exit 1
fi

node mandate-holen.mjs
ERGEBNIS=$?

echo
if [ $ERGEBNIS -eq 0 ]; then
  echo "Fertig. Die Datei mandate.json liegt in diesem Ordner:"
  echo "   $(pwd)"
  echo
  echo "Sie jetzt in der Oberfläche öffnen:"
  echo "   bws-sepa-einzeldatei.html doppelklicken"
  echo "   oben \"Datei — Scan oder Export\" wählen"
  echo "   \"Datei öffnen\" klicken und mandate.json auswählen"
  echo
  echo "Nach dem Einlesen mandate.json löschen — sie enthält Bankdaten."
fi

echo
read -r -p "Mit der Eingabetaste schließen. "
