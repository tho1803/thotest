/**
 * Ablaufsteuerung der Oberfläche.
 *
 * Grundsatz: Es gibt keinen Server. Mandatsdaten leben nur in dieser
 * Variablen, solange die Seite offen ist. Gespeichert werden ausschließlich
 * die Stammdaten des Vereins — niemals Bankdaten von Eltern und niemals der
 * Paperless-Token.
 */

import { PaperlessClient, ausJsonExport, felddefinitionenAusJson } from './paperless.js';
import {
  extrahiereMandate, baueFeldIndex, zuDeutschemDatum, mandatAusStrukturiertenFeldern
} from './mandate.js';
import {
  PaperlessIoClient, sammleFeldpfade, schlageZuordnungVor, mandatAusFeldern, listeAus
} from './paperless-io.js';
import { baueWindataCsv, dateiname } from './windata.js';
import { baueSepaXml } from './sepa-xml.js';
import { fuelleVorlage } from './vorlage.js';
import * as bwsFormular from './bws-formular.js';

const SPEICHER_SCHLUESSEL = 'bws-sepa-stammdaten';
const ZUORDNUNG_SCHLUESSEL = 'bws-sepa-feldzuordnung';

/** Die Angaben, die für einen Lastschrifteinzug gebraucht werden. */
const ZUORDNUNGSZIELE = [
  ['kontoinhaber', 'Kontoinhaber*in'],
  ['iban', 'IBAN'],
  ['bic', 'BIC (freiwillig)'],
  ['mandatsId', 'Mandatsreferenz'],
  ['mandatsDatum', 'Mandatsdatum'],
  ['kind', 'Name des Kindes'],
  ['betrag', 'Betrag (freiwillig)']
];
const $ = (id) => document.getElementById(id);

let client = null;
let ioClient = null;
let mandate = [];
let feldpfade = [];
let zuordnung = {};

/* ---------- Stammdaten (ohne Personenbezug) ------------------------------ */

const STAMMFELDER = ['paperlessUrl', 'ioUrl', 'agName', 'agIban', 'agBic', 'agGlaeubigerId', 'vwzVorlage'];

function ladeStammdaten() {
  try {
    const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return;
    const daten = JSON.parse(roh);
    for (const feld of STAMMFELDER) {
      if (daten[feld] !== undefined && $(feld)) $(feld).value = daten[feld];
    }
    if (daten.tagName) $('tagAuswahl').dataset.gemerkt = daten.tagName;
  } catch {
    /* Ein defekter Eintrag darf die Seite nicht blockieren. */
  }
}

function speichereStammdaten() {
  const daten = {};
  for (const feld of STAMMFELDER) daten[feld] = $(feld)?.value ?? '';
  const tag = $('tagAuswahl');
  daten.tagName = tag.options[tag.selectedIndex]?.textContent ?? '';
  try {
    localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
  } catch {
    /* Privates Fenster o. Ä. — kein Grund abzubrechen. */
  }
}

/* ---------- kleine Helfer ------------------------------------------------ */

function meldung(behaelter, art, text) {
  $(behaelter).innerHTML = `<div class="hinweis ${art}">${text}</div>`;
}

/** Kürzt einen Befundtext für die Tabelle; der volle Text steht im Tooltip. */
function kurz(text, laenge = 30) {
  const sauber = String(text ?? '');
  return sauber.length <= laenge ? sauber : `${sauber.slice(0, laenge - 1).trimEnd()}…`;
}

