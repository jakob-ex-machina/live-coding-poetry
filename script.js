"use strict";

/* =====================================================================
   LIVE CODING POETRY

   Die Sprache besteht aus diesen Bausteinen:

     <shuffle-word>                  ein Zufallswort, das sich regelmäßig ändert
     <br>                             Zeilenumbruch
     <equality-operator: "==">        Operatoren (werden als Wort ausgegeben,
     <comparison-operator: ">"> ...   z. B. "==" → "wie", ">" → "größer als")
     <shuffle-time: 5> ... </shuffle-time>
                                      legt die Wechselzeit (Sekunden) der
                                      Zufallswörter dazwischen fest

   Alles andere im Eingabefeld ist normaler Text. Zeilenumbrüche und
   Mehrfach-Leerzeichen im Eingabefeld sind nur Formatierung – eine
   Ausgabezeile entsteht ausschließlich durch <br>.

   Zusätze:
     - "NUR EIGENE WÖRTER": Zufallswörter kommen nur aus eigenen Wörtern
       (und Samples), die Wortliste wird ignoriert.
     - Eigene Wörter lassen sich per Semikolon gesammelt hinzufügen.
     - SAMPLE: Fremdtext wird gegen die Wortdatenbank abgeglichen; Treffer
       (Singular + Plural) kommen farbig markiert in den Pool.
   ===================================================================== */


/* =====================================================================
   1. KONFIGURATION
   ===================================================================== */

// Standard-Wechselzeit eines Zufallsworts (ohne <shuffle-time>)
const DEFAULT_SHUFFLE_SECONDS = 10;

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


/* =====================================================================
   2. ELEMENTE
   ===================================================================== */

const codeInput = document.getElementById("code-input");
const cheatButtons = document.getElementById("cheat-buttons");

const output = document.getElementById("output");
const statusText = document.getElementById("status-text");
const loader = document.getElementById("loader");

const clearBtn = document.getElementById("clear-btn");
const copyBtn = document.getElementById("copy-btn");
const copyLabel = copyBtn.textContent;   // Originalbeschriftung merken

const wordForm = document.getElementById("word-form");
const wordInput = document.getElementById("word-input");
const wordFeedback = document.getElementById("word-feedback");
const onlyCustomBox = document.getElementById("only-custom");

const chipList = document.getElementById("chip-list");
const resetWordsBtn = document.getElementById("reset-words-btn");

const sampleInput = document.getElementById("sample-input");
const sampleSource = document.getElementById("sample-source");
const sampleColor = document.getElementById("sample-color");
const sampleBtn = document.getElementById("sample-btn");
const sampleFeedback = document.getElementById("sample-feedback");
const sampleLegend = document.getElementById("sample-legend");


/* =====================================================================
   3. DATEN
   ===================================================================== */

// Wörter aus words.json (German-Nouns-Datenbank)
let wordDatabase = [];

// Vom Nutzer hinzugefügte Wörter
let customWords = [];

// true = Wortliste ignorieren, nur eigene Wörter + Samples verwenden
let useOnlyCustom = false;

/*
  Invertierte Lookup-Map (beim Laden gebaut):
    Form (klein geschrieben) → { lemma, singular, plural }
  Wird vom Sampling genutzt, um Tokens eines Fremdtexts zu erkennen.
*/
const lookup = new Map();

