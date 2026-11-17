"use strict";

/* =====================================================================
   LIVE CODING POETRY

   Die Sprache besteht aus diesen Bausteinen:

     <shuffle-word>                  ein Zufallswort, das sich regelmäßig ändert
     <br>                             Zeilenumbruch
     <equality-operator: "==">        Operatoren (werden als Wort ausgegeben,
     <comparison-operator: ">"> ...   z. B. "==" → "wie", ">" → "größer als")
     <shuffle-time: "5"> ... </shuffle-time>
                                      legt die Wechselzeit (Sekunden, IMMER in
                                      Anführungszeichen) der Zufallswörter
                                      dazwischen fest
     <shuffle-samplesize: "TITEL1"; "TITEL2"; "WORTDATENBANK"> ... </shuffle-samplesize>
                                      Zufallswörter dazwischen werden nur aus den
                                      genannten Quellen gezogen: Sample-Titel,
                                      "EIGENE WÖRTER" und/oder "WORTDATENBANK"
     <shuffle-samplesize: "all"> ... </shuffle-samplesize>
                                      Verdeckter Befehl: ALLE Quellen (alle Samples,
                                      alle eigenen Wörter und – nur wenn der Haken
                                      "WORTDATENBANK EINBEZIEHEN" gesetzt ist – die
                                      Wortdatenbank). Hebt eine äußere Einschränkung auf.

   Alles andere im Eingabefeld ist normaler Text. Zeilenumbrüche und
   Mehrfach-Leerzeichen im Eingabefeld sind nur Formatierung – eine
   Ausgabezeile entsteht ausschließlich durch <br>.

   Zusätze:
     - "WORTDATENBANK EINBEZIEHEN" (global): ist der Haken aus, kommen alle
       Zufallswörter nur aus eigenen Wörtern und Samples.
     - Eigene Wörter lassen sich per Semikolon gesammelt hinzufügen.
     - SAMPLE: Fremdtext wird gegen die Wortdatenbank abgeglichen; Treffer
       (Singular + Plural) kommen farbig markiert in den Pool.
       Ein Klick auf den Sample-Chip fügt den passenden Bereichsbefehl ein.
     - Editor: Code-Farben, Klammerpaar-Farben nach Tiefe, Tab-Stopps,
       automatische Einrückung.
     - Cursor-Kopplung: Eingabe und Ausgabe zeigen einen parallelen Cursor.
       Die Ausgabe ist nicht beschreibbar.
     - Musik: Der Text der Ausgabe wird laufend in UTF-8-Bytes übersetzt
       und als Beat (808/Techno) gespielt.
   ===================================================================== */


/* =====================================================================
   1. KONFIGURATION
   ===================================================================== */

// Standard-Wechselzeit eines Zufallsworts (ohne <shuffle-time>)
const DEFAULT_SHUFFLE_SECONDS = 3;

// Grenzen für <shuffle-time: n> (außerhalb wird automatisch begrenzt)
const MIN_SHUFFLE_SECONDS = 1;
const MAX_SHUFFLE_SECONDS = 3600;

// Wie oft der Zeitgeber prüft, ob ein Wort gewechselt werden muss
const TICK_MS = 100;

// Optisches Signal vor dem Wechsel: Es beginnt WARNING_FRACTION der
// Wechselzeit vor dem Wechsel, aber höchstens WARNING_MAX_MS vorher.
const WARNING_FRACTION = 0.4;
const WARNING_MAX_MS = 2000;

// Beschriftung der Hold-Buttons (die Anzeige wird per CSS groß geschrieben)
const HOLD_LABEL = "hold";
const HELD_LABEL = "held";

// Anzeige, solange (noch) kein Wort verfügbar ist
const EMPTY_WORD = "…";

// Ausgabe beim Kopieren in Großbuchstaben (wie auf der Seite angezeigt)?
const COPY_UPPERCASE = true;
const COPY_FEEDBACK_MS = 1500;

// Eigene Wörter: maximale Länge eines Worts und maximale Zahl der
// angezeigten Chips (der Rest wird als "+ N WEITERE" zusammengefasst,
// damit der Bildschirm bei vielen Wörtern nicht überfüllt wird)
const MAX_WORD_LENGTH = 60;
const MAX_CHIPS_SHOWN = 30;

// Sample: Standardtitel, Farbeinstellungen (Golden-Angle-Verfahren)
const DEFAULT_SAMPLE_SOURCE = "FREMDTEXT";
const GOLDEN_ANGLE = 137.508;
const SAMPLE_SATURATION = 85;
const SAMPLE_LIGHTNESS = 60;
// Farbtöne (Grad), die Sample-Farben meiden sollen: Pink (Operatoren),
// Rot ("held"/Signal), Dunkelblau. Weiß/Schwarz sind unbunt und
// kollidieren wegen der Sättigung ohnehin nicht.
const RESERVED_HUES = [340, 352, 241];
const RESERVED_HUE_TOLERANCE = 28;
const USED_HUE_TOLERANCE = 22;

// Editor: Breite eines Tab-Stopps (in Leerzeichen) und Anzahl der
// Klammerfarben (siehe --bracket-0 … --bracket-3 in style.css)
const TAB_SIZE = 2;
const BRACKET_COLORS = 4;

// Musik
const MUSIC_DEFAULT_BPM = 128;
const MUSIC_DEFAULT_VOLUME = 60;       // 0–100
const MUSIC_LOOKAHEAD_MS = 25;         // Takt des Planers
const MUSIC_SCHEDULE_AHEAD = 0.2;      // Sekunden, die im Voraus geplant werden
const PATTERN_ROWS = 21;               // sichtbare Schritte im Pattern
const PATTERN_NOW_ROW = 6;             // Zeile des aktuellen Schritts (0 = oben)
const FOLLOW_PAUSE_MS = 4000;          // so lange folgt die Ausgabe nach eigenem Scrollen nicht


/* =====================================================================
   2. ELEMENTE
   ===================================================================== */

const codeInput = document.getElementById("code-input");
const codeHighlight = document.getElementById("code-highlight");
const cheatButtons = document.getElementById("cheat-buttons");

const output = document.getElementById("output");
const poem = document.getElementById("poem");
const statusText = document.getElementById("status-text");
const loader = document.getElementById("loader");

const clearBtn = document.getElementById("clear-btn");
const copyBtn = document.getElementById("copy-btn");
const copyLabel = copyBtn.textContent;   // Originalbeschriftung merken

const wordForm = document.getElementById("word-form");
const wordInput = document.getElementById("word-input");
const wordFeedback = document.getElementById("word-feedback");
const dbBox = document.getElementById("use-database");
const ownColor = document.getElementById("own-color");

const chipList = document.getElementById("chip-list");
const resetWordsBtn = document.getElementById("reset-words-btn");

const sampleInput = document.getElementById("sample-input");
const sampleSource = document.getElementById("sample-source");
const sampleColor = document.getElementById("sample-color");
const sampleBtn = document.getElementById("sample-btn");
const sampleFeedback = document.getElementById("sample-feedback");
const sampleLegend = document.getElementById("sample-legend");

const patternEl = document.getElementById("pattern");
const musicStatus = document.getElementById("music-status");
const playBtn = document.getElementById("play-btn");
const followBox = document.getElementById("follow-box");
const tempoInput = document.getElementById("tempo-input");
const tempoValue = document.getElementById("tempo-value");
const volumeInput = document.getElementById("volume-input");
const volumeValue = document.getElementById("volume-value");

// Overlays der Ausgabe: Cursor und Musik-Signal (liegen im scrollenden Feld)
const caretEl = document.createElement("div");
caretEl.className = "out-caret";
caretEl.hidden = true;

const markerEl = document.createElement("div");
markerEl.className = "play-marker";
markerEl.hidden = true;

output.append(caretEl, markerEl);


/* =====================================================================
   3. DATEN
   ===================================================================== */

// Wörter aus words.json (German-Nouns-Datenbank)
let wordDatabase = [];

// Vom Nutzer hinzugefügte Wörter
let customWords = [];

// GLOBAL: false = Wortdatenbank ignorieren, nur eigene Wörter + Samples
let dbIncluded = true;

// Namen für <shuffle-samplesize> (klein geschrieben; Abgleich ohne Groß-/Kleinschreibung)
const DB_NAME = "wortdatenbank";
const OWN_NAME = "eigene wörter";
const ALL_NAME = "all";

// Diese Namen dürfen nicht als Sample-Titel verwendet werden
const RESERVED_NAMES = [DB_NAME, OWN_NAME, ALL_NAME];

/*
  Die eigenen Wörter verhalten sich wie ein Sample: Sie haben eine Quelle
  und eine (vom Nutzer wählbare) Markierungsfarbe. Ändert sich die Farbe,
  gilt sie sofort für alle eigenen Wörter in der Ausgabe.
*/
const ownSample = { source: "EIGENE WÖRTER", key: OWN_NAME, color: "#33ccff", count: 0 };

/*
  Invertierte Lookup-Map (beim Laden gebaut):
    Form (klein geschrieben) → { lemma, singular, plural }
  Wird vom Sampling genutzt, um Tokens eines Fremdtexts zu erkennen.
*/
const lookup = new Map();

/*
  Sample-Pool: ein Eintrag pro importiertem Wort
    { word, sample }  mit  sample = { source, key, color, count }
  Die Farbe hängt am Sample-Objekt und damit an jedem seiner Wörter.
*/
let sampleEntries = [];
let samples = [];                      // alle Samples (für Legende + Farbwahl)
const sampleKeys = new Set();          // kleingeschriebene Wörter im Sample-Pool
let colorTouched = false;              // hat der Nutzer die Farbe selbst gewählt?

/*
  Operator-Tabelle: Die EINZIGE Stelle, an der Operatoren definiert sind.
  Aus ihr entstehen (a) die Bausteine im Baustein-Fenster, (b) die
  Erkennung im Code und (c) das Wort in der Ausgabe.

    type   = Name im Baustein, z. B. <equality-operator: "==">
    symbol = Zeichen in den Anführungszeichen
    word   = Ausgabe im Gedicht
*/
const OPERATORS = [
    { type: "equality-operator",    symbol: "==", word: "wie" },
    { type: "comparison-operator",  symbol: ">",  word: "größer als" },
    { type: "comparison-operator",  symbol: "<",  word: "kleiner als" },
    { type: "comparison-operator",  symbol: ">=", word: "größer oder gleich" },
    { type: "comparison-operator",  symbol: "<=", word: "kleiner oder gleich" },
    { type: "similarity-operator",  symbol: "~",  word: "ähnlich wie" },
    { type: "analogy-operator",     symbol: "~~", word: "so wie" },
    { type: "addition-operator",    symbol: "+",  word: "und" },
    { type: "alternative-operator", symbol: "||", word: "oder" },
    { type: "negation-operator",    symbol: "!=", word: "anders als" },
    { type: "negation-operator",    symbol: "!",  word: "nicht" },
    { type: "sequence-operator",    symbol: ">>", word: "dann" }
];

// Sonderzeichen für reguläre Ausdrücke maskieren (z. B. "||" oder "+")
function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Pro Operator ein Muster, das den kompletten Baustein erkennt.
// Typ und Symbol müssen zusammenpassen, sonst gilt der Baustein als Fehler.
const OPERATOR_RULES = OPERATORS.map(op => ({
    ...op,
    pattern: new RegExp(
        `^<${op.type}:\\s*"${escapeRegExp(op.symbol)}"\\s*>$`,
        "i"
    )
}));

