
"use strict";

// ==========================================
// ELEMENTE
// ==========================================

const codeInput = document.getElementById("code-input");
const cheatButtons = document.getElementById("cheat-buttons");

const output = document.getElementById("output");
const statusText = document.getElementById("status-text");
const loader = document.getElementById("loader");

const clearBtn = document.getElementById("clear-btn");
const copyBtn = document.getElementById("copy-btn");

const wordForm = document.getElementById("word-form");
const wordInput = document.getElementById("word-input");
const wordFeedback = document.getElementById("word-feedback");

const chipList = document.getElementById("chip-list");
const resetWordsBtn = document.getElementById("reset-words-btn");


// ==========================================
// DATEN
// ==========================================

let wordDatabase = [];
let customWords = [];

const buildingBlocks = [
    "<shuffle-words>",
    '<equality-operator: "==">',
    '<equality-operator: "!=">',
    "<random-word>",
    "<random-noun>",
    "<random-name>",
    "<line-break>",
    "<shuffle-lines>",
    "<uppercase>",
    "<lowercase>",
    "<repeat>",
    "<end>"
];


// ==========================================
// WORTLISTE LADEN
// ==========================================

async function loadWordList() {

    try {

        if (statusText) {
            statusText.textContent = "LADE WORTLISTE ...";
        }

        if (loader) {
            loader.style.display = "block";
        }

        // words.json liegt im selben Ordner
        // wie die HTML-Datei.

        const response = await fetch(
            new URL("./words.json", document.baseURI),
            { cache: "no-cache" }
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${response.statusText}`
            );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error(
                "words.json enthält kein gültiges JSON-Array."
            );
        }

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

        if (statusText) {
            statusText.textContent =
                `WORTLISTE GELADEN: ${wordDatabase.length} WÖRTER`;
        }

        renderPoem();

    } catch (error) {

        console.error("WORTLISTEN-FEHLER:", error);

        if (statusText) {
            statusText.textContent =
                "FEHLER: WORTLISTE NICHT GELADEN";
        }

    } finally {

        if (loader) {
            loader.style.display = "none";
        }

    }

}


// ==========================================
// ZUFALLSFUNKTIONEN
// ==========================================

function randomItem(array) {

    if (!array || array.length === 0) {
        return "";
    }

    const index = Math.floor(
        Math.random() * array.length
    );

    return array[index];

}


function getRandomWord() {

    return randomItem([
        ...wordDatabase,
        ...customWords
    ]);

}


function getRandomNoun() {

    // Die German-Nouns-Datenbank enthält
    // deutsche Substantive.

    return randomItem([
        ...wordDatabase,
        ...customWords
    ]);

}


function getRandomName() {

    // Ohne separate Namensdatenbank
    // ist keine echte Namensauswahl möglich.

    return randomItem(customWords);

}


// ==========================================
// BAUSTEINE ERZEUGEN
// ==========================================

function createCheatButtons() {

    if (!cheatButtons) return;

    cheatButtons.innerHTML = "";

    buildingBlocks.forEach(block => {

        const button = document.createElement("button");

        button.type = "button";
        button.textContent = block;

        button.addEventListener("click", () => {
            insertAtCursor(block);
        });

        cheatButtons.appendChild(button);

    });

}


// ==========================================
// BAUSTEINE EINFÜGEN
// ==========================================

function insertAtCursor(text) {

    if (!codeInput) return;

    const start = codeInput.selectionStart;
    const end = codeInput.selectionEnd;

    const currentText = codeInput.value;

    codeInput.value =
        currentText.substring(0, start) +
        text +
        currentText.substring(end);

    const newPosition = start + text.length;

    codeInput.focus();

    codeInput.setSelectionRange(
        newPosition,
        newPosition
    );

    codeInput.dispatchEvent(
        new Event("input", { bubbles: true })
    );

}


// ==========================================
// SHUFFLE
// ==========================================

function shuffleArray(array) {

    const result = [...array];

    for (let i = result.length - 1; i > 0; i--) {

        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [result[i], result[j]] =
            [result[j], result[i]];

    }

    return result;

}


// ==========================================
// GEDICHT GENERIEREN
// ==========================================

function generatePoem(code) {

    let poem = code;

    // Zufallswörter einsetzen

    poem = poem.replace(
        /<random-word>/gi,
        () => getRandomWord() || "[KEIN WORT]"
    );

    poem = poem.replace(
        /<random-noun>/gi,
        () => getRandomNoun() || "[KEIN SUBSTANTIV]"
    );

    poem = poem.replace(
        /<random-name>/gi,
        () => getRandomName() || "[KEIN NAME]"
    );

    // Gleichheitsoperatoren

    poem = poem.replace(
        /<equality-operator:\s*"==">/gi,
        "=="
    );

    poem = poem.replace(
        /<equality-operator:\s*"!=">/gi,
        "!="
    );

    // Zeilenumbrüche

    poem = poem.replace(
        /<line-break>/gi,
        "\n"
    );

    // Shuffle der Wörter

    if (/<shuffle-words>/i.test(poem)) {

        poem = poem.replace(
            /<shuffle-words>/gi,
            ""
        );

        const words = poem.trim().split(/\s+/);

        poem = shuffleArray(words).join(" ");

    }

    // Shuffle der Zeilen

    if (/<shuffle-lines>/i.test(poem)) {

        poem = poem.replace(
            /<shuffle-lines>/gi,
            ""
        );

        poem = shuffleArray(
            poem.split("\n")
        ).join("\n");

    }

    // Großschreibung

    if (/<uppercase>/i.test(poem)) {

        poem = poem.replace(
            /<uppercase>/gi,
            ""
        );

        poem = poem.toUpperCase();

    }

    // Kleinschreibung

    if (/<lowercase>/i.test(poem)) {

        poem = poem.replace(
            /<lowercase>/gi,
            ""
        );

        poem = poem.toLowerCase();

    }

    // Wiederholung der letzten Zeile

    if (/<repeat>/i.test(poem)) {

        poem = poem.replace(
            /<repeat>/gi,
            ""
        );

        const lines = poem.split("\n");

        const lastLine = [...lines]
            .reverse()
            .find(line => line.trim() !== "");

        if (lastLine) {
            poem += "\n" + lastLine;
        }

    }

    // Ende der Ausführung

    const endPosition = poem.search(/<end>/i);

    if (endPosition !== -1) {
        poem = poem.substring(0, endPosition);
    }

    return poem.trim();

}


// ==========================================
// GEDICHT AUSGEBEN
// ==========================================

function renderPoem() {

    if (!codeInput || !output) return;

    const code = codeInput.value;

    if (!code.trim()) {

        output.textContent = "";

        const placeholder = document.createElement("span");

        placeholder.className = "preview-placeholder";
        placeholder.textContent = "VORSCHAU";

        output.appendChild(placeholder);

        return;

    }

    const poem = generatePoem(code);

    // Text statt innerHTML verwenden:
    // verhindert die Interpretation von HTML.

    output.textContent = poem;

}


// ==========================================
// LIVE-CODING
// ==========================================

if (codeInput) {

    codeInput.addEventListener(
        "input",
        renderPoem
    );

}


// ==========================================
// EINGABE LEEREN
// ==========================================

if (clearBtn) {

    clearBtn.addEventListener("click", () => {

        if (codeInput) {
            codeInput.value = "";
        }

        renderPoem();

    });

}


// ==========================================
// AUSGABE KOPIEREN
// ==========================================

if (copyBtn) {

    copyBtn.addEventListener("click", async () => {

        const poem = output?.textContent || "";

        try {

            await navigator.clipboard.writeText(poem);

            copyBtn.textContent = "KOPIERT!";

            setTimeout(() => {
                copyBtn.textContent = "AUSGABE KOPIEREN";
            }, 1500);

        } catch (error) {

            console.error("KOPIERFEHLER:", error);

            copyBtn.textContent = "KOPIEREN FEHLGESCHLAGEN";

        }

    });

}


// ==========================================
// EIGENE WÖRTER
// ==========================================

function renderCustomWords() {

    if (!chipList) return;

    chipList.innerHTML = "";

    customWords.forEach(word => {

        const li = document.createElement("li");

        li.textContent = word;

        chipList.appendChild(li);

    });

}


if (wordForm) {

    wordForm.addEventListener("submit", event => {

        event.preventDefault();

        const word = wordInput.value.trim();

        if (!word) return;

        if (customWords.includes(word)) {

            if (wordFeedback) {
                wordFeedback.textContent =
                    "DIESES WORT EXISTIERT BEREITS.";
            }

            return;

        }

        customWords.push(word);

        wordInput.value = "";

        if (wordFeedback) {
            wordFeedback.textContent =
                "WORT HINZUGEFÜGT.";
        }

        renderCustomWords();
        renderPoem();

    });

}


// ==========================================
// EIGENE WÖRTER ZURÜCKSETZEN
// ==========================================

if (resetWordsBtn) {

    resetWordsBtn.addEventListener("click", () => {

        customWords = [];

        renderCustomWords();
        renderPoem();

        if (wordFeedback) {
            wordFeedback.textContent =
                "EIGENE WÖRTER ZURÜCKGESETZT.";
        }

    });

}


// ==========================================
// START
// ==========================================

createCheatButtons();

renderCustomWords();

loadWordList();
