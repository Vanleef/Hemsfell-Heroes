import fs from "node:fs";

const guardPath = "app/match-ui-guard.tsx";
let guard = fs.readFileSync(guardPath, "utf8");
const marker = "export default function MatchUiGuard() {";
const helper = String.raw`function layoutHandLimitChoices() {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(".maintenance, .maintenance-dialog, .engine-decision-panel"));
  const dialog = dialogs.find((node) => /LIMITE DE MÃO/i.test(node.textContent || ""));
  if (!dialog) return;
  dialog.classList.add("hand-limit-dialog");

  const grid = dialog.querySelector<HTMLElement>(".visual-card-choice-grid, .card-choice-grid, .decision-card-grid");
  if (!grid) return;
  grid.classList.add("hand-limit-choice-area");

  const items = Array.from(grid.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (!items.length) return;
  const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find((button) => /confirmar/i.test(button.textContent || ""));
  const dialogRect = dialog.getBoundingClientRect();
  const gridRect = grid.getBoundingClientRect();
  const confirmRect = confirm?.getBoundingClientRect();
  const style = getComputedStyle(dialog);
  const horizontalPadding = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  const availableWidth = Math.max(1, dialogRect.width - horizontalPadding);
  const availableHeight = Math.max(1, (confirmRect ? confirmRect.top : dialogRect.bottom) - gridRect.top - Math.max(8, dialogRect.height * .025));
  const count = items.length;
  const gap = Math.max(6, Math.min(14, availableWidth * .018));
  const itemAspect = .64; // selectable tile width / height (card art + caption/padding)

  let bestColumns = 1;
  let bestWidth = 0;
  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const widthByRow = (availableWidth - gap * (columns - 1)) / columns;
    const heightPerItem = (availableHeight - gap * (rows - 1)) / rows;
    const widthByHeight = heightPerItem * itemAspect;
    const candidate = Math.min(widthByRow, widthByHeight);
    if (candidate > bestWidth) {
      bestWidth = candidate;
      bestColumns = columns;
    }
  }

  const maxReadable = Math.min(132, availableWidth / Math.min(count, 5));
  const fittedWidth = Math.max(44, Math.min(bestWidth, maxReadable));
  grid.style.setProperty("--hand-limit-cols", String(bestColumns));
  grid.style.setProperty("--hand-limit-item-w", fittedWidth.toFixed(2) + "px");
  grid.style.setProperty("--hand-limit-gap", gap.toFixed(2) + "px");
  grid.style.setProperty("--hand-limit-max-h", availableHeight.toFixed(2) + "px");
  grid.dataset.handLimitFit = "true";
}

`;
if (!guard.includes("function layoutHandLimitChoices()")) {
  if (!guard.includes(marker)) throw new Error("MatchUiGuard marker not found");
  guard = guard.replace(marker, helper + marker);
}
if (!guard.includes("layoutHandLimitChoices();")) {
  const anchor = "      layoutTargetBannerInSafeLane();";
  if (!guard.includes(anchor)) throw new Error("sync anchor not found");
  guard = guard.replace(anchor, anchor + "\n      layoutHandLimitChoices();");
}
fs.writeFileSync(guardPath, guard);

const cssPath = "app/ui-overrides.css";
let css = fs.readFileSync(cssPath, "utf8");
const block = String.raw`

/* Hand-limit picker: selectable cards fit inside the invisible lane between
   explanatory copy and the confirm action. The guard measures that lane and
   chooses the largest grid geometry that fits without overlap. */
.screen-game .hand-limit-dialog {
  box-sizing: border-box !important;
  max-height: min(92dvh, 48rem) !important;
  overflow: hidden !important;
}
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] {
  display: grid !important;
  grid-template-columns: repeat(var(--hand-limit-cols), var(--hand-limit-item-w)) !important;
  grid-auto-rows: minmax(0, auto) !important;
  justify-content: center !important;
  align-content: center !important;
  gap: var(--hand-limit-gap) !important;
  width: 100% !important;
  max-width: 100% !important;
  height: min(var(--hand-limit-max-h), 100%) !important;
  max-height: var(--hand-limit-max-h) !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: clamp(.1rem,.35cqh,.28rem) clamp(.1rem,.35cqw,.28rem) !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] > * {
  width: var(--hand-limit-item-w) !important;
  max-width: var(--hand-limit-item-w) !important;
  min-width: 0 !important;
  height: auto !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  justify-self: center !important;
  align-self: center !important;
}
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] .original-card,
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] .card-frame,
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] .remote-card-art {
  max-width: 100% !important;
  height: auto !important;
}
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] > *:hover,
.screen-game .hand-limit-dialog .hand-limit-choice-area[data-hand-limit-fit="true"] > *:focus-within {
  z-index: 40 !important;
}
`;
if (!css.includes("Hand-limit picker: selectable cards fit")) css += block;
fs.writeFileSync(cssPath, css);

const testPath = "tests/hand-limit-layout-regression.test.mjs";
fs.writeFileSync(testPath, `import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\ntest("hand limit picker measures the lane between copy and confirm", () => {\n  const source = fs.readFileSync(new URL("../app/match-ui-guard.tsx", import.meta.url), "utf8");\n  assert.match(source, /function layoutHandLimitChoices\\(\\)/);\n  assert.match(source, /confirmRect \\? confirmRect\\.top/);\n  assert.match(source, /--hand-limit-item-w/);\n  assert.match(source, /bestColumns/);\n});\n\ntest("hand limit cards are a bounded adaptive grid instead of overlapping actions", () => {\n  const css = fs.readFileSync(new URL("../app/ui-overrides.css", import.meta.url), "utf8");\n  assert.match(css, /hand-limit-choice-area\\[data-hand-limit-fit/);\n  assert.match(css, /repeat\\(var\\(--hand-limit-cols\\), var\\(--hand-limit-item-w\\)\\)/);\n  assert.match(css, /max-height: var\\(--hand-limit-max-h\\)/);\n  assert.match(css, /overflow: hidden/);\n});\n`);