/*
  Bausteine für das Baustein-Fenster (nur diese existieren):
    text    = wird eingefügt
    wrapEnd = (optional) Schluss-Tag: Ist im Eingabefeld Text markiert,
              wird die Markierung von text und wrapEnd umschlossen
    pair    = (optional) ohne Markierung werden text UND wrapEnd eingefügt,
              der Cursor steht dazwischen
    hint    = Tooltip

  Sortierung: Kategorien nach voraussichtlicher Häufigkeit im Einsatz
  (1. Grundbausteine, 2. Operatoren, 3. Bereichsbefehle), innerhalb jeder
  Kategorie alphabetisch. Zwischen den Kategorien steht ein Trenner.
*/
const BLOCK_GROUPS = [

    // 1. Grundbausteine (am häufigsten)
    [
        { text: "<br>", hint: "ZEILENUMBRUCH" },
        { text: "<shuffle-word>", hint: "EIN ZUFALLSWORT, DAS SICH REGELMÄSSIG ÄNDERT" }
    ],

    // 2. Operatoren (alphabetisch nach Typ, dann nach Symbol)
    [...OPERATORS]
        .sort((a, b) =>
            a.type !== b.type
                ? (a.type < b.type ? -1 : 1)
                : (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)
        )
        .map(op => ({
            text: `<${op.type}: "${op.symbol}">`,
            hint: `WIRD AUSGEGEBEN ALS: ${op.word.toUpperCase()}`
        })),

    // 3. Bereichsbefehle (öffnender Baustein + Schluss-Baustein, alphabetisch)
    [
        {
            text: '<shuffle-samplesize: "WORTDATENBANK">',
            wrapEnd: "</shuffle-samplesize>",
            hint: 'QUELLEN DER ZUFALLSWÖRTER – SAMPLE-TITEL, "EIGENE WÖRTER", "WORTDATENBANK", MIT ";" TRENNEN – MIT MARKIERUNG NUR FÜR DIE AUSWAHL'
        },
        {
            text: "</shuffle-samplesize>",
            hint: "ENDE DES QUELLEN-BEREICHS (DANACH GILT WIEDER DIE VORHERIGE AUSWAHL)"
        },
        {
            text: '<shuffle-time: "5">',
            wrapEnd: "</shuffle-time>",
            hint: "WECHSELZEIT DER ZUFALLSWÖRTER IN SEKUNDEN (IMMER IN ANFÜHRUNGSZEICHEN) – MIT MARKIERUNG NUR FÜR DIE AUSWAHL"
        },
        {
            text: "</shuffle-time>",
            hint: "ENDE DER WECHSELZEIT (DANACH GILT WIEDER DIE VORHERIGE)"
        }
    ]

];


/* =====================================================================
   4. WORTLISTE LADEN
   ===================================================================== */

// Statusanzeige für die Wortliste (wird von refreshStatus() ausgegeben)
let dbStatus = { text: "LADE WORTLISTE …", error: false };

/*
  Statusleiste: zeigt im Modus "nur eigene Wörter" die Größe des
  eigenen Pools, sonst den Zustand der Wortliste.
*/
function refreshStatus() {

    if (!dbIncluded) {
        const size = customWords.length + sampleEntries.length;
        statusText.textContent =
            `WORTDATENBANK NICHT EINBEZOGEN – NUR EIGENE WÖRTER UND SAMPLES (${size})`;
        statusText.classList.remove("is-warning");
        return;
    }

    statusText.textContent = dbStatus.text;
    statusText.classList.toggle("is-warning", dbStatus.error);

}

/*
  Ein Eintrag der words.json kann sein:
    - ein String (Wortform)                       → nur diese Form
    - ein Objekt { lemma, singular, plural, flexion } (german-nouns)
      → Singular + Plural (+ alle weiteren Formen aus "flexion")
  Liefert { info, forms } oder null.
*/
function normalizeEntry(item) {

    if (typeof item === "string") {
        const word = item.trim();
        if (!word) return null;
        return { info: { lemma: word, singular: word, plural: "" }, forms: [word] };
    }

    if (item && typeof item === "object") {

        const flexion = item.flexion || {};
        const lemma = String(item.lemma || "").trim();
        const singular = String(
            item.singular || flexion["nominativ singular"] ||
            flexion["nominativ singular 1"] || lemma
        ).trim();
        const plural = String(
            item.plural || flexion["nominativ plural"] ||
            flexion["nominativ plural 1"] || ""
        ).trim();

        const forms = [lemma, singular, plural, ...Object.values(flexion)]
            .filter(form => typeof form === "string" && form.trim())
            .map(form => form.trim());

        if (forms.length === 0) return null;

        return { info: { lemma: lemma || singular, singular, plural }, forms };

    }

    return null;

}

async function loadWordList() {

    try {

        dbStatus = { text: "LADE WORTLISTE …", error: false };
        refreshStatus();
        loader.hidden = false;

        // words.json liegt im selben Ordner wie die HTML-Datei.
        const response = await fetch(
            new URL("./words.json", document.baseURI),
            { cache: "no-cache" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("words.json enthält kein gültiges JSON-Array.");
        }

        // Pool-Wörter sammeln und gleichzeitig die Lookup-Map bauen
        const words = [];
        lookup.clear();

        for (const item of data) {

            const entry = normalizeEntry(item);
            if (!entry) continue;

            // Pool: Singular und Plural (bei reinen Strings: das Wort selbst)
            for (const form of [entry.info.singular, entry.info.plural]) {
                if (form) words.push(form);
            }

            // Lookup: jede bekannte Form (klein) zeigt auf die Grundinfo
            for (const form of entry.forms) {
                const key = form.toLowerCase();
                if (!lookup.has(key)) lookup.set(key, entry.info);
            }

        }

        // Ohne Duplikate
        wordDatabase = [...new Set(words)];

        if (wordDatabase.length === 0) {
            throw new Error("Die Wortliste enthält keine Wörter.");
        }

        dbStatus = {
            text: `WORTLISTE GELADEN: ${wordDatabase.length} WÖRTER`,
            error: false
        };

        // Bereits angezeigte Zufallswörter ohne Wort bekommen jetzt eins
        renderPoem();

    } catch (error) {

        console.error("WORTLISTEN-FEHLER:", error);

        dbStatus = { text: "FEHLER: WORTLISTE NICHT GELADEN", error: true };

    } finally {

        loader.hidden = true;
        refreshStatus();

    }

}


/* =====================================================================
   5. ZUFALLSWORT
   ===================================================================== */

/*
  Zieht ein Zufallswort aus dem Pool. Der Pool besteht aus
    - der Wortdatenbank (nur wenn global eingebunden),
    - den eigenen Wörtern und
    - den Sample-Wörtern.
  Mit "sources" (Liste kleingeschriebener Namen aus <shuffle-samplesize>)
  wird der Pool eingeschränkt: "wortdatenbank", "eigene wörter" und/oder
  Sample-Titel. sources = null bedeutet: kein Bereich bzw. "all", alles gilt.
  (Ist die Wortdatenbank global ausgeschaltet, bleibt sie auch dann draußen,
  wenn "WORTDATENBANK" oder "all" im Bereich genannt wird.)

  Es wird ein gemeinsamer Index über alle Teile gewürfelt (ohne die
  150.000+ Wörter bei jedem Wechsel zu kopieren). Das vorherige Wort wird –
  wenn möglich – nicht direkt wiederholt.

  Rückgabe: { word, sample }  (sample = null bei Wörtern der Wortdatenbank)
*/
function pickEntry(previous = "", sources = null) {

    const useDb = dbIncluded && (!sources || sources.includes(DB_NAME));
    const useOwn = !sources || sources.includes(OWN_NAME);

    const sampled = sources
        ? sampleEntries.filter(entry => sources.includes(entry.sample.key))
        : sampleEntries;

    const dbSize = useDb ? wordDatabase.length : 0;
    const ownSize = useOwn ? customWords.length : 0;
    const total = dbSize + ownSize + sampled.length;

    if (total === 0) return { word: "", sample: null };

    let entry = { word: "", sample: null };

    for (let attempt = 0; attempt < 5; attempt++) {

        let index = Math.floor(Math.random() * total);

        if (index < dbSize) {
            entry = { word: wordDatabase[index], sample: null };
        } else if ((index -= dbSize) < ownSize) {
            entry = { word: customWords[index], sample: ownSample };
        } else {
            const picked = sampled[index - ownSize];
            entry = { word: picked.word, sample: picked.sample };
        }

        if (entry.word !== previous) break;

    }

    return entry;

}


/* =====================================================================
   6. BAUSTEINE (BAUSTEIN-FENSTER)
   ===================================================================== */

function createCheatButtons() {

    cheatButtons.replaceChildren();

    BLOCK_GROUPS.forEach((group, groupIndex) => {

        // Trenner zwischen den Kategorien
        if (groupIndex > 0) {
            const separator = document.createElement("span");
            separator.className = "cheat-sep";
            separator.setAttribute("aria-hidden", "true");
            cheatButtons.appendChild(separator);
        }

        group.forEach(block => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = "cheat-btn";
            button.textContent = block.text;
            button.title = block.hint;

            button.addEventListener("click", () => insertBlock(block));

            cheatButtons.appendChild(button);

        });

    });

}

