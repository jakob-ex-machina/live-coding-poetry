/* =====================================================================
   Live Coding Poetry – script.js
   Reines Vanilla-JavaScript, keine Bibliotheken.

   Ablauf in Kurzform:
   1. init() lädt die Wortliste (words.json) und bindet alle Ereignisse.
   2. Beim Tippen wird mit 300 ms Debounce parseInput() aufgerufen.
   3. renderOutput() vergleicht jede Zeile per Hash mit dem letzten Stand:
      unveränderte Zeilen bleiben (samt Timern, Wörtern, hold-Zustand),
      geänderte Zeilen werden neu gebaut, entfernte Zeilen aufgeräumt.
   ===================================================================== */

'use strict';

/* ---------------------------------------------------------------------
   Zentrales Zustandsobjekt – die einzige globale Variable.
   --------------------------------------------------------------------- */
const appState = {
  // Feste Einstellungen
  config: {
    shuffleIntervalMs: 10000,                 // Wortwechsel alle 10 Sekunden
    debounceMs: 300,                          // Wartezeit nach dem letzten Tastendruck
    wordsUrl: './words.json',                 // relativer Pfad (GitHub Pages!)
    storageKey: 'liveCodingPoetry.customWords',
    maxWordLength: 60,
    // Notfall-Wortliste, falls words.json nicht geladen werden kann
    fallbackWords: [
      'Haus', 'Baum', 'Fluss', 'Sonne', 'Mond', 'Nebel', 'Stein', 'Wind',
      'Anna', 'Berlin', 'Stille', 'Fenster', 'Meer', 'Schatten', 'Licht',
      'Brücke', 'Herbst', 'Glas', 'Echo', 'Wolke'
    ]
  },

  // Alle festen Operatoren: Befehlsname + Wert in Anführungszeichen -> Ausgabetext
  operators: [
    { command: 'equality-operator',    symbol: '==', text: 'wie' },
    { command: 'comparison-operator',  symbol: '>',  text: 'größer als' },
    { command: 'comparison-operator',  symbol: '<',  text: 'kleiner als' },
    { command: 'comparison-operator',  symbol: '>=', text: 'größer oder gleich' },
    { command: 'comparison-operator',  symbol: '<=', text: 'kleiner oder gleich' },
    { command: 'similarity-operator',  symbol: '~',  text: 'ähnlich wie' },
    { command: 'analogy-operator',     symbol: '~~', text: 'so wie' },
    { command: 'addition-operator',    symbol: '+',  text: 'und' },
    { command: 'alternative-operator', symbol: '||', text: 'oder' },
    { command: 'negation-operator',    symbol: '!=', text: 'anders als' },
    { command: 'sequence-operator',    symbol: '>>', text: 'dann' }
  ],

  baseWords: [],          // Wörter aus words.json (oder Fallback)
  customWords: [],        // selbst hinzugefügte Wörter (localStorage)
  wordsLoaded: false,     // erst danach werden shuffle-words aktiv
  usingFallback: false,   // true, wenn words.json nicht geladen werden konnte

  lineRecords: [],        // Zustand jeder gerenderten Zeile (siehe buildLineRecord)
  renderTimerId: null,    // ID des Debounce-Timers
  dom: {}                 // zwischengespeicherte DOM-Elemente
};


/* =====================================================================
   A) START
   ===================================================================== */

/** Einstiegspunkt: DOM merken, Cheat Sheet bauen, Wörter laden, Events binden. */
function init() {
  cacheDomElements();
  buildCheatSheet();

  appState.customWords = loadCustomWords();
  renderChips();
  updateStatus();

  bindEvents();
  renderOutput(parseInput(appState.dom.codeInput.value));

  loadBaseWords(); // asynchron – aktiviert danach alle shuffle-words
}

/** Holt alle benötigten Elemente einmal und legt sie in appState.dom ab. */
function cacheDomElements() {
  const byId = (id) => document.getElementById(id);
  appState.dom = {
    codeInput:     byId('code-input'),
    output:        byId('output'),
    clearBtn:      byId('clear-btn'),
    copyBtn:       byId('copy-btn'),
    wordForm:      byId('word-form'),
    wordInput:     byId('word-input'),
    wordFeedback:  byId('word-feedback'),
    chipList:      byId('chip-list'),
    resetWordsBtn: byId('reset-words-btn'),
    statusText:    byId('status-text'),
    loader:        byId('loader'),
    cheatBody:     byId('cheat-body')
  };
}