/*
  Sample-Pool: ein Eintrag pro importiertem Wort
    { word, sample }  mit  sample = { source, color, count }
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
    hint    = Tooltip
*/
const BUILDING_BLOCKS = [
    {
        text: "<shuffle-word>",
        hint: "EIN ZUFALLSWORT, DAS SICH REGELMÄSSIG ÄNDERT"
    },
    {
        text: "<br>",
        hint: "ZEILENUMBRUCH"
    },
    ...OPERATORS.map(op => ({
        text: `<${op.type}: "${op.symbol}">`,
        hint: `WIRD AUSGEGEBEN ALS: ${op.word.toUpperCase()}`
    })),
    {
        text: "<shuffle-time: 5>",
        wrapEnd: "</shuffle-time>",
        hint: "WECHSELZEIT DER ZUFALLSWÖRTER IN SEKUNDEN – MIT MARKIERUNG NUR FÜR DIE AUSWAHL"
    },
    {
        text: "</shuffle-time>",
        hint: "ENDE DER WECHSELZEIT (DANACH GILT WIEDER DIE VORHERIGE)"
    }
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

    if (useOnlyCustom) {
        const size = customWords.length + sampleEntries.length;
        statusText.textContent = `MODUS: NUR EIGENE WÖRTER (${size})`;
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
  Zieht ein Zufallswort aus dem Pool: Wortliste (außer im Modus "nur
  eigene Wörter") + eigene Wörter + Sample-Wörter. Es wird ein gemeinsamer
  Index über alle Teile gewürfelt (ohne die 150.000+ Wörter bei jedem
  Wechsel zu kopieren). Das vorherige Wort wird – wenn möglich – nicht
  direkt wiederholt.

  Rückgabe: { word, sample }  (sample = null bei normalen Wörtern)
*/
function pickEntry(previous = "") {

    const dbSize = useOnlyCustom ? 0 : wordDatabase.length;
    const total = dbSize + customWords.length + sampleEntries.length;

    if (total === 0) return { word: "", sample: null };

    let entry = { word: "", sample: null };

    for (let attempt = 0; attempt < 5; attempt++) {

        let index = Math.floor(Math.random() * total);

        if (index < dbSize) {
            entry = { word: wordDatabase[index], sample: null };
        } else if ((index -= dbSize) < customWords.length) {
            entry = { word: customWords[index], sample: null };
        } else {
            const sampled = sampleEntries[index - customWords.length];
            entry = { word: sampled.word, sample: sampled.sample };
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

    BUILDING_BLOCKS.forEach(block => {

        const button = document.createElement("button");

        button.type = "button";
        button.className = "cheat-btn";
        button.textContent = block.text;
        button.title = block.hint;

        button.addEventListener("click", () => insertBlock(block));

        cheatButtons.appendChild(button);

    });

}

/*
  Fügt einen Baustein an der Cursorposition ein.
  Hat der Baustein ein wrapEnd (<shuffle-time>) und ist Text markiert,
  wird die Markierung umschlossen. So wirkt die Zeit nur auf die Auswahl.
*/
function insertBlock(block) {

    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;

    let insertion = block.text;

    if (block.wrapEnd && start !== end) {
        insertion =
            block.text +
            codeInput.value.substring(start, end) +
            block.wrapEnd;
    }

    // Ersetzt die Markierung und setzt den Cursor hinter den Einfügetext
    codeInput.setRangeText(insertion, start, end, "end");

    codeInput.focus();

    // Ausgabe aktualisieren
    codeInput.dispatchEvent(new Event("input", { bubbles: true }));

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

// <shuffle-time: 5>, auch 2.5 oder 2,5, optional mit "s"
const SHUFFLE_TIME_OPEN = /^<shuffle-time:\s*(\d+(?:[.,]\d+)?)\s*(?:s|sek)?\s*>$/;

// Zeilenumbruch: <br>, <br/>, <br />
const BREAK_TAG = /^<br\s*\/?>$/;

/*
  Wandelt den Code in eine Liste von Elementen um:

    { type: "text",     value }     normaler Text
    { type: "word",     seconds }   Zufallswort mit seiner Wechselzeit
    { type: "operator", word }      Operator als Wort
    { type: "br" }                  Zeilenumbruch
    { type: "error",    value }     unbekannter / falsch verwendeter Baustein

  <shuffle-time> erzeugt kein eigenes Element. Es steuert nur die Zeit
  der folgenden Zufallswörter. Die Zeiten werden in einem Stapel geführt:
    - <shuffle-time: n> legt eine Zeit oben auf den Stapel,
    - </shuffle-time> nimmt sie wieder weg (es gilt die vorherige Zeit),
    - ohne schließenden Baustein gilt die Zeit bis zum Ende des Codes.
*/
function parseCode(code) {

    const tokens = [];
    const timeStack = [];
    let lastIndex = 0;

    // Aktuell gültige Wechselzeit (oberstes Element des Stapels)
    const currentSeconds = () =>
        timeStack.length > 0
            ? timeStack[timeStack.length - 1]
            : DEFAULT_SHUFFLE_SECONDS;

    // Text zwischen zwei Bausteinen: Whitespace vereinheitlichen
    const pushText = raw => {
        const value = raw.replace(/\s+/g, " ").trim();
        if (value) tokens.push({ type: "text", value });
    };

    for (const match of code.matchAll(TAG_REGEX)) {

        pushText(code.slice(lastIndex, match.index));
        lastIndex = match.index + match[0].length;

        const raw = match[0];
        const tag = raw.toLowerCase();

        // --- Zufallswort ---
        if (tag === "<shuffle-word>") {
            tokens.push({ type: "word", seconds: currentSeconds() });
            continue;
        }

        // --- Zeilenumbruch ---
        if (BREAK_TAG.test(tag)) {
            tokens.push({ type: "br" });
            continue;
        }

        // --- Wechselzeit beginnt ---
        const timeMatch = SHUFFLE_TIME_OPEN.exec(tag);

        if (timeMatch) {
            const seconds = parseFloat(timeMatch[1].replace(",", "."));
            timeStack.push(
                Math.min(MAX_SHUFFLE_SECONDS, Math.max(MIN_SHUFFLE_SECONDS, seconds))
            );
            continue;
        }

        // --- Wechselzeit endet ---
        if (tag === "</shuffle-time>") {
            if (timeStack.length > 0) {
                timeStack.pop();
            } else {
                // schließender Baustein ohne öffnenden
                tokens.push({ type: "error", value: raw });
            }
            continue;
        }

        // --- Operator ---
        const operator = OPERATOR_RULES.find(rule => rule.pattern.test(tag));

        if (operator) {
            tokens.push({ type: "operator", word: operator.word });
            continue;
        }

        // --- Alles andere: unbekannter Baustein ---
        tokens.push({ type: "error", value: raw });

    }

    // Text nach dem letzten Baustein
    pushText(code.slice(lastIndex));

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
    const entry = pickEntry(slot.word);
    slot.word = entry.word;
    slot.sample = entry.sample;
    showWord(slot);
    updateSlotView(slot);
}

// Hold-Button / Klassen an den Zustand (held, Sample) anpassen
function updateSlotView(slot) {

    slot.wrapEl.classList.toggle("is-held", slot.held);

    // Sample-Markierung: Farbe als CSS-Variable, Quelle als Tooltip
    slot.wrapEl.classList.toggle("is-sample", Boolean(slot.sample));

    if (slot.sample) {
        slot.wrapEl.style.setProperty("--sample-color", slot.sample.color);
        slot.wrapEl.title = `SAMPLE: ${slot.sample.source}`;
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

}


/* =====================================================================
   9. AUSGABE
   ===================================================================== */

// Elemente der letzten Ausgabe (für "Ausgabe kopieren")
let currentTokens = [];

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

    // Nichts auszugeben: Ausgabe leeren (CSS zeigt dann "VORSCHAU")
    if (tokens.length === 0) {
        slots.length = 0;
        output.replaceChildren();
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
                line = createLine();
                fragment.appendChild(line);
                break;

            case "text":
                line.appendChild(createSpan("text", token.value));
                break;

            case "operator":
                line.appendChild(createSpan("operator", token.word));
                break;

            case "error":
                line.appendChild(createSpan("error", token.value));
                break;

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

                // Noch kein Wort (z. B. Wortliste war noch nicht geladen)
                if (!slot.word) {
                    const entry = pickEntry();
                    slot.word = entry.word;
                    slot.sample = entry.sample;
                }

                token.slot = slot;
                line.appendChild(buildShuffleElement(slot));
                slotIndex++;
                break;

            }

        }

    }

    // Überzählige Slots (Zufallswörter wurden aus dem Code gelöscht) entfernen
    slots.length = slotIndex;

    output.replaceChildren(fragment);

    output.scrollTop = scrollTop;

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
   10. LIVE-CODING, LEEREN, KOPIEREN
   ===================================================================== */

// Bei jeder Eingabe wird die Ausgabe sofort neu aufgebaut
codeInput.addEventListener("input", renderPoem);

clearBtn.addEventListener("click", () => {
    codeInput.value = "";
    renderPoem();
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
   11. EIGENE WÖRTER
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

// Modus "nur eigene Wörter": Wortliste wird im Pool ignoriert
onlyCustomBox.addEventListener("change", () => {

    useOnlyCustom = onlyCustomBox.checked;

    refreshStatus();

    if (useOnlyCustom && customWords.length + sampleEntries.length === 0) {
        setFeedback("NOCH KEINE EIGENEN WÖRTER – ZUERST WÖRTER HINZUFÜGEN.", true);
    } else {
        setFeedback("");
    }

    // Leere Slots können jetzt ein Wort bekommen
    renderPoem();

});


/* =====================================================================
   12. SAMPLE (FREMDTEXT)
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

    const used = samples.map(sample => hexToHue(sample.color));

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

// Legende: Farbfeld + Titel + Anzahl Wörter + Entfernen
function renderSampleLegend() {

    sampleLegend.replaceChildren();

    for (const sample of samples) {

        const li = document.createElement("li");
        li.className = "chip";

        const swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = sample.color;

        const label = document.createElement("span");
        label.textContent = `${sample.source} (${sample.count})`;

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "chip-remove";
        removeBtn.textContent = "×";
        removeBtn.setAttribute("aria-label", `Sample entfernen: ${sample.source}`);
        removeBtn.addEventListener("click", () => removeSample(sample));

        li.append(swatch, label, removeBtn);
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

    const sample = {
        source: sampleSource.value.trim() || DEFAULT_SAMPLE_SOURCE,
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
   13. START
   ===================================================================== */

createCheatButtons();
renderCustomWords();
renderSampleLegend();
previewAutoColor();
renderPoem();

// Zeitgeber für alle Zufallswörter
setInterval(tick, TICK_MS);

loadWordList();