/*
  Ersetzt die aktuelle Auswahl im Code-Feld durch Text. Nutzt
  execCommand("insertText"), damit "Rückgängig" (Strg+Z) weiter funktioniert;
  Ersatzweg: setRangeText.
*/
function replaceSelection(text) {

    codeInput.focus();

    let done = false;

    try {
        done = document.execCommand("insertText", false, text);
    } catch (error) {
        done = false;
    }

    if (!done) {
        codeInput.setRangeText(text, codeInput.selectionStart, codeInput.selectionEnd, "end");
        codeInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

}

/*
  Fügt einen Baustein an der Cursorposition ein.
  Hat der Baustein ein wrapEnd (<shuffle-time>) und ist Text markiert,
  wird die Markierung umschlossen. So wirkt die Zeit nur auf die Auswahl.
  Mit "pair" und ohne Markierung kommen öffnender und schließender
  Baustein zusammen hinein, der Cursor steht dazwischen.
*/
function insertBlock(block) {

    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;

    let insertion = block.text;
    let caretOffset = null;

    if (block.wrapEnd && start !== end) {
        insertion =
            block.text +
            codeInput.value.substring(start, end) +
            block.wrapEnd;
    } else if (block.pair && block.wrapEnd) {
        insertion = block.text + block.wrapEnd;
        caretOffset = block.text.length;
    }

    replaceSelection(insertion);

    if (caretOffset !== null) {
        const position = start + caretOffset;
        codeInput.setSelectionRange(position, position);
    }

    syncFromInput(true);

}


/* =====================================================================
   7. CODE ANALYSIEREN (PARSER)
   ===================================================================== */

/*
  Findet jeden Baustein "<...>". Der Ausdruck erlaubt Anführungszeichen
  mit < oder > darin, damit <comparison-operator: ">"> als EIN Baustein
  erkannt wird. Ein einzelnes "<" oder ">" im Text bleibt normaler Text.
*/
const TAG_REGEX = /<[^<>"]*(?:"[^"]*"[^<>"]*)*>/g;

// <shuffle-time: "5">, auch "2.5" oder "2,5" – die Zahl MUSS in Anführungszeichen stehen
const SHUFFLE_TIME_OPEN = /^<shuffle-time:\s*"\s*(\d+(?:[.,]\d+)?)\s*"\s*>$/;

// <shuffle-samplesize: "TITEL1"; "TITEL2"; "WORTDATENBANK">  (ein oder mehrere Namen in Anführungszeichen, mit ";" getrennt)
const SAMPLESIZE_OPEN = /^<shuffle-samplesize:\s*"[^"]*"(?:\s*;\s*"[^"]*")*\s*>$/;

// Zeilenumbruch: <br>, <br/>, <br />
const BREAK_TAG = /^<br\s*\/?>$/;

/*
  Ordnet einen Baustein einer Art zu. Der Parser und die Code-Farben
  verwenden dieselbe Funktion, damit beide immer übereinstimmen.

    word | br | time-open | time-close | size-open | size-close | operator | error
*/
function classifyTag(raw) {

    const tag = raw.toLowerCase();

    if (tag === "<shuffle-word>") return { kind: "word" };

    if (BREAK_TAG.test(tag)) return { kind: "br" };

    const timeMatch = SHUFFLE_TIME_OPEN.exec(tag);

    if (timeMatch) {
        const seconds = parseFloat(timeMatch[1].replace(",", "."));
        return {
            kind: "time-open",
            seconds: Math.min(MAX_SHUFFLE_SECONDS, Math.max(MIN_SHUFFLE_SECONDS, seconds))
        };
    }

    if (tag === "</shuffle-time>") return { kind: "time-close" };

    if (SAMPLESIZE_OPEN.test(tag)) {
        const names = [...tag.matchAll(/"([^"]*)"/g)].map(name => name[1].trim());
        return { kind: "size-open", names, all: names.includes(ALL_NAME) };
    }

    if (tag === "</shuffle-samplesize>") return { kind: "size-close" };

    const operator = OPERATOR_RULES.find(rule => rule.pattern.test(tag));

    if (operator) return { kind: "operator", word: operator.word };

    return { kind: "error" };

}

/*
  Wandelt den Code in eine Liste von Elementen um (jedes mit start/end =
  Position im Code):

    { type: "text",     value }     normaler Text
    { type: "word",     seconds, sources }
                                    Zufallswort mit Wechselzeit und Quellen
                                    (sources = null: keine Einschränkung)
    { type: "operator", word }      Operator als Wort
    { type: "br" }                  Zeilenumbruch
    { type: "error",    value }     unbekannter / falsch verwendeter Baustein

  <shuffle-time> erzeugt kein eigenes Element. Es steuert nur die Zeit
  der folgenden Zufallswörter. Die Zeiten werden in einem Stapel geführt:
    - <shuffle-time: n> legt eine Zeit oben auf den Stapel,
    - </shuffle-time> nimmt sie wieder weg (es gilt die vorherige Zeit),
    - ohne schließenden Baustein gilt die Zeit bis zum Ende des Codes.
  <shuffle-samplesize> funktioniert genauso (eigener Stapel), nur steuert
  es, aus welchen Quellen die folgenden Zufallswörter gezogen werden.
  Enthält die Liste "all", gilt keine Einschränkung.
*/
function parseCode(code) {

    const tokens = [];
    const timeStack = [];
    const sourceStack = [];
    let lastIndex = 0;

    // Aktuell gültige Wechselzeit (oberstes Element des Stapels)
    const currentSeconds = () =>
        timeStack.length > 0
            ? timeStack[timeStack.length - 1]
            : DEFAULT_SHUFFLE_SECONDS;

    // Aktuell gültige Quellen (null = keine Einschränkung)
    const currentSources = () =>
        sourceStack.length > 0
            ? sourceStack[sourceStack.length - 1]
            : null;

    // Text zwischen zwei Bausteinen: Whitespace vereinheitlichen
    const pushText = (from, to) => {
        const value = code.slice(from, to).replace(/\s+/g, " ").trim();
        if (value) tokens.push({ type: "text", value, start: from, end: to });
    };

    for (const match of code.matchAll(TAG_REGEX)) {

        pushText(lastIndex, match.index);

        const start = match.index;
        const raw = match[0];
        const end = start + raw.length;
        lastIndex = end;

        const info = classifyTag(raw);

        switch (info.kind) {

            case "word":
                tokens.push({
                    type: "word", seconds: currentSeconds(), sources: currentSources(), start, end
                });
                break;

            case "br":
                tokens.push({ type: "br", start, end });
                break;

            case "time-open":
                timeStack.push(info.seconds);
                break;

            case "time-close":
                if (timeStack.length > 0) {
                    timeStack.pop();
                } else {
                    // schließender Baustein ohne öffnenden
                    tokens.push({ type: "error", value: raw, start, end });
                }
                break;

            case "size-open":
                sourceStack.push(info.all ? null : info.names);
                break;

            case "size-close":
                if (sourceStack.length > 0) {
                    sourceStack.pop();
                } else {
                    tokens.push({ type: "error", value: raw, start, end });
                }
                break;

            case "operator":
                tokens.push({ type: "operator", word: info.word, start, end });
                break;

            default:
                // unbekannter Baustein
                tokens.push({ type: "error", value: raw, start, end });

        }

    }

    // Text nach dem letzten Baustein
    pushText(lastIndex, code.length);

    return tokens;

}


/* =====================================================================
   8. ZUFALLSWÖRTER ("SLOTS") UND HOLD
   ===================================================================== */

/*
  Jedes <shuffle-word> im Code entspricht einem "Slot" (Reihenfolge im
  Code = Index im Array). Slots bleiben beim Tippen erhalten – so
  behalten Wörter ihren Zustand (aktuelles Wort, "held"), auch wenn die
  Ausgabe bei jeder Eingabe neu aufgebaut wird.

  Slot-Felder:
    word       aktuelles Wort
    sources    erlaubte Quellen (aus <shuffle-samplesize>) oder null
    sample     Sample des Worts ({ source, color }) oder null
    held       true = eingefroren
    intervalMs Wechselzeit in Millisekunden
    nextChange Zeitpunkt (performance.now) des nächsten Wechsels
    wrapEl / wordEl / holdBtn   zugehörige DOM-Elemente
*/
const slots = [];

function createSlot() {
    return {
        word: "",
        sample: null,
        sources: null,
        held: false,
        intervalMs: 0,
        nextChange: 0,
        wrapEl: null,
        wordEl: null,
        holdBtn: null
    };
}

// Zeigt das Wort mit kurzer Einblend-Animation
function showWord(slot) {

    slot.wordEl.textContent = slot.word || EMPTY_WORD;

    // Animation neu starten
    slot.wordEl.classList.remove("flash");
    void slot.wordEl.offsetWidth;
    slot.wordEl.classList.add("flash");

}

// Neues Wort ziehen und anzeigen
function changeWord(slot) {
    const entry = pickEntry(slot.word, slot.sources);
    slot.word = entry.word;
    slot.sample = entry.sample;
    showWord(slot);
    updateSlotView(slot);

    // Musik und Cursor müssen den neuen Text bzw. die neue Breite übernehmen
    musicDirty = true;
    overlaysDirty = true;
}

// Hold-Button / Klassen an den Zustand (held, Sample) anpassen
function updateSlotView(slot) {

    slot.wrapEl.classList.toggle("is-held", slot.held);

    // Sample-Markierung: Farbe als CSS-Variable, Quelle als Tooltip
    slot.wrapEl.classList.toggle("is-sample", Boolean(slot.sample));

    if (slot.sample) {
        slot.wrapEl.style.setProperty("--sample-color", slot.sample.color);
        slot.wrapEl.title = `QUELLE: ${slot.sample.source}`;
    } else {
        slot.wrapEl.style.removeProperty("--sample-color");
        slot.wrapEl.removeAttribute("title");
    }

    // Ein gehaltenes Wort zeigt kein Wechsel-Signal
    if (slot.held) {
        slot.wrapEl.classList.remove("is-warning");
    }

    slot.holdBtn.setAttribute("aria-pressed", String(slot.held));
    slot.holdBtn.textContent = slot.held ? HELD_LABEL : HOLD_LABEL;

}

/*
  hold  → friert genau dieses Wort ein (andere laufen weiter)
  held  → gibt es frei und startet einen neuen Zyklus
*/
function toggleHold(slot) {

    slot.held = !slot.held;

    if (!slot.held) {
        slot.nextChange = performance.now() + slot.intervalMs;
    }

    updateSlotView(slot);

}

// Baut das DOM eines Zufallsworts samt Hold-Button
function buildShuffleElement(slot) {

    const wrap = document.createElement("span");
    wrap.className = "shuffle";

    const wordEl = document.createElement("span");
    wordEl.className = "shuffle-word";
    wordEl.textContent = slot.word || EMPTY_WORD;

    const holdBtn = document.createElement("button");
    holdBtn.type = "button";
    holdBtn.className = "hold-btn";
    holdBtn.addEventListener("click", () => toggleHold(slot));

    wrap.append(wordEl, holdBtn);

    slot.wrapEl = wrap;
    slot.wordEl = wordEl;
    slot.holdBtn = holdBtn;

    updateSlotView(slot);

    return wrap;

}

/*
  Zeitgeber: läuft alle TICK_MS und kümmert sich um alle Slots.
    - Zeit abgelaufen            → neues Wort, neuer Zyklus
    - in der Signalphase davor   → Klasse "is-warning" (optisches Signal)
    - gehaltene Wörter           → werden übersprungen
  Außerdem: Hat sich der Cursor im Eingabefeld bewegt (ohne dass ein
  Ereignis ihn gemeldet hat), wird die Ausgabe nachgezogen.
*/
function tick() {

    const now = performance.now();

    for (const slot of slots) {

        if (slot.held) continue;

        const remaining = slot.nextChange - now;

        if (remaining <= 0) {
            changeWord(slot);
            slot.nextChange = now + slot.intervalMs;
            slot.wrapEl.classList.remove("is-warning");
            continue;
        }

        const warningMs = Math.min(
            WARNING_MAX_MS,
            slot.intervalMs * WARNING_FRACTION
        );

        slot.wrapEl.classList.toggle("is-warning", remaining <= warningMs);

    }

    if (document.activeElement === codeInput && selectionKey() !== lastSelection) {
        syncFromInput(true);
    }

}


/* =====================================================================
   9. AUSGABE
   ===================================================================== */

// Elemente der letzten Ausgabe (für "Ausgabe kopieren", Cursor und Musik)
let currentTokens = [];

// Wird gesetzt, wenn sich Text oder Layout der Ausgabe geändert haben
let musicDirty = true;
let overlaysDirty = true;

function createLine() {
    const line = document.createElement("div");
    line.className = "line";
    return line;
}

function createSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;   // textContent: HTML aus der Eingabe wird nie interpretiert
    return span;
}

function renderPoem() {

    const tokens = parseCode(codeInput.value);
    currentTokens = tokens;
    musicDirty = true;
    overlaysDirty = true;

    // Nichts auszugeben: Ausgabe leeren (CSS zeigt dann "VORSCHAU")
    if (tokens.length === 0) {
        slots.length = 0;
        stops = [];
        poem.replaceChildren();
        updateOutputCaret(false);
        return;
    }

    // Scrollposition merken, damit das Neuaufbauen sie nicht verändert
    // (die Ausgabe scrollt nur vertikal)
    const scrollTop = output.scrollTop;

    const now = performance.now();
    const fragment = document.createDocumentFragment();

    let line = createLine();
    fragment.appendChild(line);

    let slotIndex = 0;

    for (const token of tokens) {

        switch (token.type) {

            case "br":
                token.lineEl = line;          // die Zeile, die dieser Umbruch beendet
                line = createLine();
                fragment.appendChild(line);
                break;

            case "text":
            case "operator":
            case "error": {
                const cssClass = token.type;
                const text = token.type === "operator" ? token.word : token.value;
                const span = createSpan(cssClass, text);
                token.el = span;
                token.box = span;
                line.appendChild(span);
                break;
            }

            case "word": {

                // Vorhandenen Slot wiederverwenden oder neuen anlegen
                let slot = slots[slotIndex];

                if (!slot) {
                    slot = createSlot();
                    slots[slotIndex] = slot;
                    slot.intervalMs = token.seconds * 1000;
                    slot.nextChange = now + slot.intervalMs;
                }

                // Wechselzeit im Code geändert → Zyklus neu starten
                if (slot.intervalMs !== token.seconds * 1000) {
                    slot.intervalMs = token.seconds * 1000;
                    slot.nextChange = now + slot.intervalMs;
                }

                // Quellen-Bereich aus dem Code übernehmen
                slot.sources = token.sources;

                // Noch kein Wort (z. B. Wortliste war noch nicht geladen)
                if (!slot.word) {
                    const entry = pickEntry("", slot.sources);
                    slot.word = entry.word;
                    slot.sample = entry.sample;
                }

                token.slot = slot;
                line.appendChild(buildShuffleElement(slot));
                token.el = slot.wordEl;       // nur das Wort (ohne Hold-Button)
                token.box = slot.wrapEl;      // Wort + Hold-Button
                slotIndex++;
                break;

            }

        }

    }

    // Überzählige Slots (Zufallswörter wurden aus dem Code gelöscht) entfernen
    slots.length = slotIndex;

    poem.replaceChildren(fragment);

    output.scrollTop = scrollTop;

    stops = buildStops(tokens, codeInput.value, line);
    updateOutputCaret(false);

}

/*
  Reiner Text der Ausgabe (für "Ausgabe kopieren"). Er wird aus den
  Elementen aufgebaut, nicht aus dem DOM – sonst würde die Beschriftung
  der Hold-Buttons mitkopiert.
*/
function getPlainText() {

    const lines = [[]];

    for (const token of currentTokens) {

        const current = lines[lines.length - 1];

        switch (token.type) {
            case "br":       lines.push([]);                      break;
            case "word":     current.push(token.slot.word);       break;
            case "operator": current.push(token.word);            break;
            case "text":     current.push(token.value);           break;
            // "error": unbekannte Bausteine werden nicht kopiert
        }

    }

    const text = lines
        .map(parts => parts.filter(Boolean).join(" "))
        .join("\n")
        .trim();

    return COPY_UPPERCASE ? text.toUpperCase() : text;

}


/* =====================================================================
   10. CURSOR-KOPPLUNG (EINGABE ⇄ AUSGABE)
   =====================================================================

   Prinzip: Jedes Element der Ausgabe kennt seine Position im Code
   (token.start / token.end). Daraus entsteht eine Liste von "Halte-
   punkten" (stops): Stellen, an denen ein Cursor in der Ausgabe stehen
   kann. Jeder Haltepunkt gehört zu genau einer Position im Code (pos).

     Eingabe → Ausgabe:  Position im Code → nächster Haltepunkt → Cursor
     Ausgabe → Eingabe:  Haltepunkt → Position im Code → Cursor/Markierung

   Es gibt immer eine "aktive" Seite (dort wird gearbeitet). Auf der
   anderen Seite erscheint der gespiegelte Cursor in Pink.
   =================================================================== */

let stops = [];               // Haltepunkte der Ausgabe
let caretPos = 0;             // aktuelle Cursorposition (als Position im Code)
let activeSide = "input";     // "input" oder "output"
let lastSelection = "";       // zuletzt gesehene Auswahl im Code-Feld
let goalX = null;             // Wunschspalte bei Auf/Ab in der Ausgabe

function selectionKey() {
    return `${codeInput.selectionStart}:${codeInput.selectionEnd}:${codeInput.selectionDirection}`;
}

/*
  Ordnet jedem Zeichen eines Textstücks seine Position im Rohtext zu
  (der Parser vereinheitlicht Whitespace und schneidet die Ränder ab).
*/
function collapsedToRaw(raw, valueLength) {

    const map = [];
    let i = 0;
    let inSpace = false;

    while (i < raw.length && /\s/.test(raw[i])) i++;

    for (; i < raw.length && map.length < valueLength; i++) {

        if (/\s/.test(raw[i])) {
            if (inSpace) continue;
            inSpace = true;
        } else {
            inSpace = false;
        }

        map.push(i);

    }

    return map;

}

/*
  Haltepunkte (in Reihenfolge der Position im Code):
    char     vor einem Zeichen eines Textstücks
    textEnd  hinter dem letzten Zeichen eines Textstücks
    before / after   vor / hinter einem Wort, Operator oder Fehler
    line     am Ende einer Zeile (steht für den Umbruch <br>)
    end      am Anfang der letzten, leeren Zeile (nur wenn der Code mit <br> endet)
*/
function buildStops(tokens, code, lastLine) {

    const list = [];

    for (const token of tokens) {

        if (token.type === "text") {

            const map = collapsedToRaw(code.slice(token.start, token.end), token.value.length);

            if (map.length === 0) continue;

            map.forEach((rawIndex, offset) => {
                list.push({ pos: token.start + rawIndex, kind: "char", token, off: offset });
            });

            list.push({
                pos: token.start + map[map.length - 1] + 1,
                kind: "textEnd", token, off: map.length
            });

        } else if (token.type === "br") {

            list.push({ pos: token.start, kind: "line", token });

        } else {

            list.push({ pos: token.start, kind: "before", token });
            list.push({ pos: token.end, kind: "after", token });

        }

    }

    const last = tokens[tokens.length - 1];

    if (last && last.type === "br") {
        list.push({ pos: code.length, kind: "end", token: last, lineEl: lastLine });
    }

    return list;

}

// Letzter Haltepunkt, dessen Position nicht hinter p liegt
function stopIndexForPos(p) {

    let best = 0;

    for (let i = 0; i < stops.length; i++) {
        if (stops[i].pos <= p) best = i;
        else break;
    }

    return best;

}

// Rechteck eines Zeichens (oder des ganzen Elements, falls kein Text darin ist)
function charRect(el, offset, length) {

    const node = el.firstChild;

    if (!node || node.nodeType !== Node.TEXT_NODE || typeof document.createRange !== "function") {
        return el.getBoundingClientRect();
    }

    const range = document.createRange();
    const max = node.length;

    range.setStart(node, Math.min(offset, max));
    range.setEnd(node, Math.min(offset + length, max));

    if (typeof range.getClientRects === "function") {
        const rects = range.getClientRects();
        if (rects.length > 0) return rects[0];
    }

    return typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : el.getBoundingClientRect();

}

// Bildschirmposition eines Haltepunkts: { x, y } (y = Zeilenmitte) oder null
function stopGeometry(stop) {

    try {

        const token = stop.token;
        let rect;
        let x;

        switch (stop.kind) {

            case "char":
                rect = charRect(token.el, stop.off, 1);
                x = rect.left;
                break;

            case "textEnd":
                rect = charRect(token.el, stop.off - 1, 1);
                x = rect.right;
                break;

            case "before":
                rect = token.el.getBoundingClientRect();
                x = rect.left;
                break;

            case "after":
                rect = token.el.getBoundingClientRect();
                x = rect.right;
                break;

            case "line": {
                const lastChild = token.lineEl.lastElementChild;
                if (lastChild) {
                    rect = lastChild.getBoundingClientRect();
                    x = rect.right;
                } else {
                    rect = token.lineEl.getBoundingClientRect();
                    x = rect.left;
                }
                break;
            }

            case "end":
                rect = stop.lineEl.getBoundingClientRect();
                x = rect.left;
                break;

            default:
                return null;

        }

        return { x, y: rect.top + rect.height / 2 };

    } catch (error) {

        return null;

    }

}

// Bildschirmkoordinaten → Koordinaten im scrollenden Inhalt der Ausgabe
function toOutputCoords(left, top) {

    const box = output.getBoundingClientRect();

    return {
        left: left - box.left - output.clientLeft + output.scrollLeft,
        top: top - box.top - output.clientTop + output.scrollTop
    };

}

// Scrollt die Ausgabe so, dass der Bereich sichtbar ist (springt dann in die Mitte)
function ensureOutputVisible(top, height) {

    const view = output.clientHeight;
    const margin = 12;

    if (top < output.scrollTop + margin || top + height > output.scrollTop + view - margin) {
        output.scrollTop = Math.max(0, top - view / 2 + height / 2);
    }

}

// Setzt den Cursor der Ausgabe an die Stelle, die caretPos entspricht
function updateOutputCaret(scroll = false) {

    const stop = stops.length > 0 ? stops[stopIndexForPos(caretPos)] : null;
    const point = stop ? stopGeometry(stop) : null;

    if (!point) {
        caretEl.hidden = true;
        return;
    }

    const fontSize = parseFloat(getComputedStyle(output).fontSize) || 16;
    const height = fontSize * 1.35;
    const coords = toOutputCoords(point.x, point.y - height / 2);

    caretEl.style.left = `${coords.left - 1}px`;
    caretEl.style.top = `${coords.top}px`;
    caretEl.style.height = `${height}px`;
    caretEl.hidden = false;
    caretEl.classList.toggle("is-active", activeSide === "output");

    if (scroll) ensureOutputVisible(coords.top, height);

}

// Scrollt das Code-Feld zum gespiegelten Cursor (springt dann in die Mitte)
function scrollInputToMirror() {

    const marker = codeHighlight.querySelector(".mirror-caret");

    if (!marker) return;

    const top = marker.offsetTop;
    const height = marker.offsetHeight || 24;
    const view = codeInput.clientHeight;
    const current = codeInput.scrollTop;

    if (top < current + 8 || top + height > current + view - 8) {
        codeInput.scrollTop = Math.max(0, top - view / 2 + height / 2);
    }

    codeHighlight.scrollTop = codeInput.scrollTop;

}

// Eingabe → Ausgabe: Cursor im Code-Feld hat sich bewegt
function syncFromInput(scroll = true) {

    activeSide = "input";

    caretPos = codeInput.selectionDirection === "backward"
        ? codeInput.selectionStart
        : codeInput.selectionEnd;

    lastSelection = selectionKey();

    renderHighlight();
    updateOutputCaret(scroll);

}

// Ausgabe → Eingabe: Cursor der Ausgabe wird auf einen Haltepunkt gesetzt
function moveOutputCaret(index) {

    const stop = stops[index];

    if (!stop) return;

    activeSide = "output";
    caretPos = stop.pos;

    // Der Cursor im Code-Feld folgt (auch wenn es keinen Fokus hat)
    codeInput.setSelectionRange(caretPos, caretPos);
    lastSelection = selectionKey();

    renderHighlight();
    updateOutputCaret(true);
    scrollInputToMirror();

}

function setActiveSide(side) {

    if (activeSide === side) return;

    activeSide = side;

    renderHighlight();
    updateOutputCaret(false);

}

// Nächster Haltepunkt links/rechts, der eine andere Position im Code hat
function stepStop(index, direction) {

    const startPos = stops[index].pos;
    let i = index + direction;

    while (i >= 0 && i < stops.length && stops[i].pos === startPos) i += direction;

    return i >= 0 && i < stops.length ? i : null;

}

// Haltepunkt in der Zeile darüber/darunter (möglichst in derselben Spalte)
function verticalStop(index, direction, count = 1) {

    const points = stops.map(stopGeometry);
    const current = points[index];

    if (!current) return null;

    // Alle Bildschirmzeilen (verschiedene y-Werte) sortiert
    const rows = [];

    for (const p of points) {
        if (p && !rows.some(y => Math.abs(y - p.y) < 4)) rows.push(p.y);
    }

    rows.sort((a, b) => a - b);

    const rowIndex = rows.findIndex(y => Math.abs(y - current.y) < 4);
    const targetIndex = Math.min(rows.length - 1, Math.max(0, rowIndex + direction * count));

    if (targetIndex === rowIndex) return null;

    if (goalX === null) goalX = current.x;

    const targetY = rows[targetIndex];
    let best = null;
    let bestDistance = Infinity;

    points.forEach((p, i) => {
        if (!p || Math.abs(p.y - targetY) >= 4) return;
        const distance = Math.abs(p.x - goalX);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    });

    return best;

}

// Anfang/Ende der Bildschirmzeile
function rowEdgeStop(index, direction) {

    const points = stops.map(stopGeometry);
    const current = points[index];

    if (!current) return null;

    let best = null;
    let bestX = direction < 0 ? Infinity : -Infinity;

    points.forEach((p, i) => {
        if (!p || Math.abs(p.y - current.y) >= 4) return;
        if (direction < 0 ? p.x < bestX : p.x > bestX) {
            bestX = p.x;
            best = i;
        }
    });

    return best;

}

// Haltepunkt, der einem Klick am nächsten liegt (erst die Zeile, dann die Spalte)
function nearestStop(clientX, clientY) {

    const points = stops.map(stopGeometry);
    let rowY = null;
    let rowDistance = Infinity;

    for (const p of points) {
        if (p && Math.abs(p.y - clientY) < rowDistance) {
            rowDistance = Math.abs(p.y - clientY);
            rowY = p.y;
        }
    }

    if (rowY === null) return null;

    let best = null;
    let bestDistance = Infinity;

    points.forEach((p, i) => {
        if (!p || Math.abs(p.y - rowY) >= 4) return;
        const distance = Math.abs(p.x - clientX);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    });

    return best;

}

// Tastatur in der Ausgabe: nur Cursorbewegung, keinerlei Texteingabe
output.addEventListener("keydown", event => {

    // Tasten auf den Hold-Buttons gehören den Buttons
    if (event.target !== output || stops.length === 0) return;

    const index = stopIndexForPos(caretPos);
    const jump = event.ctrlKey || event.metaKey;
    let next;

    switch (event.key) {

        case "ArrowLeft":  next = stepStop(index, -1); break;
        case "ArrowRight": next = stepStop(index, 1);  break;
        case "ArrowUp":    next = verticalStop(index, -1); break;
        case "ArrowDown":  next = verticalStop(index, 1);  break;
        case "PageUp":     next = verticalStop(index, -1, 10); break;
        case "PageDown":   next = verticalStop(index, 1, 10);  break;
        case "Home":       next = jump ? 0 : rowEdgeStop(index, -1); break;
        case "End":        next = jump ? stops.length - 1 : rowEdgeStop(index, 1); break;
        default: return;

    }

    event.preventDefault();

    const vertical = ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key);
    if (!vertical) goalX = null;

    if (next !== null && next !== undefined) moveOutputCaret(next);

});

// Klick in die Ausgabe setzt den Cursor (Hold-Buttons und Scroller ausgenommen)
output.addEventListener("mousedown", event => {

    if (event.button !== 0 || event.target.closest(".hold-btn")) return;

    const box = output.getBoundingClientRect();

    if (event.clientX > box.left + output.clientLeft + output.clientWidth) return;

    setActiveSide("output");

    goalX = null;

    const index = nearestStop(event.clientX, event.clientY);

    if (index !== null) moveOutputCaret(index);

});

output.addEventListener("focus", () => setActiveSide("output"));

// Eigenes Scrollen/Anfassen der Ausgabe: Das Musik-Signal scrollt dann kurz nicht mit
let lastUserScroll = 0;

for (const type of ["wheel", "touchmove"]) {
    output.addEventListener(type, () => { lastUserScroll = Date.now(); }, { passive: true });
}


/* =====================================================================
   11. EDITOR: CODE-FARBEN, KLAMMERPAARE, TAB-STOPPS
   =====================================================================

   Der Editor besteht aus zwei übereinanderliegenden Schichten: Die
   Textarea (Eingabe, Text unsichtbar) und das <pre> dahinter, das
   denselben Text eingefärbt zeigt. Die Farben entstehen aus denselben
   Regeln wie die Auswertung (classifyTag).
   =================================================================== */

const SCOPE_KINDS = new Set(["time-open", "time-close", "size-open", "size-close"]);

function escapeHtml(text) {
    return text.replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
}

/*
  Zerlegt den Code in Textstücke und Bausteine. Bei öffnenden und
  schließenden Bereichsbausteinen wird das Gegenstück (partner) und die
  Verschachtelungstiefe (depth) festgehalten. Ein schließender Baustein
  ohne öffnenden gilt als Fehler (wie im Parser).
*/
function scanCode(code) {

    const items = [];
    const timeStack = [];
    const sizeStack = [];
    let last = 0;

    for (const match of code.matchAll(TAG_REGEX)) {

        if (match.index > last) {
            items.push({ start: last, end: match.index, tag: false });
        }

        const info = classifyTag(match[0]);

        const item = {
            start: match.index,
            end: match.index + match[0].length,
            tag: true,
            raw: match[0],
            kind: info.kind,
            depth: 0,
            partner: -1
        };

        const index = items.push(item) - 1;
        last = item.end;

        const depth = timeStack.length + sizeStack.length;

        if (info.kind === "time-open") {

            item.depth = depth;
            timeStack.push(index);

        } else if (info.kind === "size-open") {

            item.depth = depth;
            sizeStack.push(index);

        } else if (info.kind === "time-close" || info.kind === "size-close") {

            const stack = info.kind === "time-close" ? timeStack : sizeStack;

            if (stack.length > 0) {
                const open = stack.pop();
                item.partner = open;
                item.depth = items[open].depth;
                items[open].partner = index;
            } else {
                item.kind = "error";
            }

        }

    }

    if (last < code.length) {
        items.push({ start: last, end: code.length, tag: false });
    }

    return items;

}

// Teilstücke eines Bausteins mit ihrer Farbklasse (lückenlos, absolute Positionen)
function tagAtoms(item, isHit) {

    const atoms = [];
    const hit = isHit ? " hl-hit" : "";

    const add = (from, to, cssClass) => {
        if (to > from) {
            atoms.push({ start: item.start + from, end: item.start + to, cls: cssClass + hit });
        }
    };

    const raw = item.raw;
    const parts = /^(<\/?)([^\s:>"\/]*)([\s\S]*?)(\/?>)$/.exec(raw);

    if (item.kind === "error" || !parts) {
        add(0, raw.length, "hl-error");
        return atoms;
    }

    const scope = SCOPE_KINDS.has(item.kind);
    const depthClass = `hl-d${item.depth % BRACKET_COLORS}`;
    const isOperator = item.kind === "operator";

    const bracketClass = scope ? depthClass : "hl-bracket";
    const nameClass = scope
        ? depthClass
        : isOperator ? "hl-name" : item.kind === "word" ? "hl-word" : "hl-break";
    const stringClass = isOperator ? "hl-opsym" : "hl-str";

    let pos = 0;

    add(pos, pos + parts[1].length, bracketClass);
    pos += parts[1].length;

    add(pos, pos + parts[2].length, nameClass);
    pos += parts[2].length;

    // Mittelteil: Anführungszeichen-Inhalte hervorheben, Rest (": ", ";") wie die Klammern
    const middle = parts[3];
    let done = 0;

    for (const quoted of middle.matchAll(/"[^"]*"/g)) {
        add(pos + done, pos + quoted.index, bracketClass);
        add(pos + quoted.index, pos + quoted.index + quoted[0].length, stringClass);
        done = quoted.index + quoted[0].length;
    }

    add(pos + done, pos + middle.length, bracketClass);
    pos += middle.length;

    add(pos, pos + parts[4].length, bracketClass);

    return atoms;

}

/*
  Baut die Hervorhebungsschicht neu auf. Außerdem:
    - Steht der Cursor an einem Bereichsbaustein, werden dieser und sein
      Gegenstück hervorgehoben.
    - Ist die Ausgabe die aktive Seite, erscheint an der entsprechenden
      Stelle der gespiegelte Cursor.
*/
function renderHighlight() {

    const code = codeInput.value;
    const items = scanCode(code);

    // Klammerpaar am Cursor
    const hits = new Set();
    const collapsed = codeInput.selectionStart === codeInput.selectionEnd || activeSide === "output";

    if (collapsed) {

        const found = items.findIndex(item =>
            item.tag && SCOPE_KINDS.has(item.kind) && item.partner >= 0 &&
            caretPos >= item.start && caretPos <= item.end
        );

        if (found >= 0) {
            hits.add(found);
            hits.add(items[found].partner);
        }

    }

    // Alle Teilstücke sammeln
    const atoms = [];

    items.forEach((item, index) => {
        if (item.tag) {
            atoms.push(...tagAtoms(item, hits.has(index)));
        } else {
            atoms.push({ start: item.start, end: item.end, cls: "hl-text" });
        }
    });

    // Ausgeben (mit dem gespiegelten Cursor an der richtigen Stelle)
    const markerAt = activeSide === "output" ? Math.min(caretPos, code.length) : -1;
    const marker = '<span class="mirror-caret"></span>';
    const piece = (cls, from, to) => `<span class="${cls}">${escapeHtml(code.slice(from, to))}</span>`;

    let html = "";
    let markerDone = markerAt < 0;

    for (const atom of atoms) {

        if (!markerDone && markerAt >= atom.start && markerAt <= atom.end) {
            html += piece(atom.cls, atom.start, markerAt) + marker + piece(atom.cls, markerAt, atom.end);
            markerDone = true;
        } else {
            html += piece(atom.cls, atom.start, atom.end);
        }

    }

    if (!markerDone) html += marker;

    // Endet der Code mit einem Zeilenumbruch, braucht die letzte Zeile Höhe
    if (code.endsWith("\n")) html += " ";

    codeHighlight.innerHTML = html;
    codeHighlight.scrollTop = codeInput.scrollTop;

}

// Beginn der Zeile, in der die Position i liegt
function lineStartOf(text, i) {
    return i <= 0 ? 0 : text.lastIndexOf("\n", i - 1) + 1;
}

/*
  Tab: springt zum nächsten Tab-Stopp (Vielfache von TAB_SIZE).
  Bei markierten Zeilen werden alle Zeilen eingerückt, mit Umschalt
  ausgerückt.
*/
function handleTab(outdent) {

    const text = codeInput.value;
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;
    const multiline = text.slice(start, end).includes("\n");

    // Einfacher Tab: zum nächsten Tab-Stopp
    if (!outdent && !multiline) {
        const column = start - lineStartOf(text, start);
        replaceSelection(" ".repeat(TAB_SIZE - (column % TAB_SIZE)));
        return;
    }

    // Zeilenblock ein-/ausrücken
    const blockStart = lineStartOf(text, start);
    let blockEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;

    const newline = text.indexOf("\n", blockEnd);
    blockEnd = newline === -1 ? text.length : newline;

    const oldLines = text.slice(blockStart, blockEnd).split("\n");

    const newLines = oldLines.map(lineText => {
        if (!outdent) return lineText.length > 0 ? " ".repeat(TAB_SIZE) + lineText : lineText;
        return lineText.replace(new RegExp(`^(?: {1,${TAB_SIZE}}|\\t)`), "");
    });

    const replacement = newLines.join("\n");

    if (replacement === oldLines.join("\n")) return;

    codeInput.setSelectionRange(blockStart, blockEnd);
    replaceSelection(replacement);

    if (start === end) {
        // Cursor behält seine Stelle in der Zeile
        const delta = newLines[0].length - oldLines[0].length;
        const position = Math.max(blockStart, start + delta);
        codeInput.setSelectionRange(position, position);
    } else {
        codeInput.setSelectionRange(blockStart, blockStart + replacement.length);
    }

    syncFromInput(true);

}

/*
  Enter: übernimmt die Einrückung der Zeile. Nach einem öffnenden
  Bereichsbaustein wird zusätzlich eingerückt; steht der Cursor genau
  zwischen öffnendem und schließendem Baustein, entsteht eine leere,
  eingerückte Mittelzeile.
*/
function handleEnter() {

    const text = codeInput.value;
    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;

    const before = text.slice(lineStartOf(text, start), start);
    const indent = before.match(/^[ \t]*/)[0];

    const afterOpen = /<shuffle-(?:time|samplesize):[^<>]*>$/i.test(before.trimEnd());
    const extra = afterOpen ? " ".repeat(TAB_SIZE) : "";
    const betweenTags = afterOpen && /^<\/shuffle-(?:time|samplesize)>/i.test(text.slice(end));

    if (betweenTags) {
        const first = `\n${indent}${extra}`;
        replaceSelection(`${first}\n${indent}`);
        const position = start + first.length;
        codeInput.setSelectionRange(position, position);
        syncFromInput(true);
        return;
    }

    replaceSelection(`\n${indent}${extra}`);

}

/*
  Escape verlässt das Code-Feld für den nächsten Tab (sonst bliebe man in
  der Tab-Falle: Tab rückt immer ein) – so bleibt die Seite per Tastatur
  bedienbar.
*/
let tabEscape = false;

codeInput.addEventListener("keydown", event => {

    if (event.isComposing) return;

    if (event.key === "Escape") {
        tabEscape = true;
        return;
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {

        if (tabEscape) {
            tabEscape = false;
            return;               // Tab bewegt jetzt den Fokus
        }

        event.preventDefault();
        handleTab(event.shiftKey);
        return;

    }

    tabEscape = false;

    if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        handleEnter();
    }

});

// Hervorhebungsschicht und Textarea scrollen gemeinsam
codeInput.addEventListener("scroll", () => {
    codeHighlight.scrollTop = codeInput.scrollTop;
});


/* =====================================================================
   12. LIVE-CODING, LEEREN, KOPIEREN
   ===================================================================== */

// Bei jeder Eingabe wird die Ausgabe sofort neu aufgebaut
function onInputChanged() {

    activeSide = "input";

    caretPos = codeInput.selectionDirection === "backward"
        ? codeInput.selectionStart
        : codeInput.selectionEnd;

    lastSelection = selectionKey();

    renderHighlight();
    renderPoem();
    updateOutputCaret(true);

}

codeInput.addEventListener("input", onInputChanged);

// Bewegt sich der Cursor ohne Eingabe, wird die Ausgabe nachgezogen
for (const type of ["keyup", "mouseup", "select", "focus"]) {
    codeInput.addEventListener(type, () => syncFromInput(type !== "focus"));
}

clearBtn.addEventListener("click", () => {
    codeInput.value = "";
    onInputChanged();
    codeInput.focus();
});

// Kopieren in die Zwischenablage (mit Ersatzweg, falls die API fehlt)
async function copyToClipboard(text) {

    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();

    const success = document.execCommand("copy");
    helper.remove();

    if (!success) {
        throw new Error("Kopieren nicht möglich.");
    }

}

let copyTimer = null;

copyBtn.addEventListener("click", async () => {

    const text = getPlainText();
    let message;

    if (!text) {
        message = "NICHTS ZUM KOPIEREN";
    } else {
        try {
            await copyToClipboard(text);
            message = "KOPIERT!";
        } catch (error) {
            console.error("KOPIERFEHLER:", error);
            message = "KOPIEREN FEHLGESCHLAGEN";
        }
    }

    copyBtn.textContent = message;

    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
        copyBtn.textContent = copyLabel;
    }, COPY_FEEDBACK_MS);

});


/* =====================================================================
   13. EIGENE WÖRTER
   ===================================================================== */

// Meldung unter dem Formular (isError = rot)
function setFeedback(message, isError = false) {
    wordFeedback.textContent = message;
    wordFeedback.classList.toggle("is-error", isError);
}

// Liste der eigenen Wörter als Chips (mit Entfernen-Button) anzeigen.
// Es werden höchstens MAX_CHIPS_SHOWN Chips gezeigt; der Rest wird als
// "+ N WEITERE" zusammengefasst, damit der Bildschirm nicht überfüllt ist.
function renderCustomWords() {

    chipList.replaceChildren();

    customWords.slice(0, MAX_CHIPS_SHOWN).forEach((word, index) => {

        const li = document.createElement("li");
        li.className = "chip";

        const label = document.createElement("span");
        label.textContent = word;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "chip-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", `Wort entfernen: ${word}`);

        removeBtn.addEventListener("click", () => {
            customWords.splice(index, 1);
            renderCustomWords();
            refreshStatus();
            setFeedback("WORT ENTFERNT.");
        });

        li.append(label, removeBtn);
        chipList.appendChild(li);

    });

    const hidden = customWords.length - MAX_CHIPS_SHOWN;

    if (hidden > 0) {
        const more = document.createElement("li");
        more.className = "chip chip-more";
        more.textContent = `+ ${hidden} WEITERE`;
        chipList.appendChild(more);
    }

}