function euro(betrag) {
  return Number(betrag || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function lade(dateiInhalt, name, typ) {
  const blob = new Blob([dateiInhalt], { type: typ });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function auftraggeber() {
  return {
    name: $('agName').value.trim(),
    iban: $('agIban').value.trim(),
    bic: $('agBic').value.trim(),
    glaeubigerId: $('agGlaeubigerId').value.trim()
  };
}

/* ---------- Quelle umschalten ------------------------------------------- */

function zeigeQuelle() {
  const gewaehlt = $('quelle').value;
  $('quelleIo').classList.toggle('versteckt', gewaehlt !== 'io');
  $('quelleDatei').classList.toggle('versteckt', gewaehlt !== 'datei');
  $('quelleNgx').classList.toggle('versteckt', gewaehlt !== 'ngx');
  if (gewaehlt !== 'io') $('zuordnungKarte').classList.add('versteckt');
}

/* ---------- Schritt 1: paperless.io ------------------------------------- */

function ladeZuordnung() {
  try {
    const roh = localStorage.getItem(ZUORDNUNG_SCHLUESSEL);
    zuordnung = roh ? JSON.parse(roh) : {};
  } catch {
    zuordnung = {};
  }
}

function speichereZuordnung() {
  try {
    localStorage.setItem(ZUORDNUNG_SCHLUESSEL, JSON.stringify(zuordnung));
  } catch {
    /* Privates Fenster — kein Grund abzubrechen. */
  }
}

/** Baut die Auswahllisten für die Feldzuordnung. */
function zeigeZuordnung() {
  const behaelter = $('zuordnungFelder');
  behaelter.innerHTML = '';

  for (const [ziel, beschriftung] of ZUORDNUNGSZIELE) {
    const feld = document.createElement('div');
    const auswahl = feldpfade.map((f) =>
      `<option value="${f.pfad}" ${zuordnung[ziel] === f.pfad ? 'selected' : ''}>` +
      `${f.pfad} — ${f.beispiel}</option>`).join('');
    feld.innerHTML = `
      <label for="zu_${ziel}">${beschriftung}</label>
      <select id="zu_${ziel}" data-ziel="${ziel}">
        <option value="">— nicht zugeordnet —</option>
        ${auswahl}
      </select>`;
    behaelter.appendChild(feld);
  }

  behaelter.addEventListener('change', (ereignis) => {
    const ziel = ereignis.target.dataset.ziel;
    if (!ziel) return;
    zuordnung[ziel] = ereignis.target.value;
    speichereZuordnung();
  });

  $('zuordnungKarte').classList.remove('versteckt');
}

async function ioVerbinden() {
  const url = $('ioUrl').value.trim();
  const token = $('ioToken').value.trim();
  if (!url || !token) {
    meldung('ladeMeldung', 'warnung', 'Adresse und Token werden beide gebraucht.');
    return;
  }

  $('ioVerbindenKnopf').disabled = true;
  meldung('ladeMeldung', 'info', 'Verbindung wird geprüft …');
  try {
    ioClient = new PaperlessIoClient(url, token);
    const { probe } = await ioClient.pruefeVerbindung();
    const erstes = listeAus(probe)[0];
    if (!erstes) {
      meldung('ladeMeldung', 'warnung',
        'Die Verbindung steht, aber es kam kein Dokument zurück. Liegt in paperless.io ' +
        'schon ein ausgefülltes Mandat?');
      return;
    }

    feldpfade = sammleFeldpfade(erstes);
    if (!Object.keys(zuordnung).length) zuordnung = schlageZuordnungVor(feldpfade);
    zeigeZuordnung();
    $('ioLadenKnopf').disabled = false;
    meldung('ladeMeldung', 'gut',
      `Verbunden. Im ersten Dokument stecken ${feldpfade.length} Felder — bitte unten zuordnen.`);
    speichereStammdaten();
  } catch (fehler) {
    ioClient = null;
    meldung('ladeMeldung', 'fehler', fehler.message);
  } finally {
    $('ioVerbindenKnopf').disabled = false;
  }
}

async function ioMandateLaden() {
  if (!ioClient) return;
  if (!zuordnung.iban) {
    meldung('ladeMeldung', 'warnung', 'Ohne zugeordnete IBAN geht es nicht.');
    return;
  }

  $('ioLadenKnopf').disabled = true;
  meldung('ladeMeldung', 'info', 'Mandate werden geladen …');
  try {
    const dokumente = await ioClient.holeDokumente({
      beiFortschritt: (anzahl) => meldung('ladeMeldung', 'info', `Mandate werden geladen … ${anzahl}`)
    });
    mandate = dokumente
      .map((d) => mandatAusStrukturiertenFeldern(d, mandatAusFeldern(d, zuordnung)))
      .sort((a, b) => a.kontoinhaber.localeCompare(b.kontoinhaber, 'de'));
    zeigeMandate();
    meldung('ladeMeldung', 'gut', `${mandate.length} Mandate aus paperless.io gelesen.`);
  } catch (fehler) {
    meldung('ladeMeldung', 'fehler', fehler.message);
  } finally {
    $('ioLadenKnopf').disabled = false;
  }
}

/* ---------- Schritt 1: paperless-ngx ------------------------------------ */

async function verbinden() {
  const url = $('paperlessUrl').value.trim();
  const token = $('paperlessToken').value.trim();
  if (!url || !token) {
    meldung('ladeMeldung', 'warnung', 'Adresse und Token werden beide gebraucht.');
    return;
  }

  $('verbindenKnopf').disabled = true;
  meldung('ladeMeldung', 'info', 'Verbindung wird geprüft …');
  try {
    client = new PaperlessClient(url, token);
    const { dokumenteGesamt } = await client.pruefeVerbindung();
    const tags = await client.holeTags();

    const auswahl = $('tagAuswahl');
    auswahl.innerHTML = '<option value="">— Tag wählen —</option>';
    for (const tag of tags.sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
      const option = document.createElement('option');
      option.value = tag.id;
      option.textContent = tag.name;
      auswahl.appendChild(option);
    }
    // Zuletzt benutzten Tag wieder auswählen, sonst nach "SEPA" oder "Mandat" suchen.
    const gemerkt = auswahl.dataset.gemerkt;
    const treffer = [...auswahl.options].find((o) =>
      (gemerkt && o.textContent === gemerkt) || /sepa|mandat/i.test(o.textContent));
    if (treffer) auswahl.value = treffer.value;

    $('ladenKnopf').disabled = false;
    meldung('ladeMeldung', 'gut',
      `Verbunden. Paperless kennt ${dokumenteGesamt} Dokumente und ${tags.length} Tags.`);
    speichereStammdaten();
  } catch (fehler) {
    client = null;
    meldung('ladeMeldung', 'fehler', fehler.message);
  } finally {
    $('verbindenKnopf').disabled = false;
  }
}

async function mandateLaden() {
  const tagId = $('tagAuswahl').value;
  if (!client) return;
  if (!tagId) {
    meldung('ladeMeldung', 'warnung', 'Bitte zuerst den Tag auswählen, der die Mandate kennzeichnet.');
    return;
  }

  $('ladenKnopf').disabled = true;
  meldung('ladeMeldung', 'info', 'Dokumente werden geladen …');
  try {
    const felder = await client.holeCustomFields();
    const dokumente = await client.holeDokumente({
      tagId,
      beiFortschritt: (geladen, gesamt) =>
        meldung('ladeMeldung', 'info', `Dokumente werden geladen … ${geladen} von ${gesamt}`)
    });
    mandate = extrahiereMandate(dokumente, { feldIndex: baueFeldIndex(felder) });
    zeigeMandate();
    speichereStammdaten();
  } catch (fehler) {
    meldung('ladeMeldung', 'fehler', fehler.message);
  } finally {
    $('ladenKnopf').disabled = false;
  }
}

function jsonGeladen(ereignis) {
  const datei = ereignis.target.files?.[0];
  if (!datei) return;
  const leser = new FileReader();
  leser.onload = () => {
    try {
      const roh = String(leser.result);
      const dokumente = ausJsonExport(roh);
      const feldIndex = baueFeldIndex(felddefinitionenAusJson(roh));
      mandate = extrahiereMandate(dokumente, { feldIndex, bwsFormular });
      zeigeMandate();
      meldung('ladeMeldung', 'gut', `${mandate.length} Dokumente aus der Datei gelesen.`);
    } catch (fehler) {
      meldung('ladeMeldung', 'fehler', fehler.message);
    }
  };
  leser.readAsText(datei);
}

/* ---------- Schritt 3: Tabelle ------------------------------------------ */

function zeigeMandate() {
  const koerper = $('tabellenkoerper');
  koerper.innerHTML = '';

  mandate.forEach((mandat, index) => {
    const zeile = document.createElement('tr');
    if (!mandat.uebernehmen) zeile.className = 'nichtuebernehmen';

    const marke = (art, text) =>
      `<span class="marke ${art}" title="${text.replace(/"/g, '')}">${kurz(text)}</span>`;
    const marken = [
      ...mandat.fehler.map((f) => marke('fehler', f)),
      ...mandat.hinweise.map((h) => marke('pruefen', h))
    ];
    const befund = marken.length ? marken.join(' ') : '<span class="marke gut">vollständig</span>';
    const herkunft = mandat.quelle.iban === 'feld'
      ? '<span class="marke feld">Feld</span>' : '';

    zeile.innerHTML = `
      <td><input type="checkbox" data-rolle="auswahl" data-index="${index}" ${mandat.uebernehmen ? 'checked' : ''}></td>
      <td>${mandat.kontoinhaber || '<em>fehlt</em>'}</td>
      <td>${mandat.kind || ''}</td>
      <td class="mono">${mandat.iban || '<em>fehlt</em>'} ${herkunft}</td>
      <td class="mono">${mandat.bic || ''}</td>
      <td class="mono">${mandat.mandatsId || '<em>fehlt</em>'}</td>
      <td class="mono">${zuDeutschemDatum(mandat.mandatsDatum) || '<em>fehlt</em>'}</td>
      <td><input type="number" step="0.01" min="0" data-rolle="betrag" data-index="${index}"
                 value="${mandat.betrag ?? ''}"></td>
      <td><select data-rolle="sequenz" data-index="${index}">
            ${['RCUR', 'FRST', 'OOFF', 'FNAL'].map((s) =>
              `<option ${mandat.sequenz === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></td>
      <td><input type="text" data-rolle="vwz" data-index="${index}" value="${mandat.verwendungszweck ?? ''}"></td>
      <td>${befund}</td>`;
    koerper.appendChild(zeile);
  });

  $('laufKarte').classList.remove('versteckt');
  $('tabellenKarte').classList.remove('versteckt');
  $('ausgabeKarte').classList.remove('versteckt');
  aktualisiereZahlen();
}

function ausgewaehlteIndizes() {
  return [...document.querySelectorAll('[data-rolle="auswahl"]')]
    .filter((k) => k.checked)
    .map((k) => Number(k.dataset.index));
}

function aktualisiereZahlen() {
  const gewaehlt = ausgewaehlteIndizes();
  const summe = gewaehlt.reduce((s, i) => s + (Number(mandate[i].betrag) || 0), 0);
  $('zahlGesamt').textContent = mandate.length;
  $('zahlAusgewaehlt').textContent = gewaehlt.length;
  $('zahlSumme').textContent = euro(summe);
  $('zahlProblem').textContent = mandate.filter((m) => m.fehler.length).length;
  $('zahlPruefen').textContent = mandate.filter((m) => !m.fehler.length && m.hinweise.length).length;
}

/** Trägt Betrag, Sequenz und Verwendungszweck aus Schritt 2 in die Auswahl ein. */
function laufUebernehmen() {
  const betrag = Number.parseFloat($('standardBetrag').value);
  const sequenz = $('standardSequenz').value;
  const termin = $('termin').value;
  const vorlage = $('vwzVorlage').value;
  const gewaehlt = ausgewaehlteIndizes();

  if (!gewaehlt.length) {
    meldung('ausgabeMeldung', 'warnung', 'Es ist keine Zeile ausgewählt.');
    return;
  }

  for (const index of gewaehlt) {
    const mandat = mandate[index];
    if (Number.isFinite(betrag) && betrag > 0) mandat.betrag = betrag;
    mandat.sequenz = sequenz;
    mandat.verwendungszweck = fuelleVorlage(vorlage, mandat, termin);
  }
  zeigeMandate();
  for (const index of gewaehlt) {
    const kaestchen = document.querySelector(`[data-rolle="auswahl"][data-index="${index}"]`);
    if (kaestchen) kaestchen.checked = true;
  }
  aktualisiereZahlen();
  meldung('ausgabeMeldung', 'gut', `${gewaehlt.length} Zeilen übernommen.`);
}

/* ---------- Schritt 4: Ausgabe ------------------------------------------ */

function sammlePosten() {
  const termin = $('termin').value;
  const zahlart = $('zahlart').value;
  return ausgewaehlteIndizes().map((index) => {
    const mandat = mandate[index];
    return {
      name: mandat.kontoinhaber,
      iban: mandat.iban,
      bic: mandat.bic,
      betrag: mandat.betrag,
      termin,
      zahlart,
      verwendungszweck: mandat.verwendungszweck || fuelleVorlage($('vwzVorlage').value, mandat, termin),
      mandatsId: mandat.mandatsId,
      mandatsDatum: mandat.mandatsDatum,
      sequenz: mandat.sequenz,
      refId: mandat.mandatsId
    };
  });
}

function fehlerAnzeigen(ergebnis, art) {
  if (!ergebnis.fehler.length) {
    meldung('ausgabeMeldung', 'gut',
      `${art} erzeugt: ${ergebnis.anzahl} Lastschriften über ${euro(ergebnis.summe)}.`);
    return;
  }
  const liste = ergebnis.fehler
    .map((f) => `<li><strong>${f.name}</strong>: ${f.fehler.join('; ')}</li>`).join('');
  meldung('ausgabeMeldung', ergebnis.anzahl ? 'warnung' : 'fehler',
    `${art}: ${ergebnis.anzahl} Lastschriften über ${euro(ergebnis.summe)} übernommen. ` +
    `<strong>${ergebnis.fehler.length} Zeilen wurden ausgelassen:</strong><ul>${liste}</ul>`);
}

function csvErzeugen(nurVorschau = false) {
  const posten = sammlePosten();
  if (!posten.length) {
    meldung('ausgabeMeldung', 'warnung', 'Es ist keine Zeile ausgewählt.');
    return null;
  }
  const ergebnis = baueWindataCsv(auftraggeber(), posten, { version: $('csvVersion').value });
  fehlerAnzeigen(ergebnis, 'windata-CSV');
  if (ergebnis.anzahl && !nurVorschau) {
    lade(ergebnis.csv, dateiname($('termin').value, 'Elternbeitrag'), 'text/csv;charset=utf-8');
    speichereStammdaten();
  }
  return ergebnis;
}

function xmlErzeugen() {
  const posten = sammlePosten();
  if (!posten.length) {
    meldung('ausgabeMeldung', 'warnung', 'Es ist keine Zeile ausgewählt.');
    return;
  }
  const ergebnis = baueSepaXml(auftraggeber(), posten);
  fehlerAnzeigen(ergebnis, 'SEPA-XML');
  if (ergebnis.anzahl) {
    const name = dateiname($('termin').value, 'Elternbeitrag').replace(/\.csv$/, '.xml');
    lade(ergebnis.xml, name, 'application/xml;charset=utf-8');
    speichereStammdaten();
  }
}

function vorschau() {
  const ergebnis = csvErzeugen(true);
  if (!ergebnis) return;
  const feld = $('vorschau');
  feld.textContent = ergebnis.csv.split('\r\n').slice(0, 12).join('\n');
  feld.classList.remove('versteckt');
}

/* ---------- Verdrahtung -------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  ladeStammdaten();
  // Die Gläubiger-Identifikationsnummer steht auf jedem Mandat der
  // BildungsWerkstatt; sie wird vorbelegt, bleibt aber änderbar.
  if (!$('agGlaeubigerId').value) $('agGlaeubigerId').value = bwsFormular.GLAEUBIGER_ID;
  const heute = new Date();
  $('termin').value = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + 7)
    .toISOString().slice(0, 10);

  ladeZuordnung();
  zeigeQuelle();
  $('quelle').addEventListener('change', zeigeQuelle);
  $('ioVerbindenKnopf').addEventListener('click', ioVerbinden);
  $('ioLadenKnopf').addEventListener('click', ioMandateLaden);
  $('zuordnungZuruecksetzen').addEventListener('click', () => {
    zuordnung = schlageZuordnungVor(feldpfade);
    speichereZuordnung();
    zeigeZuordnung();
    meldung('ladeMeldung', 'gut', 'Die Zuordnung wurde auf den Vorschlag zurückgesetzt.');
  });
  $('verbindenKnopf').addEventListener('click', verbinden);
  $('ladenKnopf').addEventListener('click', mandateLaden);
  $('jsonDatei').addEventListener('change', jsonGeladen);
  $('uebernehmenKnopf').addEventListener('click', laufUebernehmen);
  $('csvKnopf').addEventListener('click', () => csvErzeugen(false));
  $('xmlKnopf').addEventListener('click', xmlErzeugen);
  $('vorschauKnopf').addEventListener('click', vorschau);

  $('alleWaehlen').addEventListener('click', () => {
    document.querySelectorAll('[data-rolle="auswahl"]').forEach((k) => { k.checked = true; });
    aktualisiereZahlen();
  });
  $('keineWaehlen').addEventListener('click', () => {
    document.querySelectorAll('[data-rolle="auswahl"]').forEach((k) => { k.checked = false; });
    aktualisiereZahlen();
  });
  $('nurEinziehbare').addEventListener('click', () => {
    document.querySelectorAll('[data-rolle="auswahl"]').forEach((k) => {
      k.checked = mandate[Number(k.dataset.index)].uebernehmen;
    });
    aktualisiereZahlen();
  });
  $('nurGepruefte').addEventListener('click', () => {
    document.querySelectorAll('[data-rolle="auswahl"]').forEach((k) => {
      k.checked = mandate[Number(k.dataset.index)].einwandfrei;
    });
    aktualisiereZahlen();
  });

  $('stammdatenLoeschen').addEventListener('click', () => {
    localStorage.removeItem(SPEICHER_SCHLUESSEL);
    meldung('ausgabeMeldung', 'gut', 'Die gespeicherten Vereinsangaben wurden gelöscht.');
  });

  for (const feld of ['agName', 'agIban', 'agBic', 'agGlaeubigerId', 'vwzVorlage']) {
    $(feld).addEventListener('change', speichereStammdaten);
  }

  // Änderungen in der Tabelle direkt in die Daten zurückschreiben.
  $('tabellenkoerper').addEventListener('input', (ereignis) => {
    const ziel = ereignis.target;
    const index = Number(ziel.dataset.index);
    if (Number.isNaN(index)) return;
    if (ziel.dataset.rolle === 'betrag') mandate[index].betrag = Number.parseFloat(ziel.value);
    if (ziel.dataset.rolle === 'sequenz') mandate[index].sequenz = ziel.value;
    if (ziel.dataset.rolle === 'vwz') mandate[index].verwendungszweck = ziel.value;
    aktualisiereZahlen();
  });
  $('tabellenkoerper').addEventListener('change', aktualisiereZahlen);
});