/** Verbindet Buttons und Eingabefelder mit ihren Funktionen. */
function bindEvents() {
  const dom = appState.dom;
  dom.codeInput.addEventListener('input', scheduleRender);
  dom.clearBtn.addEventListener('click', handleClear);
  dom.copyBtn.addEventListener('click', handleCopy);
  dom.wordForm.addEventListener('submit', handleAddWord);
  dom.resetWordsBtn.addEventListener('click', handleResetWords);
}


/* =====================================================================
   B) PARSER – aus Text werden Zeilen mit Tokens
   ===================================================================== */

/**
 * Zerlegt den kompletten Text in Zeilen.
 * Jede Zeile bekommt: source (Originaltext), hash und tokens.
 * Leerer Text ergibt eine leere Liste (= leere Ausgabe).
 */
function parseInput(text) {
  if (text === '') return [];
  return text.split(/\r\n|\r|\n/).map((source) => ({
    source: source,
    hash: hashString(source),
    tokens: parseLine(source)
  }));
}

/**
 * Zerlegt EINE Zeile in Tokens:
 *   { type: 'text' | 'shuffle' | 'br' | 'operator' | 'error', value }
 *
 * Der Regex erlaubt in Anführungszeichen auch < und >:
 *   <name>   oder   <name: "wert">
 */
function parseLine(lineText) {
  const tokens = [];
  const commandRegex = /<([a-z][a-z0-9-]*)(?:\s*:\s*"([^"]*)")?\s*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = commandRegex.exec(lineText)) !== null) {
    // Normaler Text vor dem Befehl bleibt unverändert erhalten
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: lineText.slice(lastIndex, match.index) });
    }
    tokens.push(commandToToken(match[1], match[2]));
    lastIndex = commandRegex.lastIndex;
  }

  // Restlicher Text nach dem letzten Befehl
  if (lastIndex < lineText.length) {
    tokens.push({ type: 'text', value: lineText.slice(lastIndex) });
  }
  return tokens;
}

/** Wandelt einen erkannten Befehl (Name + optionaler Wert) in ein Token um. */
function commandToToken(rawName, value) {
  const name = rawName.toLowerCase();

  if (name === 'shuffle-words') return { type: 'shuffle' };
  if (name === 'br')            return { type: 'br' };

  // Gehört der Name zu einem Operator?
  const candidates = appState.operators.filter((op) => op.command === name);
  if (candidates.length > 0) {
    const operator = candidates.find((op) => op.symbol === value);
    if (operator) return { type: 'operator', value: operator.text };
    const shown = (value === undefined) ? '(fehlt)' : '"' + value + '"';
    return { type: 'error', value: '[Ungültiger Wert für ' + name + ': ' + shown + ']' };
  }

  return { type: 'error', value: '[Unbekannter Befehl: ' + rawName + ']' };
}

/** Einfacher String-Hash (djb2). Reicht, um geänderte Zeilen zu erkennen. */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + '-' + str.length;
}


/* =====================================================================
   C) RENDERN – nur geänderte Zeilen neu aufbauen
   ===================================================================== */

/** Debounce: wartet 300 ms nach dem letzten Tastendruck, dann wird gerendert. */
function scheduleRender() {
  clearTimeout(appState.renderTimerId);
  appState.renderTimerId = setTimeout(() => {
    renderOutput(parseInput(appState.dom.codeInput.value));
  }, appState.config.debounceMs);
}

/**
 * Gleicht die neuen Zeilen mit dem letzten Stand ab:
 *  - gleicher Hash  -> alte Zeile (mit Timern und Zuständen) wiederverwenden
 *  - neuer Hash     -> Zeile neu bauen
 *  - nicht mehr benötigte alte Zeilen -> Timer stoppen (kein Timer-Leck!)
 */