/*
  Hinzufügen: ein Wort oder mehrere, getrennt durch Semikolon
  ("Mond; Stern; Nacht"). Duplikate (Groß-/Kleinschreibung egal)
  werden übersprungen.
*/
wordForm.addEventListener("submit", event => {

    event.preventDefault();

    const parts = wordInput.value
        .split(";")
        .map(part => part.trim().slice(0, MAX_WORD_LENGTH))
        .filter(Boolean);

    if (parts.length === 0) return;

    const known = new Set(customWords.map(word => word.toLowerCase()));
    let added = 0;
    let skipped = 0;

    for (const word of parts) {

        const key = word.toLowerCase();

        if (known.has(key)) {
            skipped++;
            continue;
        }

        known.add(key);
        customWords.push(word);
        added++;

    }

    if (added === 0) {
        setFeedback("DIESE WÖRTER EXISTIEREN BEREITS.", true);
        return;
    }

    wordInput.value = "";

    setFeedback(
        `${added} ${added === 1 ? "WORT" : "WÖRTER"} HINZUGEFÜGT` +
        (skipped ? `, ${skipped} DUPLIKAT(E) ÜBERSPRUNGEN.` : ".")
    );

    renderCustomWords();
    refreshStatus();

    // Falls noch keine Wörter vorhanden waren, bekommen leere Slots jetzt eins
    renderPoem();

});

