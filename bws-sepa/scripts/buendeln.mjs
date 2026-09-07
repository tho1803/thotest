#!/usr/bin/env node
/**
 * Baut aus dem Projekt eine einzelne HTML-Datei.
 *
 * Sinn: Die gebündelte Datei läuft per Doppelklick, ohne Webserver. Der
 * Browser verweigert bei "file://" nur das Nachladen weiterer Dateien —
 * wenn alles in einer Datei steht, entfällt das Problem.
 *
 *   node scripts/buendeln.mjs               → bws-sepa-einzeldatei.html
 *   node scripts/buendeln.mjs api-pruefen   → api-pruefen-einzeldatei.html
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const seite = process.argv[2] ?? 'index';

/** Reihenfolge der Module: erst die ohne Abhängigkeiten. */
const MODULE = [
  'iban.js', 'sepa-text.js', 'mandate.js', 'ocr-iban.js', 'bws-formular.js',
  'windata.js', 'sepa-xml.js', 'vorlage.js', 'paperless.js', 'paperless-io.js'
];

/** Sammelt die Namen aller Exporte eines Moduls. */
function exportNamen(quelltext) {
  const namen = new Set();
  for (const treffer of quelltext.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    namen.add(treffer[1]);
  }
  for (const treffer of quelltext.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const teil of treffer[1].split(',')) {
      const name = teil.split(/\s+as\s+/).pop().trim();
      if (name) namen.add(name);
    }
  }
  return [...namen];
}

/** Entfernt import- und export-Schlüsselwörter, damit alles in einem Block läuft. */
function entkleiden(quelltext) {
  return quelltext
    .replace(/^import\s+[^;]*?;\s*$/gms, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\s)/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

const teile = [];
const namensraeume = new Map();

for (const datei of MODULE) {
  const quelltext = await readFile(join(WURZEL, 'src', datei), 'utf8');
  namensraeume.set(`./${datei}`, exportNamen(quelltext));
  teile.push(`// ---- src/${datei} ${'-'.repeat(Math.max(0, 60 - datei.length))}\n${entkleiden(quelltext)}`);
}

// Die Ablaufsteuerung zum Schluss; Namensraum-Importe werden zu Objekten.
const steuerung = seite === 'index' ? 'app.js' : `${seite}.js`;
let appQuelltext = await readFile(join(WURZEL, 'src', steuerung), 'utf8');

for (const [pfad, namen] of namensraeume) {
  const muster = new RegExp(`^import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*['"]${pfad.replace('.', '\\.')}['"];?\\s*$`, 'gm');
  appQuelltext = appQuelltext.replace(muster, (_, name) => `const ${name} = { ${namen.join(', ')} };`);
}
teile.push(`// ---- src/${steuerung} ${'-'.repeat(Math.max(0, 60 - steuerung.length))}\n${entkleiden(appQuelltext)}`);

// HTML zusammensetzen: CSS und Logo mit hinein, damit nichts nachgeladen wird.
const html = await readFile(join(WURZEL, `${seite}.html`), 'utf8');
const css = await readFile(join(WURZEL, 'assets/bws.css'), 'utf8');
const logo = await readFile(join(WURZEL, 'assets/logo/bws-logo.png'));

const fertig = html
  .replace('<link rel="stylesheet" href="assets/bws.css">', `<style>\n${css}\n</style>`)
  .replace(/src="assets\/logo\/bws-logo\.png"/g, `src="data:image/png;base64,${logo.toString('base64')}"`)
  .replace(/<script type="module" src="src\/[^"]+"><\/script>/, `<script type="module">\n${teile.join('\n\n')}\n</script>`)
  // Querverweise zwischen den Seiten zeigen auf die gebündelten Fassungen.
  .replace(/href="api-pruefen\.html"/g, 'href="api-pruefen-einzeldatei.html"')
  .replace(/href="index\.html"/g, 'href="bws-sepa-einzeldatei.html"');

const ziel = seite === 'index' ? 'bws-sepa-einzeldatei.html' : `${seite}-einzeldatei.html`;
await writeFile(join(WURZEL, ziel), fertig, 'utf8');
console.log(`${ziel} geschrieben (${Math.round(fertig.length / 1024)} KB)`);
