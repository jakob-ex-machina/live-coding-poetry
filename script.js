/* =====================================================================
   Live Coding Poetry – script.js
   Vollständig, inkl. buildCheatButtons() (war in der letzten Version
   versehentlich verloren gegangen – dadurch startete die App nicht).
   ===================================================================== */

'use strict';

/* ---------------------------------------------------------------------
   Zentrales Zustandsobjekt – die einzige globale Variable.
   --------------------------------------------------------------------- */
const appState = {
  config: {
    shuffleIntervalMs: 10000,
    debounceMs: 300,
    wordsUrl: './words.json',
    storageKey: 'liveCodingPoetry.customWords',
    maxWordLength: 60,
    fallbackWords: [
      'Haus', 'Baum', 'Fluss', 'Sonne', 'Mond', 'Nebel', 'Stein', 'Wind',
      'Anna', 'Berlin', 'Stille', 'Fenster', 'Meer', 'Schatten', 'Licht',
      'Brücke', 'Herbst', 'Glas', 'Echo', 'Wolke'
    ]
  },

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

  baseWords: [],
  customWords: [],
  wordsLoaded: false,
  usingFallback: false,

  lineRecords: [],
  renderTimerId: null,
  dom: {}
};


/* =====================================================================
   A) START
   ===================================================================== */
function init() {
  cacheDomElements();
  buildCheatButtons();     // <-- war vorher nicht definiert

  appState.customWords = loadCustomWords();
  renderChips();
  updateStatus();

  bindEvents();
  renderOutput(parseInput(appState.dom.codeInput.value));

  loadBaseWords();
}

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
    cheatButtons:  byId('cheat-buttons')
  };
}

function bindEvents() {
  const dom = appState.dom;
  dom.codeInput.addEventListener('input', scheduleRender);
  dom.clearBtn.addEventListener('click', handleClear);
  dom.copyBtn.addEventListener('click', handleCopy);
  dom.wordForm.addEventListener('submit', handleAddWord);
  dom.resetWordsBtn.addEventListener('click', handleResetWords);
}


/* =====================================================================
   A2) CHEAT-SHEET-BUTTONS – fügen Befehl an Cursor-Position ein
   ===================================================================== */
function buildCheatButtons() {
  const container = appState.dom.cheatButtons;
  if (!container) return;
  container.replaceChildren();

  // Baustein-Liste: shuffle, br und alle Operatoren
  const items = [
    { code: '<shuffle-words>', label: 'shuffle-words' },
    { code: '<br>',            label: 'br' }
  ];
  appState.operators.forEach((op) => {
    items.push({ code: '<' + op.command + ': "' + op.symbol + '">', label: op.text });
  });

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cheat-btn';
    btn.textContent = item.code;
    btn.title = item.label;
    btn.addEventListener('click', () => insertAtCursor(item.code));
    container.appendChild(btn);
  });
}

/** Fügt Text an der aktuellen Cursor-Position im Code-Feld ein. */
function insertAtCursor(text) {
  const input = appState.dom.codeInput;
  const start = input.selectionStart ?? input.value.length;
  const end   = input.selectionEnd   ?? input.value.length;
  const before = input.value.slice(0, start);
  const after  = input.value.slice(end);
  input.value = before + text + after;
  const newPos = start + text.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  scheduleRender();
}


/* =====================================================================
   B) PARSER
   ===================================================================== */
function parseInput(text) {
  if (text === '') return [];
  return text.split(/\r\n|\r|\n/).map((source) => ({
    source: source,
    hash: hashString(source),
    tokens: parseLine(source)
  }));
}

function parseLine(lineText) {
  const tokens = [];
  const commandRegex = /<([a-z][a-z0-9-]*)(?:\s*:\s*"([^"]*)")?\s*>/gi;
  let lastIndex = 0;
  let match;

  while ((match = commandRegex.exec(lineText)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: lineText.slice(lastIndex, match.index) });
    }
    tokens.push(commandToToken(match[1], match[2]));
    lastIndex = commandRegex.lastIndex;
  }

  if (lastIndex < lineText.length) {
    tokens.push({ type: 'text', value: lineText.slice(lastIndex) });
  }
  return tokens;
}

function commandToToken(rawName, value) {
  const name = rawName.toLowerCase();

  if (name === 'shuffle-words') return { type: 'shuffle' };
  if (name === 'br')            return { type: 'br' };

  const candidates = appState.operators.filter((op) => op.command === name);
  if (candidates.length > 0) {
    const operator = candidates.find((op) => op.symbol === value);
    if (operator) return { type: 'operator', value: operator.text };
    const shown = (value === undefined) ? '(fehlt)' : '"' + value + '"';
    return { type: 'error', value: '[Ungültiger Wert für ' + name + ': ' + shown + ']' };
  }

  return { type: 'error', value: '[Unbekannter Befehl: ' + rawName + ']' };
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36) + '-' + str.length;
}