resetWordsBtn.addEventListener("click", () => {

    customWords = [];

    renderCustomWords();
    refreshStatus();
    setFeedback("EIGENE WÖRTER ZURÜCKGESETZT.");

});

// GLOBAL: Wortdatenbank einbeziehen (angehakt) oder nur eigene Wörter + Samples
dbBox.addEventListener("change", () => {

    dbIncluded = dbBox.checked;

    refreshStatus();

    if (!dbIncluded && customWords.length + sampleEntries.length === 0) {
        setFeedback("NOCH KEINE EIGENEN WÖRTER ODER SAMPLES – ZUERST HINZUFÜGEN.", true);
    } else {
        setFeedback("");
    }

    // Leere Slots können jetzt ein Wort bekommen
    renderPoem();

});

// Farbe der eigenen Wörter: wirkt sofort auf alle eigenen Wörter in der Ausgabe
ownColor.addEventListener("input", () => {

    ownSample.color = ownColor.value;

    slots.forEach(slot => {
        if (slot.sample === ownSample) updateSlotView(slot);
    });

    // Auto-Farbe für Samples muss sich von der neuen Farbe unterscheiden
    if (!colorTouched) previewAutoColor();

});


/* =====================================================================
   14. SAMPLE (FREMDTEXT)
   ===================================================================== */

