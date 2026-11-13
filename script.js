
const codeInput = document.getElementById("code-input");
const cheatButtons = document.getElementById("cheat-buttons");

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

function createCheatButtons() {
  if (!cheatButtons) return;

  cheatButtons.innerHTML = "";

  buildingBlocks.forEach((block) => {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = block;

    button.addEventListener("click", () => {
      insertAtCursor(block);
    });

    cheatButtons.appendChild(button);
  });
}

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

createCheatButtons();