/* =====================================================================
   C) RENDERN
   ===================================================================== */
function scheduleRender() {
  clearTimeout(appState.renderTimerId);
  appState.renderTimerId = setTimeout(() => {
    renderOutput(parseInput(appState.dom.codeInput.value));
  }, appState.config.debounceMs);
}

function renderOutput(lines) {
  const oldRecords = appState.lineRecords;
  const used = new Array(oldRecords.length).fill(false);
  const newRecords = [];

  lines.forEach((line, index) => {
    let found = -1;
    if (index < oldRecords.length && !used[index] && oldRecords[index].hash === line.hash) {
      found = index;
    } else {
      found = oldRecords.findIndex((record, i) => !used[i] && record.hash === line.hash);
    }

    if (found >= 0) {
      used[found] = true;
      newRecords.push(oldRecords[found]);
    } else {
      newRecords.push(buildLineRecord(line));
    }
  });

  oldRecords.forEach((record, i) => {
    if (!used[i]) destroyLineRecord(record);
  });

  appState.lineRecords = newRecords;

  const output = appState.dom.output;
  const unchanged =
    output.children.length === newRecords.length &&
    newRecords.every((record, i) => output.children[i] === record.element);
  if (!unchanged) {
    output.replaceChildren(...newRecords.map((record) => record.element));
  }
}

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

function createTextSpan(className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function destroyLineRecord(record) {
  record.instances.forEach(stopTimer);
  record.element.remove();
}


/* =====================================================================
   D) SHUFFLE-INSTANZEN
   ===================================================================== */
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
    wordEl.textContent = '…';
    holdBtn.disabled = true;
  }
  return instance;
}

function activateShuffleInstance(instance) {
  instance.active = true;
  instance.holdBtn.disabled = false;
  setInstanceWord(instance, pickRandomWord(null));
  startTimer(instance);
}

function activateAllInstances() {
  appState.lineRecords.forEach((record) => {
    record.instances.forEach((instance) => {
      if (!instance.active) activateShuffleInstance(instance);
    });
  });
}

function startTimer(instance) {
  stopTimer(instance);
  instance.intervalId = setInterval(() => {
    setInstanceWord(instance, pickRandomWord(instance.currentWord));
  }, appState.config.shuffleIntervalMs);
}

function stopTimer(instance) {
  if (instance.intervalId !== null) {
    clearInterval(instance.intervalId);
    instance.intervalId = null;
  }
}

function toggleHold(instance) {
  instance.held = !instance.held;
  if (instance.held) {
    stopTimer(instance);
  } else {
    startTimer(instance);
  }
  updateHoldUi(instance);
}

function updateHoldUi(instance) {
  instance.holdBtn.textContent = instance.held ? 'HELD' : 'HOLD';
  instance.holdBtn.title = instance.held ? 'Wieder rotieren lassen' : 'Wort einfrieren';
  instance.holdBtn.setAttribute('aria-pressed', String(instance.held));
  instance.wrapper.classList.toggle('is-held', instance.held);
}

function setInstanceWord(instance, word) {
  instance.currentWord = word;
  instance.wordEl.textContent = word;
  instance.wordEl.classList.remove('flash');
  void instance.wordEl.offsetWidth;
  instance.wordEl.classList.add('flash');
}

function pickRandomWord(currentWord) {
  const words = getAllWords();
  if (words.length === 0) return '…';
  if (words.length === 1) return words[0];
  const candidates = words.filter((word) => word !== currentWord);
  return candidates[Math.floor(Math.random() * candidates.length)];
}


/* =====================================================================
   E) WORTLISTE
   ===================================================================== */
function getAllWords() {
  return Array.from(new Set(appState.baseWords.concat(appState.customWords)));
}

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
  activateAllInstances();
}

function setLoading(isLoading) {
  appState.dom.loader.hidden = !isLoading;
  if (isLoading) {
    appState.dom.statusText.textContent = 'LADE WORTLISTE …';
    appState.dom.statusText.classList.remove('is-warning');
  }
}

function updateStatus() {
  const dom = appState.dom;
  if (!appState.wordsLoaded) {
    dom.statusText.textContent = 'LADE WORTLISTE …';
    return;
  }
  const total = getAllWords().length;
  if (appState.usingFallback) {
   