// ---------- Farben ----------

// HSL → "#rrggbb"
function hslToHex(h, s, l) {

    s /= 100;
    l /= 100;

    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = x => Math.round(255 * x).toString(16).padStart(2, "0");

    return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;

}

// "#rrggbb" → Farbton in Grad (NaN bei Grau/Weiß/Schwarz)
function hexToHue(hex) {

    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);

    if (d === 0) return NaN;

    let hue;
    if (max === r)      hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else                hue = (r - g) / d + 4;

    hue *= 60;
    return hue < 0 ? hue + 360 : hue;

}

// Abstand zweier Farbtöne auf dem Farbkreis (0–180)
function hueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
}

const isNear = (hue, list, tolerance) =>
    list.some(other => !Number.isNaN(other) && hueDistance(hue, other) < tolerance);

/*
  Nächste automatische Farbe (Golden-Angle-Verfahren): Der Farbton rückt
  pro Sample um 137,5° weiter. Töne nahe den Grundfarben (Pink, Rot,
  Dunkelblau) oder nahe bereits verwendeten Sample-Farben werden
  übersprungen. Die Funktion hat keine Nebenwirkungen (Vorschau möglich).
*/
function nextAutoColor() {

    const used = [...samples, ownSample].map(sample => hexToHue(sample.color));

    for (let i = 0; i < 80; i++) {

        const hue = ((samples.length + i) * GOLDEN_ANGLE + 20) % 360;

        if (isNear(hue, RESERVED_HUES, RESERVED_HUE_TOLERANCE)) continue;
        if (isNear(hue, used, USED_HUE_TOLERANCE)) continue;

        return hslToHex(hue, SAMPLE_SATURATION, SAMPLE_LIGHTNESS);

    }

    // Notfall (sehr viele Samples): beliebiger Farbton
    return hslToHex(Math.random() * 360, SAMPLE_SATURATION, SAMPLE_LIGHTNESS);

}

// Farbfeld zeigt die nächste automatische Farbe, solange der Nutzer nicht wählt
function previewAutoColor() {
    colorTouched = false;
    sampleColor.value = nextAutoColor();
}

sampleColor.addEventListener("input", () => { colorTouched = true; });

// ---------- Anzeige ----------

function setSampleFeedback(message, isError = false) {
    sampleFeedback.textContent = message;
    sampleFeedback.classList.toggle("is-error", isError);
}

/*
  Fügt den Bereichsbefehl für ein Sample in den Code ein:
    <shuffle-samplesize: "TITEL"></shuffle-samplesize>
  Ohne Markierung steht der Cursor dazwischen, mit Markierung wird der
  markierte Code umschlossen.
*/
function insertSampleBlock(sample) {

    insertBlock({
        text: `<shuffle-samplesize: "${sample.source}">`,
        wrapEnd: "</shuffle-samplesize>",
        pair: true
    });

}

// Legende: Farbfeld + Titel + Anzahl Wörter (klickbar: Befehl einfügen) + Entfernen
function renderSampleLegend() {

    sampleLegend.replaceChildren();

    for (const sample of samples) {

        const li = document.createElement("li");
        li.className = "chip";

        const insertBtn = document.createElement("button");
        insertBtn.type = "button";
        insertBtn.className = "chip-insert";
        insertBtn.title = `KLICKEN: BEREICHSBEFEHL FÜR „${sample.source}“ IN DEN CODE EINFÜGEN`;

        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = sample.color;

        const label = document.createElement("span");
        label.textContent = `${sample.source} (${sample.count})`;

        insertBtn.append(swatch, label);
        insertBtn.addEventListener("click", () => insertSampleBlock(sample));

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "chip-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", `Sample entfernen: ${sample.source}`);
        removeBtn.addEventListener("click", () => removeSample(sample));

        li.append(insertBtn, removeBtn);
        sampleLegend.appendChild(li);

    }

}

