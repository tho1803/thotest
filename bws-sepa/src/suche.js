/**
 * Oberfläche der Volltextsuche.
 *
 * Sucht über den Helfer, der das Verzeichnis auf diesem Rechner hält.
 * paperless.io selbst durchsucht nur Dokumentnamen.
 */

const $ = (id) => document.getElementById(id);

function meldung(art, text) {
  $('meldung').innerHTML = `<div class="hinweis ${art}">${text}</div>`;
}

function entschaerfe(text) {
  const feld = document.createElement('div');
  feld.textContent = String(text ?? '');
  return feld.innerHTML;
}

/** Füllt die Filterlisten aus dem, was der Bestand hergibt. */
function zeigeBestand(uebersicht) {
  if (!uebersicht || !uebersicht.dokumente) {
    $('bestandInfo').textContent = 'Noch kein Verzeichnis angelegt.';
    return;
  }
  const gebaut = uebersicht.gebautAm
    ? new Date(uebersicht.gebautAm).toLocaleString('de-DE') : '';
  $('bestandInfo').textContent =
    `${uebersicht.dokumente} Dokumente · ${uebersicht.zeichen.toLocaleString('de-DE')} Zeichen` +
    (gebaut ? ` · eingelesen am ${gebaut}` : '');

  for (const [id, werte] of [['zustand', uebersicht.zustaende], ['vorlage', uebersicht.vorlagen]]) {
    const auswahl = $(id);
    const bisher = auswahl.value;
    auswahl.innerHTML = '<option value="">alle</option>';
    for (const [name, anzahl] of werte ?? []) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = `${name} (${anzahl})`;
      auswahl.appendChild(option);
    }
    auswahl.value = bisher;
  }
}

async function einlesen() {
  $('einlesenKnopf').disabled = true;
  meldung('info', 'Der Helfer liest den Bestand ein — das kann bei vielen Dokumenten dauern …');
  try {
    const antwort = await fetch('/index-bauen');
    const daten = await antwort.json();
    if (!antwort.ok) throw new Error(daten.fehler ?? `Der Helfer meldet ${antwort.status}.`);
    zeigeBestand(daten);
    meldung('gut', `${daten.dokumente} Dokumente eingelesen. Die Suche ist bereit.`);
  } catch (fehler) {
    meldung('fehler', helferFehler(fehler));
  } finally {
    $('einlesenKnopf').disabled = false;
  }
}

function helferFehler(fehler) {
  return /Failed to fetch|NetworkError|load failed/i.test(fehler.message)
    ? 'Der Helfer antwortet nicht. Läuft er im Terminal? Zu starten mit ' +
      '<code>node helfer/paperless-helfer.mjs</code> — und diese Seite über ' +
      '<code>http://localhost:8787/suche.html</code> öffnen.'
    : fehler.message;
}

async function suchen() {
  const felder = new URLSearchParams({
    q: $('frage').value.trim(),
    zustand: $('zustand').value,
    vorlage: $('vorlage').value,
    von: $('von').value,
    bis: $('bis').value
  });

  $('suchKnopf').disabled = true;
  try {
    const antwort = await fetch(`/suche?${felder}`);
    const daten = await antwort.json();
    if (!antwort.ok) throw new Error(daten.fehler ?? `Der Helfer meldet ${antwort.status}.`);
    zeigeBestand(daten.uebersicht);
    zeigeTreffer(daten.treffer ?? []);
    meldung('gut', `${daten.treffer.length} Dokumente gefunden.`);
  } catch (fehler) {
    meldung('fehler', helferFehler(fehler));
  } finally {
    $('suchKnopf').disabled = false;
  }
}

function zeigeTreffer(treffer) {
  $('trefferKarte').classList.remove('versteckt');
  $('zahlTreffer').textContent = treffer.length;
  $('zahlStellen').textContent = treffer.reduce((s, t) => s + t.anzahl, 0);

  const behaelter = $('treffer');
  behaelter.innerHTML = '';
  if (!treffer.length) {
    behaelter.innerHTML = '<p class="hilfe">Nichts gefunden. Andere Begriffe versuchen oder die Filter lockern.</p>';
    return;
  }

  for (const t of treffer) {
    const block = document.createElement('div');
    block.style.cssText = 'border-top:1px solid var(--border-subtle,#ecf0f3); padding:12px 0';
    const stellen = t.stellen.map((s) =>
      `<div class="mono" style="font-size:.8rem; color:var(--ink-700); margin:4px 0">` +
      `${entschaerfe(s.vor)}<mark style="background:var(--sun-soft); padding:1px 3px; border-radius:3px">` +
      `${entschaerfe(s.wort)}</mark>${entschaerfe(s.nach)}</div>`).join('');

    block.innerHTML = `
      <div style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap">
        <strong>${entschaerfe(t.titel) || '(ohne Titel)'}</strong>
        <span class="marke ${t.zustand === 'completed' ? 'gut' : 'feld'}">${entschaerfe(t.zustand)}</span>
        ${t.vorlage ? `<span class="hilfe">${entschaerfe(t.vorlage)}</span>` : ''}
        ${t.erstellt ? `<span class="hilfe">${new Date(t.erstellt).toLocaleDateString('de-DE')}</span>` : ''}
        <span class="hilfe abstand">${t.anzahl} Fundstellen</span>
      </div>
      ${stellen}`;
    behaelter.appendChild(block);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  $('einlesenKnopf').addEventListener('click', einlesen);
  $('suchKnopf').addEventListener('click', suchen);
  $('allesKnopf').addEventListener('click', () => { $('frage').value = ''; suchen(); });
  $('frage').addEventListener('keydown', (e) => { if (e.key === 'Enter') suchen(); });

  try {
    const antwort = await fetch('/bestand');
    zeigeBestand(await antwort.json());
  } catch {
    $('bestandInfo').textContent = 'Der Helfer läuft nicht.';
  }
});