function renderOutput(lines) {
  const oldRecords = appState.lineRecords;
  const used = new Array(oldRecords.length).fill(false);
  const newRecords = [];

  lines.forEach((line, index) => {
    // 1. Versuch: dieselbe Position hat denselben Hash
    let found = -1;
    if (index < oldRecords.length && !used[index] && oldRecords[index].hash === line.hash) {
      found = index;
    } else {
      // 2. Versuch: irgendeine noch freie alte Zeile mit gleichem Hash
      //    (so bleibt der Zustand auch erhalten, wenn oben eine Zeile eingefügt wird)
      found = oldRecords.findIndex((record, i) => !used[i] && record.hash === line.hash);
    }

    if (found >= 0) {
      used[found] = true;
      newRecords.push(oldRecords[found]);
    } else {
      newRecords.push(buildLineRecord(line));
    }
  });

  // Alle nicht wiederverwendeten alten Zeilen aufräumen
  oldRecords.forEach((record, i) => {
    if (!used[i]) destroyLineRecord(record);
  });

  appState.lineRecords = newRecords;

  // DOM nur anfassen, wenn sich die Reihenfolge/Anzahl wirklich geändert hat
  const output = appState.dom.output;
  const unchanged =
    output.children.length === newRecords.length &&
    newRecords.every((record, i) => output.children[i] === record.element);
  if (!unchanged) {
    output.replaceChildren(...newRecords.map((record) => record.element));
  }
}

/**
 * Baut das DOM für eine Zeile. Ergebnis ("Zeilen-Datensatz"):
 *   hash      – Hash des Quelltextes
 *   element   – das <div class="line">
 *   instances – alle shuffle-Instanzen dieser Zeile
 *   parts     – Texte/Instanzen in Reihenfolge (für "Ausgabe kopieren")
 */
function buildLineRecord(line) {
  const element = document.createElement('div');
  element.className = 'line';
  const record = { hash: line.hash, element: element, instances: [], parts: [] };

  line.tokens.forEach((token) => {
    switch (token.type) {
      case 'text': {
        const span = createTextSpan('text', token.value);
        element.appendChild(span);
        record.parts.push(token.value);
        break;
      }
      case 'br': {
        element.appendChild(document.createElement('br'));
        record.parts.push('\n');
        break;
      }
      case 'operator': {
        element.appendChild(createTextSpan('operator', token.value));
        record.parts.push(' ' + token.value + ' ');
        break;
      }
      case 'error': {
        // Fehler sieht man im Gedicht, landet aber nicht in der Kopie
        element.appendChild(createTextSpan('error', token.value));
        break;
      }
      case 'shuffle': {
        const instance = createShuffleInstance();
        element.appendChild(instance.wrapper);
        record.instances.push(instance);
        record.parts.push(instance);
        break;
      }
    }
  });

  return record;
}