// Entfernt ein komplettes Sample samt seiner Wörter aus dem Pool
function removeSample(sample) {

    samples = samples.filter(other => other !== sample);
    sampleEntries = sampleEntries.filter(entry => entry.sample !== sample);

    sampleKeys.clear();
    sampleEntries.forEach(entry => sampleKeys.add(entry.word.toLowerCase()));

    renderSampleLegend();
    if (!colorTouched) previewAutoColor();
    refreshStatus();
    setSampleFeedback("SAMPLE ENTFERNT.");

}

// ---------- Sampling ----------

/*
  1. Text in Wörter zerlegen (alles außer Buchstaben ist Trenner:
     Leerzeichen, Satzzeichen, Zeilenumbrüche; Groß-/Kleinschreibung egal)
  2. Jedes Token in der Lookup-Map suchen, Nicht-Treffer verwerfen
  3. Singular und Plural der Treffer in den Sample-Pool legen
     (nicht, wenn schon im Sample-Pool), mit Titel und Farbe des Samples

  Der Titel wird bereinigt (keine Anführungszeichen oder Semikola, da sie
  im Bereichsbefehl Trenner sind), darf nicht reserviert sein ("all",
  "wortdatenbank", "eigene wörter") und wird bei Dopplungen nummeriert.
*/
function sampleText() {

    if (lookup.size === 0) {
        setSampleFeedback("WORTLISTE NOCH NICHT GELADEN.", true);
        return;
    }

    const tokens = [...new Set(sampleInput.value.toLowerCase().match(/\p{L}+/gu) || [])];

    if (tokens.length === 0) {
        setSampleFeedback("BITTE ZUERST EINEN TEXT EINFÜGEN.", true);
        return;
    }

    const cleaned = sampleSource.value.replace(/[";]/g, " ").replace(/\s+/g, " ").trim()
        || DEFAULT_SAMPLE_SOURCE;

    if (RESERVED_NAMES.includes(cleaned.toLowerCase())) {
        setSampleFeedback(`„${cleaned}“ IST ALS NAME RESERVIERT – BITTE EINEN ANDEREN TITEL WÄHLEN.`, true);
        return;
    }

    let source = cleaned;
    let number = 2;

    while (samples.some(other => other.key === source.toLowerCase())) {
        source = `${cleaned} ${number++}`;
    }

    const sample = {
        source,
        key: source.toLowerCase(),   // für <shuffle-samplesize: "…">
        color: colorTouched ? sampleColor.value : nextAutoColor(),
        count: 0
    };

    const hits = new Set();

    for (const token of tokens) {

        const info = lookup.get(token);

        if (!info || hits.has(info)) continue;
        hits.add(info);

        for (const form of [info.singular, info.plural]) {

            if (!form) continue;

            const key = form.toLowerCase();
            if (sampleKeys.has(key)) continue;

            sampleKeys.add(key);
            sampleEntries.push({ word: form, sample });
            sample.count++;

        }

    }

    if (sample.count === 0) {
        setSampleFeedback("KEINE NEUEN TREFFER IN DER WORTDATENBANK.", true);
        return;
    }

    samples.push(sample);

    sampleInput.value = "";
    setSampleFeedback(
        `${sample.count} WÖRTER AUS „${sample.source}“ ÜBERNOMMEN ` +
        `(${hits.size} TREFFER VON ${tokens.length} WÖRTERN).`
    );

    renderSampleLegend();
    previewAutoColor();
    refreshStatus();
    renderPoem();

}

sampleBtn.addEventListener("click", sampleText);


/* =====================================================================
   15. MUSIK
   =====================================================================

   Der Text der Ausgabe wird laufend in UTF-8-Bytes übersetzt. Jedes Byte
   ist ein Schritt (eine Sechzehntelnote) und erzeugt gleichzeitig
     - ein Drum-Muster: jedes der 8 Bits schaltet ein Instrument, und
     - eine Basstöne: der Byte-Wert bestimmt die Tonhöhe (a-Moll).
   Der Abspielzeiger läuft endlos durch den Text. Ändert sich der Text
   (Eingabe oder Wortwechsel), läuft er an seiner Stelle weiter; erst am
   Textende springt er an den Anfang.
   =================================================================== */

/*
  Bit → Instrument. Gegenüber der Grundidee (Kick, Snare, Hat, Open Hat,
  Clap, Rim, Tom, Crash) ist die Zuordnung so gewählt, dass die bei
  Großbuchstaben immer gesetzten Bits musikalisch sinnvoll sind:
  Bit 6 (bei allen Buchstaben gesetzt) = geschlossene Hi-Hat → ein
  durchlaufender Techno-Puls, der bei Leerzeichen aussetzt; Bit 7 (nur
  bei Umlauten/ß) = Crash als seltener Akzent.
*/
const DRUMS = [
    { bit: 0, key: "kick",  label: "KD", name: "KICK" },
    { bit: 1, key: "snare", label: "SD", name: "SNARE" },
    { bit: 2, key: "tom",   label: "TM", name: "TOM" },
    { bit: 3, key: "ohat",  label: "OH", name: "OPEN HAT" },
    { bit: 4, key: "clap",  label: "CP", name: "CLAP" },
    { bit: 5, key: "rim",   label: "RM", name: "RIM" },
    { bit: 6, key: "hat",   label: "HH", name: "HAT" },
    { bit: 7, key: "crash", label: "CR", name: "CRASH" }
];

// Bass: a-Moll über zwei Oktaven, Grundton A1 (MIDI 33)
const BASS_SCALE = [0, 2, 3, 5, 7, 8, 10];
const BASS_ROOT = 33;
const BASS_STEPS = BASS_SCALE.length * 2;

function bassIndex(byte) {
    return byte % BASS_STEPS;
}

function bassMidi(byte) {
    const index = bassIndex(byte);
    return BASS_ROOT + 12 * Math.floor(index / BASS_SCALE.length) + BASS_SCALE[index % BASS_SCALE.length];
}

// ---------- Text → Bytes ----------

let musicModel = { bytes: new Uint8Array(0), refs: [], glyphs: [] };

/*
  Baut aus der aktuellen Ausgabe das Musikmodell:
    bytes   UTF-8-Bytes des Ausgabetexts (Großbuchstaben, Wörter durch
            Leerzeichen getrennt, Zeilen durch Zeilenumbruch)
    refs    pro Byte die Stelle in der Ausgabe (für das Signal)
    glyphs  pro Byte das Zeichen (für das Pattern)
*/
function buildMusicModel() {

    const lines = [{ parts: [], br: null }];

    for (const token of currentTokens) {

        if (token.type === "br") {
            lines[lines.length - 1].br = token;
            lines.push({ parts: [], br: null });
            continue;
        }

        let text = "";

        if (token.type === "word") text = token.slot ? token.slot.word : "";
        else if (token.type === "operator") text = token.word;
        else if (token.type === "text") text = token.value;

        if (text) lines[lines.length - 1].parts.push({ token, text });

    }

    const bytes = [];
    const refs = [];
    const glyphs = [];
    const encoder = new TextEncoder();

    const push = (upper, ref, glyph) => {
        encoder.encode(upper).forEach((value, i) => {
            bytes.push(value);
            refs.push(ref);
            glyphs.push(i === 0 ? glyph : "·");
        });
    };

    for (const line of lines) {

        line.parts.forEach((part, partIndex) => {

            if (partIndex > 0) {
                push(" ", { gap: true, token: line.parts[partIndex - 1].token }, "_");
            }

            let offset = 0;

            for (const char of part.text) {
                const upper = char.toUpperCase();
                push(upper, { token: part.token, off: offset, len: char.length }, upper);
                offset += char.length;
            }

        });

        if (line.br) push("\n", { brEnd: true, token: line.br }, "¶");

    }

    return { bytes: Uint8Array.from(bytes), refs, glyphs };

}

function getMusicModel() {

    if (musicDirty) {
        musicModel = buildMusicModel();
        musicDirty = false;
        music.visDirty = true;
    }

    return musicModel;

}

// ---------- Klang (808 / Techno) ----------

const music = {
    ctx: null,
    master: null,
    drumBus: null,
    bassBus: null,
    noise: null,
    playing: false,
    position: 0,         // Index des nächsten Bytes im Text
    stepCounter: 0,      // laufender Schrittzähler (für Betonungen, unabhängig vom Text)
    nextTime: 0,         // Audiozeit des nächsten Schritts
    timer: null,
    queue: [],           // geplante Schritte für die Anzeige: { time, index }
    visIdx: -1,          // Byte-Index, der gerade zu hören ist
    visDirty: true
};

function ensureAudio() {

    if (!music.ctx) {

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return false;

        const ctx = new AudioContextClass();

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.ratio.value = 4;

        music.master = ctx.createGain();
        music.drumBus = ctx.createGain();
        music.bassBus = ctx.createGain();

        music.drumBus.gain.value = 0.9;
        music.bassBus.gain.value = 1;

        music.drumBus.connect(music.master);
        music.bassBus.connect(music.master);
        music.master.connect(compressor);
        compressor.connect(ctx.destination);

        // Weißes Rauschen (1,5 s), wird von allen Rausch-Klängen geteilt
        const length = Math.floor(ctx.sampleRate * 1.5);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

        music.noise = buffer;
        music.ctx = ctx;

        applyVolume();

    }

    if (music.ctx.state === "suspended") music.ctx.resume();

    return true;

}

// Hüllkurve: sofort auf peak, dann exponentiell nach unten
function envelope(param, time, peak, duration) {
    param.setValueAtTime(peak, time);
    param.exponentialRampToValueAtTime(0.001, time + duration);
}

function noiseVoice(time, duration, filterType, frequency, q, peak, bus) {

    const ctx = music.ctx;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    source.buffer = music.noise;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;

    envelope(gain.gain, time, peak, duration);

    source.connect(filter).connect(gain).connect(bus);
    source.start(time, Math.random() * 0.4);
    source.stop(time + duration + 0.02);

}

function toneVoice(time, type, startFreq, endFreq, rampTime, duration, peak, bus) {

    const ctx = music.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, time);
    if (endFreq !== startFreq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, time + rampTime);
    }

    envelope(gain.gain, time, peak, duration);

    osc.connect(gain).connect(bus);
    osc.start(time);
    osc.stop(time + duration + 0.02);

}

// Metallischer Klang der 808-Hi-Hat: sechs Rechteckwellen
const HAT_FREQUENCIES = [205.3, 304.4, 369.6, 522.7, 540, 800];

function metalVoice(time, duration, highpass, peak, bus) {

    const ctx = music.ctx;
    const hp = ctx.createBiquadFilter();
    const bp = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    hp.type = "highpass";
    hp.frequency.value = highpass;
    bp.type = "bandpass";
    bp.frequency.value = 10000;
    bp.Q.value = 0.6;

    envelope(gain.gain, time, peak, duration);

    hp.connect(bp).connect(gain).connect(bus);

    for (const frequency of HAT_FREQUENCIES) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = frequency;
        osc.connect(hp);
        osc.start(time);
        osc.stop(time + duration + 0.02);
    }

}

// Bass wird von der Kick kurz abgesenkt (Sidechain-Effekt)
function duckBass(time) {
    const param = music.bassBus.gain;
    param.cancelScheduledValues(time);
    param.setValueAtTime(0.2, time);
    param.linearRampToValueAtTime(1, time + 0.14);
}

