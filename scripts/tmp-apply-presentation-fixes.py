from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise RuntimeError(f"Missing anchor in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Command bar: the client runtime writes inline !important values after CSS.
# Keep those values in sync with the compact caps already defined in CSS.
# ---------------------------------------------------------------------------
runtime_ui_path = Path("app/match-ui-runtime.tsx")
runtime_ui = runtime_ui_path.read_text()
for old, new in [
    (
        'const COMMAND_TITLE_SIZE = "clamp(.62rem,min(.72vw,1.28dvh),.78rem)";',
        'const COMMAND_TITLE_SIZE = "clamp(.62rem,min(.72vw,1.28dvh),.74rem)";',
    ),
    (
        'const COMMAND_COPY_SIZE = "clamp(.74rem,min(.88vw,1.56dvh),1rem)";',
        'const COMMAND_COPY_SIZE = "clamp(.74rem,min(.88vw,1.56dvh),.92rem)";',
    ),
    (
        'const COMMAND_COMPACT_COPY_SIZE = "clamp(.7rem,min(.8vw,1.42dvh),.92rem)";',
        'const COMMAND_COMPACT_COPY_SIZE = "clamp(.7rem,min(.8vw,1.42dvh),.86rem)";',
    ),
    (
        'const COMMAND_DENSE_COPY_SIZE = "clamp(.66rem,min(.74vw,1.32dvh),.86rem)";',
        'const COMMAND_DENSE_COPY_SIZE = "clamp(.66rem,min(.74vw,1.32dvh),.8rem)";',
    ),
]:
    if old not in runtime_ui:
        raise RuntimeError(f"Missing command-bar constant: {old}")
    runtime_ui = runtime_ui.replace(old, new, 1)
runtime_ui_path.write_text(runtime_ui)


# ---------------------------------------------------------------------------
# Hero damage: there is a separate fallback CSS animation for non-presentation
# damage. It still used percentages + scale, so it could look exactly like the
# old oversized movement. Make the fallback match the tiny runtime shake.
# ---------------------------------------------------------------------------
replace_once(
    "app/ui-overrides.css",
    '.screen-game .player-hero.hero-hurt>.hero-power-trigger{animation:heroDamagePulse .62s cubic-bezier(.2,.8,.25,1) both}',
    '.screen-game .player-hero.hero-hurt>.hero-power-trigger{animation:heroDamagePulse .18s ease-out both}',
)
replace_once(
    "app/ui-overrides.css",
    '@keyframes heroDamagePulse{0%{transform:translateX(0) scale(1)}18%{transform:translateX(-2.5%) scale(1.035)}36%{transform:translateX(2.2%) scale(1.025)}54%{transform:translateX(-1.2%) scale(1.015)}100%{transform:translateX(0) scale(1)}}',
    '@keyframes heroDamagePulse{0%,100%{transform:translateX(0)}20%{transform:translateX(-2.5px)}40%{transform:translateX(2.5px)}62%{transform:translateX(-1.25px)}82%{transform:translateX(1.25px)}}',
)


# ---------------------------------------------------------------------------
# Turned cards: keep the orientation, but do not paint the generic VIRADA plate
# over an active effect/impact. Specific negative statuses are unaffected.
# ---------------------------------------------------------------------------
replace_once(
    "app/page.tsx",
    '{(unit.exhausted||unit.frozen||unit.stunned||unit.suffocated||unit.immobilized)&&<i className="status">{unit.suffocated?"SUFOCADA":unit.stunned?"ATORDOADA":unit.frozen?"CONGELADA":unit.immobilized?"IMOBILIZADA":"VIRADA"}</i>}',
    '{(((unit.exhausted&&!activeEffect&&!unit.impacting)||unit.frozen||unit.stunned||unit.suffocated||unit.immobilized))&&<i className="status">{unit.suffocated?"SUFOCADA":unit.stunned?"ATORDOADA":unit.frozen?"CONGELADA":unit.immobilized?"IMOBILIZADA":"VIRADA"}</i>}',
)


# ---------------------------------------------------------------------------
# Remote card art: expose the existing cached PDF renderer to presentation code
# so an opponent spell can be shown face-up before it has a field destination.
# ---------------------------------------------------------------------------
remote_art_path = Path("app/remote-card-art.tsx")
remote_art = remote_art_path.read_text()
if "export async function renderRemoteCardArtToCanvas" not in remote_art:
    anchor = "type RemoteCardArtProps = {"
    if anchor not in remote_art:
        raise RuntimeError("Missing RemoteCardArtProps anchor")
    helper = '''export async function renderRemoteCardArtToCanvas(canvas: HTMLCanvasElement, page: number, cssWidth = 120) {
  const pdfPage = await loadCatalogPage(page);
  const baseViewport = pdfPage.getViewport({ scale: 1 });
  const width = Math.max(cssWidth, canvas.clientWidth, 120);
  const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
  const viewport = pdfPage.getViewport({ scale: (width / baseViewport.width) * pixelRatio });
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponível");
  const renderTask = pdfPage.render({ canvas, canvasContext: context, viewport });
  await renderTask.promise;
  canvas.dataset.loaded = "true";
}

'''
    remote_art_path.write_text(remote_art.replace(anchor, helper + anchor, 1))


# ---------------------------------------------------------------------------
# Presentation runtime:
# - never clone the VIRADA plate into transient animation layers;
# - for owner 1, replace the hidden hand back with the actual played face before
#   the first frame of the flight;
# - spells render their actual catalog page because they have no field face;
# - online fallback can use a generic hand-back origin when the redacted state
#   does not expose the exact hand identity.
# ---------------------------------------------------------------------------
presentation_path = Path("app/game-presentation-runtime.tsx")
presentation = presentation_path.read_text()

presentation_import = 'import { animateActionCue, captureActionCue, type ActionCue } from "./presentation-action-cues";'
remote_import = 'import { renderRemoteCardArtToCanvas } from "./remote-card-art";'
if remote_import not in presentation:
    if presentation_import not in presentation:
        raise RuntimeError("Missing presentation import anchor")
    presentation = presentation.replace(presentation_import, presentation_import + "\n" + remote_import, 1)

clone_anchor = '  clone.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"));'
if 'toUpperCase() === "VIRADA"' not in presentation:
    if clone_anchor not in presentation:
        raise RuntimeError("Missing cloneRendered anchor")
    presentation = presentation.replace(
        clone_anchor,
        '  clone.querySelectorAll<HTMLElement>(".status").forEach((node) => {\n'
        '    if (node.textContent?.trim().toUpperCase() === "VIRADA") node.remove();\n'
        '  });\n' + clone_anchor,
        1,
    )

played_card_old = '''function playedCardForDetail(detail: PresentationDetail) {
  const owner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  const id = String(detail.command?.cardId || "");
  return (detail.before?.players?.[owner]?.hand || []).find((card: any) => String(card?.id || card?.uid || "") === id);
}
'''
played_card_new = '''function playedCardForDetail(detail: PresentationDetail) {
  const owner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  const id = String(detail.command?.cardId || "");
  const fromHand = (detail.before?.players?.[owner]?.hand || []).find((card: any) => String(card?.id || card?.uid || "") === id);
  if (fromHand) return fromHand;
  if (detail.command?.presentationCard) return detail.command.presentationCard;
  const afterPlayer = detail.after?.players?.[owner];
  return [...stateFields(afterPlayer), ...(afterPlayer?.grave || [])].find((card: any) => stateId(card) === id);
}

async function createRevealedOpponentCardFace(card: any, width: number) {
  const face = document.createElement("button");
  face.type = "button";
  face.tabIndex = -1;
  face.className = "original-card hh-opponent-play-reveal";
  face.setAttribute("aria-label", String(card?.name || "Carta jogada pelo oponente"));
  face.dataset.cardPage = String(Number(card?.page || 0));
  face.dataset.cardName = String(card?.name || "Carta jogada pelo oponente");
  const canvas = document.createElement("canvas");
  canvas.className = "remote-card-art";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", String(card?.name || "Carta jogada pelo oponente"));
  canvas.dataset.page = String(Number(card?.page || 0));
  face.append(canvas);
  try {
    await renderRemoteCardArtToCanvas(canvas, Number(card?.page || 0), Math.max(120, width));
  } catch {
    face.classList.add("hh-opponent-play-reveal-failed");
  }
  return face;
}

async function revealOpponentPlayedCard(detail: PresentationDetail, flights: Flight[]) {
  const owner: Owner = Number(detail.command?.owner || 0) === 1 ? 1 : 0;
  if (detail.command?.type !== "playCard" || owner !== 1) return;
  const card = playedCardForDetail(detail);
  if (!card) return;
  for (const flight of flights.filter((candidate) => candidate.sourcePlay)) {
    flight.face = flight.destination
      ? cloneRendered(flight.destination)
      : await createRevealedOpponentCardFace(card, flight.from.width);
  }
}
'''
if "async function revealOpponentPlayedCard" not in presentation:
    if played_card_old not in presentation:
        raise RuntimeError("Missing playedCardForDetail anchor")
    presentation = presentation.replace(played_card_old, played_card_new, 1)

old_play_setup = '''  const playedId = String(detail.command?.cardId || "");
  const playedIndex = playedId ? stateHandIndex(detail.before, commandOwner, playedId) : -1;
  const playedCard = playedIndex >= 0 ? detail.before?.players?.[commandOwner]?.hand?.[playedIndex] : null;
  const playedSource = playedIndex >= 0 ? beforeDom.hands[commandOwner][playedIndex] : null;
  const targets = targetRects(detail, beforeDom, afterDom);
'''
new_play_setup = '''  const playedId = String(detail.command?.cardId || "");
  const playedIndex = playedId ? stateHandIndex(detail.before, commandOwner, playedId) : -1;
  const playedCard = playedCardForDetail(detail);
  const opponentHandShrank = commandOwner === 1
    && (detail.before?.players?.[1]?.hand?.length || 0) > (detail.after?.players?.[1]?.hand?.length || 0);
  const fallbackOpponentSource = opponentHandShrank ? beforeDom.hands[1].at(-1) || null : null;
  const playedSource = playedIndex >= 0 ? beforeDom.hands[commandOwner][playedIndex] : fallbackOpponentSource;
  const targets = targetRects(detail, beforeDom, afterDom);
'''
if old_play_setup not in presentation:
    raise RuntimeError("Missing buildFlights play setup anchor")
presentation = presentation.replace(old_play_setup, new_play_setup, 1)

old_cast = 'if (grave) flights.unshift({ kind: "cast", from: playedSource.rect, to: grave.rect, face: playedSource.clone, targets });'
new_cast = 'if (grave) flights.unshift({ kind: "cast", from: playedSource.rect, to: grave.rect, face: playedSource.clone, targets, sourcePlay: true });'
if old_cast not in presentation:
    raise RuntimeError("Missing spell cast flight anchor")
presentation = presentation.replace(old_cast, new_cast, 1)

old_present = '    const flights = buildFlights(detail, beforeDom, afterDom);\n    const spellFlight = flights.find((flight) => flight.kind === "cast") || null;'
new_present = '    const flights = buildFlights(detail, beforeDom, afterDom);\n    await revealOpponentPlayedCard(detail, flights);\n    const spellFlight = flights.find((flight) => flight.kind === "cast") || null;'
if old_present not in presentation:
    raise RuntimeError("Missing presentation flight anchor")
presentation = presentation.replace(old_present, new_present, 1)
presentation_path.write_text(presentation)


# Standalone opponent-play face inside the presentation layer.
presentation_css_path = Path("app/game-presentation.css")
presentation_css = presentation_css_path.read_text()
if ".hh-opponent-play-reveal {" not in presentation_css:
    css_anchor = ".hh-flight-card.is-cast {"
    if css_anchor not in presentation_css:
        raise RuntimeError("Missing game-presentation.css cast anchor")
    css_rule = '''.hh-opponent-play-reveal {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  overflow: hidden !important;
  pointer-events: none !important;
}
.hh-opponent-play-reveal > .remote-card-art {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

'''
    presentation_css_path.write_text(presentation_css.replace(css_anchor, css_rule + css_anchor, 1))


# ---------------------------------------------------------------------------
# Online bridge: a remote player's confirmed action has no local request ACK.
# Infer a playCard from the authoritative hand-size drop plus the newly visible
# card in field/grave, and carry that visible card as presentation metadata.
# ---------------------------------------------------------------------------
bridge_path = Path("app/presentation-event-bridge.tsx")
bridge = bridge_path.read_text()
attack_anchor = '''const attackFromCombat = (combat: any) => combat?.attackerUid ? {
  type: "attack",
  owner: Number(combat.attackerOwner) === 1 ? 1 : 0,
  attackerId: combat.attackerUid,
  ...(combat.targetHero || !combat.defenderUid ? { targetHero: true } : { defenderId: combat.defenderUid }),
} : null;
'''
if "const inferOpponentPlayCommand" not in bridge:
    if attack_anchor not in bridge:
        raise RuntimeError("Missing attackFromCombat anchor")
    inference = attack_anchor + '''
const stateFieldCards = (player: any) => [
  ...(player?.board || []),
  ...(player?.support || []),
  ...(player?.terrain ? [player.terrain] : []),
];
const newCardsByIdentity = (beforeCards: any[] = [], afterCards: any[] = []) => {
  const beforeCounts = new Map<string, number>();
  beforeCards.forEach((card) => beforeCounts.set(cardIdentity(card), (beforeCounts.get(cardIdentity(card)) || 0) + 1));
  const used = new Map<string, number>();
  return afterCards.filter((card) => {
    const id = cardIdentity(card);
    const seen = (used.get(id) || 0) + 1;
    used.set(id, seen);
    return seen > (beforeCounts.get(id) || 0);
  });
};
const inferOpponentPlayCommand = (before: any, after: any) => {
  const beforePlayer = before?.players?.[1], afterPlayer = after?.players?.[1];
  if (!beforePlayer || !afterPlayer) return null;
  if ((afterPlayer.hand?.length || 0) >= (beforePlayer.hand?.length || 0)) return null;
  const enteredField = newCardsByIdentity(stateFieldCards(beforePlayer), stateFieldCards(afterPlayer));
  const enteredGrave = newCardsByIdentity(beforePlayer.grave || [], afterPlayer.grave || []);
  const candidate = enteredField[0] || enteredGrave.at(-1);
  if (!candidate) return null;
  return { type: "playCard", owner: 1, cardId: cardIdentity(candidate), presentationCard: clone(candidate) };
};
'''
    bridge = bridge.replace(attack_anchor, inference, 1)

combat_line = "      const combatCommand = hasPresentableDelta(previous.game, after) ? attackFromCombat(previous.game?.combatAction) : null;\n"
if "const opponentPlayCommand =" not in bridge:
    if combat_line not in bridge:
        raise RuntimeError("Missing online combatCommand line")
    bridge = bridge.replace(
        combat_line,
        combat_line + "      const opponentPlayCommand = hasPresentableDelta(previous.game, after) ? inferOpponentPlayCommand(previous.game, after) : null;\n",
        1,
    )

online_command = '        command: combatCommand || { type: "onlineSnapshot", owner: 1 },'
if online_command not in bridge:
    raise RuntimeError("Missing online snapshot command fallback")
bridge = bridge.replace(
    online_command,
    '        command: combatCommand || opponentPlayCommand || { type: "onlineSnapshot", owner: 1 },',
    1,
)
bridge_path.write_text(bridge)


# ---------------------------------------------------------------------------
# Regression tests for the exact sources that made the previous fixes inert.
# ---------------------------------------------------------------------------
test_path = Path("tests/combat-animation-flow.test.mjs")
test_text = test_path.read_text()
if "legacy hero-hurt fallback uses only the tiny translate shake" not in test_text:
    test_text += r'''

test("legacy hero-hurt fallback uses only the tiny translate shake", () => {
  const css = read("app/ui-overrides.css");
  assert.match(css, /player-hero\.hero-hurt>\.hero-power-trigger\{animation:heroDamagePulse \.18s ease-out both\}/);
  const start = css.indexOf("@keyframes heroDamagePulse");
  const end = css.indexOf("@keyframes heroDamageFlash", start);
  const pulse = css.slice(start, end);
  assert.match(pulse, /translateX\(-2\.5px\)/);
  assert.match(pulse, /translateX\(2\.5px\)/);
  assert.doesNotMatch(pulse, /scale\(/);
  assert.doesNotMatch(pulse, /translateX\([^)]*%/);
});

test("command bar runtime uses the same compact caps as the stylesheet", () => {
  const runtime = read("app/match-ui-runtime.tsx");
  assert.match(runtime, /COMMAND_TITLE_SIZE = "clamp\(\.62rem,min\(\.72vw,1\.28dvh\),\.74rem\)"/);
  assert.match(runtime, /COMMAND_COPY_SIZE = "clamp\(\.74rem,min\(\.88vw,1\.56dvh\),\.92rem\)"/);
  assert.match(runtime, /COMMAND_COMPACT_COPY_SIZE = "clamp\(\.7rem,min\(\.8vw,1\.42dvh\),\.86rem\)"/);
  assert.match(runtime, /COMMAND_DENSE_COPY_SIZE = "clamp\(\.66rem,min\(\.74vw,1\.32dvh\),\.8rem\)"/);
});

test("turned cards omit the VIRADA plate while presenting effects", () => {
  const page = read("app/page.tsx");
  const runtime = read("app/game-presentation-runtime.tsx");
  assert.match(page, /unit\.exhausted&&!activeEffect&&!unit\.impacting/);
  assert.match(runtime, /toUpperCase\(\) === "VIRADA"/);
});

test("opponent plays reveal their actual face at the start of presentation", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const art = read("app/remote-card-art.tsx");
  const bridge = read("app/presentation-event-bridge.tsx");
  assert.match(art, /export async function renderRemoteCardArtToCanvas/);
  assert.match(runtime, /async function revealOpponentPlayedCard/);
  assert.match(runtime, /owner !== 1/);
  assert.match(runtime, /fallbackOpponentSource/);
  assert.match(runtime, /sourcePlay: true/);
  const reveal = runtime.indexOf("await revealOpponentPlayedCard(detail, flights)");
  const spell = runtime.indexOf("const spellFlight = flights.find", reveal);
  assert.ok(reveal >= 0 && reveal < spell);
  assert.match(bridge, /const inferOpponentPlayCommand/);
  assert.match(bridge, /presentationCard: clone\(candidate\)/);
  assert.match(bridge, /combatCommand \|\| opponentPlayCommand \|\|/);
});
'''
    test_path.write_text(test_text)
