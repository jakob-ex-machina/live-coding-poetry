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

const chipList = document.getElementById("chip-list");
const resetWordsBtn = document.getElementById("reset-words-btn");


/* =====================================================================
   3. DATEN
   ===================================================================== */

// Wörter aus words.json (German-Nouns-Datenbank)
let wordDatabase = [];

// Vom Nutzer hinzugefügte Wörter
let customWords = [];

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

async function loadWordList() {

    try {

        statusText.textContent = "LADE WORTLISTE …";
        statusText.classList.remove("is-warning");
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

        // Nur Strings, getrimmt, ohne leere Einträge, ohne Duplikate
        wordDatabase = [
            ...new Set(
                data
                    .filter(word => typeof word === "string")
                    .map(word => word.trim())
                    .filter(Boolean)
            )
        ];

        if (wordDatabase.length === 0) {
            throw new Error("Die Wortliste enthält keine Wörter.");
        }

        statusText.textContent =
            `WORTLISTE GELADEN: ${wordDatabase.length} WÖRTER`;

        // Bereits angezeigte Zufallswörter ohne Wort bekommen jetzt eins
        renderPoem();

    } catch (error) {

        console.error("WORTLISTEN-FEHLER:", error);

        statusText.textContent = "FEHLER: WORTLISTE NICHT GELADEN";
        statusText.classList.add("is-warning");

    } finally {

        loader.hidden = true;

    }

}


/* =====================================================================
   5. ZUFALLSWORT
   ===================================================================== */

/*
  Zieht ein Zufallswort aus Wortliste + eigenen Wörtern. Es wird ein
  gemeinsamer Index über beide Listen gewürfelt (ohne die 150.000+
  Wörter bei jedem Wechsel zu kopieren). Das vorherige Wort wird – wenn
  möglich – nicht direkt wiederholt.
*/
function pickWord(previous = "") {

    const total = wordDatabase.length + customWords.length;

    if (total === 0) return "";

    let word = "";

    for (let attempt = 0; attempt < 5; attempt++) {

        const index = Math.floor(Math.random() * total);

        word = index < wordDatabase.length
            ? wordDatabase[index]
            : customWords[index - wordDatabase.length];

        if (word !== previous) break;

    }

    return word;

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
    held       true = eingefroren
    intervalMs Wechselzeit in Millisekunden
    nextChange Zeitpunkt (performance.now) des nächsten Wechsels
    wrapEl / wordEl / holdBtn   zugehörige DOM-Elemente
*/
const slots = [];

function createSlot() {
    return {
        word: "",
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
    slot.word = pickWord(slot.word);
    showWord(slot);
}

// Hold-Button / Klassen an den Zustand (held oder nicht) anpassen
function updateSlotView(slot) {

    slot.wrapEl.classList.toggle("is-held", slot.held);

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
                    slot.word = pickWord();
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

// Liste der eigenen Wörter als Chips (mit Entfernen-Button) anzeigen
function renderCustomWords() {

    chipList.replaceChildren();

    customWords.forEach((word, index) => {

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
            setFeedback("WORT ENTFERNT.");
        });

        li.append(label, removeBtn);
        chipList.appendChild(li);

    });

}

wordForm.addEventListener("submit", event => {

    event.preventDefault();

    const word = wordInput.value.trim();

    if (!word) return;

    // Duplikate (Groß-/Kleinschreibung egal) verhindern
    const exists = customWords.some(
        existing => existing.toLowerCase() === word.toLowerCase()
    );

    if (exists) {
        setFeedback("DIESES WORT EXISTIERT BEREITS.", true);
        return;
    }

    customWords.push(word);
    wordInput.value = "";

    setFeedback("WORT HINZUGEFÜGT.");
    renderCustomWords();

    // Falls noch keine Wörter vorhanden waren, bekommen leere Slots jetzt eins
    renderPoem();

});

resetWordsBtn.addEventListener("click", () => {

    customWords = [];

    renderCustomWords();
    setFeedback("EIGENE WÖRTER ZURÜCKGESETZT.");

});


/* =====================================================================
   12. START
   ===================================================================== */

createCheatButtons();
renderCustomWords();
renderPoem();

// Zeitgeber für alle Zufallswörter
setInterval(tick, TICK_MS);

loadWordList();