const VOICES = {

    kick(time, v) {
        toneVoice(time, "sine", 165, 42, 0.12, 0.42, 1.0 * v, music.drumBus);
        toneVoice(time, "triangle", 900, 120, 0.015, 0.025, 0.3 * v, music.drumBus);
        duckBass(time);
    },

    snare(time, v) {
        noiseVoice(time, 0.18, "bandpass", 1900, 0.8, 0.55 * v, music.drumBus);
        toneVoice(time, "triangle", 330, 300, 0.05, 0.1, 0.35 * v, music.drumBus);
        toneVoice(time, "triangle", 185, 170, 0.05, 0.12, 0.45 * v, music.drumBus);
    },

    clap(time, v) {

        const ctx = music.ctx;
        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = music.noise;
        filter.type = "bandpass";
        filter.frequency.value = 1150;
        filter.Q.value = 1.4;

        // Drei kurze Schläge hintereinander, dann ein Ausklang
        const peak = 0.65 * v;
        gain.gain.setValueAtTime(0.0001, time);
        for (let burst = 0; burst < 3; burst++) {
            const t = time + burst * 0.011;
            gain.gain.setValueAtTime(peak, t);
            gain.gain.exponentialRampToValueAtTime(peak * 0.15, t + 0.009);
        }
        gain.gain.setValueAtTime(peak, time + 0.033);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        source.connect(filter).connect(gain).connect(music.drumBus);
        source.start(time, Math.random() * 0.4);
        source.stop(time + 0.22);

    },

    rim(time, v) {
        toneVoice(time, "triangle", 1700, 1700, 0, 0.035, 0.28 * v, music.drumBus);
        toneVoice(time, "sine", 500, 500, 0, 0.04, 0.3 * v, music.drumBus);
    },

    tom(time, v) {
        toneVoice(time, "sine", 210, 105, 0.22, 0.3, 0.6 * v, music.drumBus);
    },

    hat(time, v) {
        metalVoice(time, 0.05, 7000, 0.2 * v, music.drumBus);
    },

    ohat(time, v) {
        metalVoice(time, 0.3, 6500, 0.2 * v, music.drumBus);
    },

    crash(time, v) {
        noiseVoice(time, 0.9, "highpass", 3800, 0.7, 0.22 * v, music.drumBus);
        metalVoice(time, 0.7, 5000, 0.12 * v, music.drumBus);
    }

};

function playBass(time, byte, level) {

    const ctx = music.ctx;
    const frequency = 440 * Math.pow(2, (bassMidi(byte) - 69) / 12);

    const saw = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    saw.type = "sawtooth";
    sub.type = "sine";
    saw.frequency.value = frequency;
    sub.frequency.value = frequency;

    filter.type = "lowpass";
    filter.Q.value = 7;
    filter.frequency.setValueAtTime(300 + 900 * level, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + 0.13);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.5 * level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    saw.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(music.bassBus);

    saw.start(time);
    sub.start(time);
    saw.stop(time + 0.18);
    sub.stop(time + 0.18);

}

// Spielt ein Byte: Drums nach Bitmaske + Bass nach Byte-Wert
function playStep(byte, time, step) {

    // Betonung nach Position im Takt (Zählzeit > Achtel > Sechzehntel)
    const velocity = step % 4 === 0 ? 1 : step % 2 === 0 ? 0.8 : 0.62;

    for (const drum of DRUMS) {
        if ((byte >> drum.bit) & 1) VOICES[drum.key](time, velocity);
    }

    playBass(time, byte, step % 4 === 2 ? 1 : 0.7);

}

// ---------- Planer ----------

function secondsPerStep() {
    return 60 / Number(tempoInput.value) / 4;
}

/*
  Plant die nächsten Schritte im Voraus (präzises Audio-Timing). Der Text
  wird bei jedem Schritt neu gelesen: Änderungen werden sofort wirksam,
  der Zeiger (music.position) läuft einfach weiter.
*/
function musicScheduler() {

    if (!music.playing) return;

    while (music.nextTime < music.ctx.currentTime + MUSIC_SCHEDULE_AHEAD) {

        const model = getMusicModel();
        const length = model.bytes.length;
        let index = -1;

        if (length > 0) {

            // Textende erreicht (oder Text wurde kürzer): zurück zum Anfang
            if (music.position >= length) music.position = 0;

            index = music.position;
            playStep(model.bytes[index], music.nextTime, music.stepCounter);
            music.position++;

        }

        music.queue.push({ time: music.nextTime, index });
        music.stepCounter++;
        music.nextTime += secondsPerStep();

    }

    music.timer = setTimeout(musicScheduler, MUSIC_LOOKAHEAD_MS);

}

function startMusic() {

    if (!ensureAudio()) {
        musicStatus.textContent = "WEB AUDIO WIRD NICHT UNTERSTÜTZT";
        return;
    }

    music.playing = true;
    music.nextTime = music.ctx.currentTime + 0.05;

    playBtn.textContent = "PAUSE";

    musicScheduler();

}

function pauseMusic() {

    music.playing = false;
    clearTimeout(music.timer);

    playBtn.textContent = "PLAY";

    music.visDirty = true;

}

playBtn.addEventListener("click", () => {
    if (music.playing) pauseMusic();
    else startMusic();
});

// ---------- Regler ----------

function applyVolume() {

    const value = Number(volumeInput.value) / 100;

    volumeValue.textContent = String(volumeInput.value);

    if (music.master) {
        music.master.gain.setTargetAtTime(value * value, music.ctx.currentTime, 0.02);
    }

}

tempoInput.addEventListener("input", () => {
    tempoValue.textContent = `${tempoInput.value} BPM`;
});

volumeInput.addEventListener("input", applyVolume);

// ---------- Pattern (mitlaufende Anzeige) ----------

const patternRows = [];

function buildPatternView() {

    patternEl.replaceChildren();
    patternRows.length = 0;

    // Kopfzeile: Kürzel der Instrumente
    const head = document.createElement("div");
    head.className = "pattern-row pattern-head";

    for (const drum of DRUMS) {
        const label = document.createElement("span");
        label.textContent = drum.label;
        label.title = drum.name;
        head.appendChild(label);
    }

    for (const [text, title] of [["BS", "BASS (BALKENLÄNGE = TONHÖHE)"], ["TX", "ZEICHEN IM TEXT"]]) {
        const label = document.createElement("span");
        label.textContent = text;
        label.title = title;
        head.appendChild(label);
    }

    patternEl.appendChild(head);

    for (let r = 0; r < PATTERN_ROWS; r++) {

        const row = document.createElement("div");
        row.className = "pattern-row";

        const cells = DRUMS.map(() => {
            const cell = document.createElement("div");
            cell.className = "cell";
            row.appendChild(cell);
            return cell;
        });

        const bass = document.createElement("div");
        bass.className = "cell cell-bass";
        row.appendChild(bass);

        const glyph = document.createElement("div");
        glyph.className = "cell-glyph";
        row.appendChild(glyph);

        patternEl.appendChild(row);
        patternRows.push({ row, cells, bass, glyph });

    }

}

const wrapIndex = (value, length) => ((value % length) + length) % length;

// Zeigt die Schritte rund um den aktuellen (oder vor dem Start: um den Textanfang)
function updatePattern() {

    const model = musicModel;
    const length = model.bytes.length;
    const played = music.visIdx >= 0 && length > 0;
    const center = played ? Math.min(music.visIdx, length - 1) : 0;

    patternRows.forEach((item, r) => {

        const index = length > 0 ? wrapIndex(center - PATTERN_NOW_ROW + r, length) : -1;
        const byte = index >= 0 ? model.bytes[index] : null;

        item.row.classList.toggle("is-now", played && r === PATTERN_NOW_ROW);
        item.row.classList.toggle("is-past", r < PATTERN_NOW_ROW);

        DRUMS.forEach((drum, k) => {
            item.cells[k].classList.toggle("on", byte !== null && ((byte >> drum.bit) & 1) === 1);
        });

        item.bass.classList.toggle("on", byte !== null);

        if (byte !== null) {
            item.bass.style.setProperty("--w", `${Math.round(((bassIndex(byte) + 1) / BASS_STEPS) * 100)}%`);
        }

        item.glyph.textContent = index >= 0 ? model.glyphs[index] : "";

    });

    if (length === 0) {
        musicStatus.textContent = music.playing ? "LÄUFT – KEIN TEXT" : "PAUSE – KEIN TEXT";
    } else if (played) {
        musicStatus.textContent =
            `${music.playing ? "LÄUFT" : "PAUSE"} · BYTE ${Math.min(music.visIdx, length - 1) + 1} / ${length}`;
    } else {
        musicStatus.textContent = `PAUSE · ${length} BYTES`;
    }

}

// ---------- Signal in der Ausgabe ----------

// Rechteck (Bildschirmkoordinaten) der Stelle in der Ausgabe, die ein Byte erzeugt hat
function refGeometry(ref) {

    const fontSize = parseFloat(getComputedStyle(output).fontSize) || 16;

    try {

        if (ref.len !== undefined) {
            const rect = charRect(ref.token.el, ref.off, ref.len);
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }

        if (ref.gap) {
            const rect = ref.token.box.getBoundingClientRect();
            return { left: rect.right, top: rect.top, width: fontSize * 0.5, height: rect.height };
        }

        if (ref.brEnd) {
            const line = ref.token.lineEl;
            const lastChild = line.lastElementChild;
            if (lastChild) {
                const rect = lastChild.getBoundingClientRect();
                return { left: rect.right, top: rect.top, width: fontSize * 0.6, height: rect.height };
            }
            const rect = line.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: fontSize * 0.6, height: rect.height };
        }

    } catch (error) {
        return null;
    }

    return null;

}

function updateMarker() {

    const model = musicModel;
    const length = model.bytes.length;

    if (music.visIdx < 0 || length === 0) {
        markerEl.hidden = true;
        return;
    }

    const geometry = refGeometry(model.refs[Math.min(music.visIdx, length - 1)]);

    if (!geometry) {
        markerEl.hidden = true;
        return;
    }

    const coords = toOutputCoords(geometry.left, geometry.top);

    markerEl.style.left = `${coords.left - 1}px`;
    markerEl.style.top = `${coords.top}px`;
    markerEl.style.width = `${geometry.width + 2}px`;
    markerEl.style.height = `${geometry.height}px`;
    markerEl.hidden = false;

    // Ausgabe mitscrollen – aber nie, während man selbst arbeitet
    const busy =
        document.activeElement === codeInput ||
        document.activeElement === output ||
        Date.now() - lastUserScroll < FOLLOW_PAUSE_MS;

    if (followBox.checked && !busy) {
        ensureOutputVisible(coords.top, geometry.height);
    }

}

// ---------- Bildlauf: Anzeige im Takt der Audiozeit ----------

function frame() {

    // Schritte, die gerade hörbar werden
    if (music.ctx && music.queue.length > 0) {

        const now = music.ctx.currentTime;

        while (music.queue.length > 0 && music.queue[0].time <= now) {
            music.visIdx = music.queue.shift().index;
            music.visDirty = true;
        }

    }

    // Text oder Layout der Ausgabe hat sich geändert
    if (musicDirty) getMusicModel();

    if (overlaysDirty) {
        overlaysDirty = false;
        updateOutputCaret(false);
        music.visDirty = true;
    }

    if (music.visDirty) {
        music.visDirty = false;
        updatePattern();
        updateMarker();
    }

    requestAnimationFrame(frame);

}

window.addEventListener("resize", () => { overlaysDirty = true; });


/* =====================================================================
   16. START
   ===================================================================== */

createCheatButtons();
renderCustomWords();
renderSampleLegend();
ownColor.value = ownSample.color;
previewAutoColor();
buildPatternView();
applyVolume();
tempoValue.textContent = `${tempoInput.value} BPM`;
renderHighlight();
renderPoem();

// Zeitgeber für alle Zufallswörter
setInterval(tick, TICK_MS);

// Anzeige der Musik (Pattern, Signal, Cursor)
requestAnimationFrame(frame);

loadWordList();