/** Erzeugt ein <span> mit sicherem Text (textContent statt innerHTML). */
function createTextSpan(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

/** Räumt eine Zeile auf: alle Timer stoppen, Element entfernen. */
function destroyLineRecord(record) {
  record.instances.forEach(stopTimer);
  record.element.remove();
}


/* =====================================================================
   D) SHUFFLE-INSTANZEN – ein Zufallswort mit eigenem Timer + hold
   ===================================================================== */

/**
 * Erzeugt eine unabhängige Instanz mit eigenem Zustand:
 *   currentWord, held, intervalId, active (= Wortliste ist geladen)
 */
function createShuffleInstance() {
  const wrapper = document.createElement('span');
  wrapper.className = 'shuffle';

  const wordEl = document.createElement('span');
  wordEl.className = 'shuffle-word';

  const holdBtn = document.createElement('button');
  holdBtn.type = 'button';
  holdBtn.className = 'hold-btn';

  wrapper.append(wordEl, holdBtn);

  const instance = {
    wrapper: wrapper,
    wordEl: wordEl,
    holdBtn: holdBtn,
    currentWord: '',
    held: false,
    intervalId: null,
    active: false
  };

  holdBtn.addEventListener('click', () => toggleHold(instance));
  updateHoldUi(instance);

  if (appState.wordsLoaded) {
    activateShuffleInstance(instance);
  } else {
    // Wortliste lädt noch: Platzhalter, Button gesperrt, kein Timer
    wordEl.textContent = '…';
    holdBtn.disabled = true;
  }
  return instance;
}

/** Schaltet eine Instanz scharf: erstes Wort setzen und Timer starten. */
function activateShuffleInstance(instance) {
  instance.active = true;
  instance.holdBtn.disabled = false;
  setInstanceWord(instance, pickRandomWord(null));
  startTimer(instance);
}

/** Aktiviert nach dem Laden alle bereits gerenderten, noch inaktiven Instanzen. */
function activateAllInstances() {
  appState.lineRecords.forEach((record) => {
    record.instances.forEach((instance) => {
      if (!instance.active) activateShuffleInstance(instance);
    });
  });
}

/** Startet (oder startet neu) den 10-Sekunden-Timer einer Instanz. */
function startTimer(instance) {
  stopTimer(instance); // niemals zwei Timer pro Instanz
  instance.intervalId = setInterval(() => {
    setInstanceWord(instance, pickRandomWord(instance.currentWord));
  }, appState.config.shuffleIntervalMs);
}

/** Stoppt den Timer einer Instanz (sicher, auch wenn keiner läuft). */
function stopTimer(instance) {
  if (instance.intervalId !== null) {
    clearInterval(instance.intervalId);
    instance.intervalId = null;
  }
}

/** hold-Button: einfrieren bzw. wieder laufen lassen (mit frischem Intervall). */
function toggleHold(instance) {
  instance.held = !instance.held;
  if (instance.held) {
    stopTimer(instance);
  } else {
    startTimer(instance);
  }
  updateHoldUi(instance);
}

/** Aktualisiert Beschriftung und Aussehen des hold-Buttons. */
function updateHoldUi(instance) {
  instance.holdBtn.textContent = instance.held ? 'held' : 'hold';
  instance.holdBtn.title = instance.held ? 'Wieder rotieren lassen' : 'Wort einfrieren';
  instance.holdBtn.setAttribute('aria-pressed', String(instance.held));
  instance.wrapper.classList.toggle('is-held', instance.held);
}

/** Zeigt ein Wort an und merkt es sich; kleine Einblend-Animation. */
function setInstanceWord(instance, word) {
  instance.currentWord = word;
  instance.wordEl.textContent = word;
  instance.wordEl.classList.remove('flash');
  void instance.wordEl.offsetWidth; // erzwingt Neuberechnung, damit die Animation neu startet
  instance.wordEl.classList.add('flash');
}

/** Wählt ein zufälliges Wort, möglichst nicht das aktuelle. */
function pickRandomWord(currentWord) {
  const words = getAllWords();
  if (words.length === 0) return '…';
  if (words.length === 1) return words[0];
  const candidates = words.filter((word) => word !== currentWord);
  return candidates[Math.floor(Math.random() * candidates.length)];
}


/* =====================================================================
   E) WORTLISTE – laden, eigene Wörter verwalten
   ===================================================================== */

/** Basisliste + eigene Wörter, ohne Duplikate. */
function getAllWords() {
  return Array.from(new Set(appState.baseWords.concat(appState.customWords)));
}

/** Lädt ./words.json; bei Fehlern greift die Inline-Fallback-Liste. */
async function loadBaseWords() {
  setLoading(true);
  try {
    const response = await fetch(appState.config.wordsUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('words.json ist kein Array');

    const words = data
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (words.length === 0) throw new Error('words.json enthält keine Wörter');

    appState.baseWords = words;
    appState.usingFallback = false;
  } catch (error) {
    console.warn('Wortliste konnte nicht geladen werden:', error);
    appState.baseWords = appState.config.fallbackWords.slice();
    appState.usingFallback = true;
  }

  appState.wordsLoaded = true;
  setLoading(false);
  updateStatus();
  activateAllInstances(); // jetzt dürfen die Wörter rotieren
}

/** Zeigt/versteckt den Ladebalken. */
function setLoading(isLoading) {
  appState.dom.loader.hidden = !isLoading;
  if (isLoading) {
    appState.dom.statusText.textContent = 'Lade Wortliste …';
    appState.dom.statusText.classList.remove('is-warning');
  }
}

/** Aktualisiert die Statusleiste (Wortanzahl bzw. Fallback-Hinweis). */
function updateStatus() {
  const dom = appState.dom;
  if (!appState.wordsLoaded) {
    dom.statusText.textContent = 'Lade Wortliste …';
    return;
  }
  const total = getAllWords().length;
  if (appState.usingFallback) {
    dom.statusText.textContent =
      '⚠ Wortliste konnte nicht geladen werden, nutze Fallback (' + total + ' Wörter)';
    dom.statusText.classList.add('is-warning');
  } else {
    dom.statusText.textContent =
      'Wortliste geladen: ' + total + ' Wörter (davon ' + appState.customWords.length + ' eigene)';
    dom.statusText.classList.remove('is-warning');
  }
}

/** Liest eigene Wörter aus dem localStorage (fehlertolerant). */
function loadCustomWords() {
  try {
    const raw = localStorage.getItem(appState.config.storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((entry) => typeof entry === 'string' && entry.trim() !== '');
  } catch (error) {
    return [];
  }
}

/** Schreibt eigene Wörter in den localStorage (z. B. im privaten Modus kann das scheitern). */
function saveCustomWords() {
  try {
    localStorage.setItem(appState.config.storageKey, JSON.stringify(appState.customWords));
  } catch (error) {
    console.warn('Eigene Wörter konnten nicht gespeichert werden:', error);
  }
}

/** Fügt ein Wort hinzu. Gibt { ok, message } zurück. */
function addCustomWord(rawWord) {
  const word = rawWord.trim().replace(/\s+/g, ' ');
  if (word === '') return { ok: false, message: 'Bitte ein Wort eingeben.' };
  if (word.length > appState.config.maxWordLength) {
    return { ok: false, message: 'Maximal ' + appState.config.maxWordLength + ' Zeichen.' };
  }
  if (getAllWords().includes(word)) {
    return { ok: false, message: '„' + word + '" ist schon in der Wortliste.' };
  }

  appState.customWords.push(word);
  saveCustomWords();
  renderChips();
  updateStatus();
  return { ok: true, message: '„' + word + '" hinzugefügt.' };
}

/** Entfernt ein eigenes Wort. */
function removeCustomWord(word) {
  appState.customWords = appState.customWords.filter((entry) => entry !== word);
  saveCustomWords();
  renderChips();
  updateStatus();
}

/** Zeichnet die Chips der eigenen Wörter (Sonderzeichen sicher per textContent). */
function renderChips() {
  const list = appState.dom.chipList;
  list.replaceChildren();

  appState.customWords.forEach((word) => {
    const chip = document.createElement('li');
    chip.className = 'chip';

    const label = document.createElement('span');
    label.textContent = word;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'chip-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', 'Wort „' + word + '" entfernen');
    removeBtn.addEventListener('click', () => removeCustomWord(word));

    chip.append(label, removeBtn);
    list.appendChild(chip);
  });

  appState.dom.resetWordsBtn.disabled = appState.customWords.length === 0;
}

/** Zeigt eine kurze Rückmeldung unter dem Wort-Formular. */
function showFeedback(message, isError) {
  appState.dom.wordFeedback.textContent = message;
  appState.dom.wordFeedback.classList.toggle('is-error', Boolean(isError));
}


/* =====================================================================
   F) EVENT-HANDLER FÜR BUTTONS
   ===================================================================== */

/** Formular "Wort hinzufügen". */
function handleAddWord(event) {
  event.preventDefault();
  const result = addCustomWord(appState.dom.wordInput.value);
  showFeedback(result.message, !result.ok);
  if (result.ok) {
    appState.dom.wordInput.value = '';
  }
  appState.dom.wordInput.focus();
}

/** "eigene Wörter zurücksetzen" – die Basisliste bleibt unberührt. */
function handleResetWords() {
  if (appState.customWords.length === 0) return;
  if (!window.confirm('Alle selbst hinzugefügten Wörter löschen?')) return;
  appState.customWords = [];
  saveCustomWords();
  renderChips();
  updateStatus();
  showFeedback('Eigene Wörter zurückgesetzt.', false);
}

/** "Eingabe leeren": Textarea leeren und Ausgabe sofort aufräumen. */
function handleClear() {
  clearTimeout(appState.renderTimerId);
  appState.dom.codeInput.value = '';
  renderOutput(parseInput(''));
  appState.dom.codeInput.focus();
}

/** "Ausgabe kopieren": Gedicht als Klartext in die Zwischenablage. */
async function handleCopy() {
  const text = getOutputText();
  let success = false;
  try {
    await navigator.clipboard.writeText(text);
    success = true;
  } catch (error) {
    success = fallbackCopy(text);
  }
  flashButtonLabel(appState.dom.copyBtn, success ? 'Kopiert ✓' : 'Fehlgeschlagen', 1500);
}

/** Baut den Klartext der Ausgabe aus den aktuellen Zeilen-Datensätzen. */
function getOutputText() {
  const text = appState.lineRecords
    .map((record) =>
      record.parts
        .map((part) => (typeof part === 'string' ? part : ' ' + part.currentWord + ' '))
        .join('')
    )
    .join('\n');
  // Doppelte Leerzeichen und Leerzeichen an Zeilenrändern aufräumen
  return text.replace(/ {2,}/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

/** Ersatzlösung fürs Kopieren, falls navigator.clipboard nicht verfügbar ist. */
function fallbackCopy(text) {
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
  helper.remove();
  return ok;
}

/** Zeigt kurz einen anderen Button-Text und stellt danach das Original wieder her. */
function flashButtonLabel(button, label, durationMs) {
  const original = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = original;
  button.textContent = label;
  setTimeout(() => { button.textContent = original; }, durationMs);
}


/* =====================================================================
   G) CHEAT SHEET – wird aus denselben Daten gebaut wie der Parser
   ===================================================================== */

/** Füllt die Cheat-Sheet-Tabelle (eine Quelle der Wahrheit = appState.operators). */
function buildCheatSheet() {
  const rows = [
    { code: '<shuffle-words>', desc: 'Zufallswort (wechselt alle 10 s, mit hold)' },
    { code: '<br>',            desc: 'Zeilenumbruch' }
  ];
  appState.operators.forEach((op) => {
    rows.push({ code: '<' + op.command + ': "' + op.symbol + '">', desc: op.text });
  });

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const tdCode = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = row.code;
    tdCode.appendChild(code);
    const tdDesc = document.createElement('td');
    tdDesc.textContent = row.desc;
    tr.append(tdCode, tdDesc);
    appState.dom.cheatBody.appendChild(tr);
  });
}


/* =====================================================================
   Los geht's
   ===================================================================== */
init();


/* =====================================================================
   MANUELLE TESTS – bitte nacheinander ausprobieren
   (Zum Testen lokal einen kleinen Server nutzen, siehe Anleitung.)

    1. Textarea leer lassen            -> Ausgabe leer, Platzhalter, keine Fehler in der Konsole.
    2. <shuffle-words>                 -> ein Wort; nach 10 s neues Wort; hold/held funktioniert.
    3. <shuffle-words><equality-operator: "=="><shuffle-words>
                                       -> Wort, "wie", Wort; zwei hold-Buttons, unabhängig.
    4. Vergleiche: <comparison-operator: ">">  "<"  ">="  "<="
                                       -> größer als / kleiner als / größer oder gleich / kleiner oder gleich.
    5. <br>                            -> Zeilenumbruch in der Ausgabe.
    6. Mehrere Zeilen im Textarea      -> mehrzeilige Ausgabe (auch Leerzeilen).
    7. Mein <shuffle-words> ist <shuffle-words>
                                       -> Text dazwischen bleibt erhalten.
    8. <foo>                           -> roter Text "[Unbekannter Befehl: foo]", Rest der Zeile normal.
    9. Bei zwei Wörtern: eines halten  -> nur dieses friert ein, das andere rotiert weiter.
   10. Eigenes Wort hinzufügen         -> Chip erscheint, Wort taucht später in der Auswahl auf,
                                          nach Reload (F5) ist es noch da. "×" und "zurücksetzen" testen.
   11. Zwei Zeilen schreiben, bei einer shuffle-Zeile "hold" klicken, dann in der ANDEREN Zeile
       weitertippen                    -> Wort und hold-Zustand der ersten Zeile bleiben erhalten.
   12. words.json umbenennen/löschen   -> Hinweis "Wortliste konnte nicht geladen werden, nutze Fallback",
                                          App läuft mit 20 Beispielwörtern.

   Zusatz: Im Browser-Entwicklerwerkzeug (F12) zeigt die Konsole bei Test 12 eine Warnung – das ist gewollt.
   ===================================================================== */
