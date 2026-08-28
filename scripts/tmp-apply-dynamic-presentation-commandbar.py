from pathlib import Path
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise AssertionError(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Presentation runtime: release state/input from actual animation completion.
# ---------------------------------------------------------------------------
path = Path("app/game-presentation-runtime.tsx")
runtime = path.read_text()

runtime = replace_once(
    runtime,
    '''    releaseLevelState(held, hero?.element);
    await new Promise<void>((resolve) => window.setTimeout(resolve, reduced ? 90 : 520));

    await overlay.animate([
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.08)" },
    ], { duration: reduced ? 90 : 260, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);''',
    '''    releaseLevelState(held, hero?.element);
    await overlay.animate([
      { offset: 0, opacity: 1, transform: "scale(1)" },
      { offset: .7, opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.08)" },
    ], { duration: reduced ? 160 : 620, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);''',
    "level-up timer",
)

floating_pattern = re.compile(
    r'async function floatingLabel\(layer: HTMLElement, rect: RectLike, text: string, tone: "positive" \| "negative" \| "neutral"\) \{.*?\n\}\n\nasync function animateCardMove',
    re.S,
)
floating_replacement = '''type FloatingLabelLifecycle = { readable: Promise<void>; finished: Promise<void> };

function floatingLabel(layer: HTMLElement, rect: RectLike, text: string, tone: "positive" | "negative" | "neutral"): FloatingLabelLifecycle | null {
  if (!text || layer.querySelectorAll(".hh-float").length >= MAX_FLOATS) return null;
  const point = center(rect);
  const node = document.createElement("b");
  node.className = `hh-float is-${tone}`;
  node.textContent = text;
  node.style.left = `${point.x}px`;
  node.style.top = `${point.y}px`;
  layer.append(node);
  const reduced = prefersReducedMotion();
  const intro = node.animate([
    { opacity: 0, transform: "translate(-50%,4px) scale(.78)" },
    { opacity: 1, transform: "translate(-50%,-6px) scale(1.08)" },
  ], { duration: reduced ? 45 : 115, easing: EASING, fill: "forwards" });
  const readable = intro.finished.catch(() => undefined).then(() => undefined);
  const finished = readable.then(async () => {
    await node.animate([
      { opacity: 1, transform: "translate(-50%,-6px) scale(1.08)" },
      { offset: .55, opacity: 1, transform: "translate(-50%,-14px) scale(1)" },
      { opacity: 0, transform: "translate(-50%,-28px) scale(.94)" },
    ], { duration: reduced ? 90 : 285, easing: EASING, fill: "forwards" }).finished.catch(() => undefined);
    node.remove();
  });
  return { readable, finished };
}

async function animateCardMove'''
runtime, count = floating_pattern.subn(floating_replacement, runtime, count=1)
if count != 1:
    raise AssertionError(f"floatingLabel replacement count={count}")

deltas_pattern = re.compile(
    r'async function presentDeltas\(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot, layer: HTMLElement, onReadable: \(\) => void, settle = true\) \{.*?\n\}\n\nexport default function GamePresentationRuntime',
    re.S,
)
deltas_replacement = '''async function presentDeltas(detail: PresentationDetail, beforeDom: DomSnapshot, afterDom: DomSnapshot, layer: HTMLElement, onReadable: () => void): Promise<{ completion: Promise<void> }> {
  const labels: FloatingLabelLifecycle[] = [];
  const addLabel = (label: FloatingLabelLifecycle | null) => { if (label) labels.push(label); };
  for (const [uid, fresh] of afterDom.units) {
    const old = beforeDom.units.get(uid);
    if (!old) continue;
    if (old.hp != null && fresh.hp != null && old.hp !== fresh.hp) {
      const delta = fresh.hp - old.hp;
      addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    } else if (old.atk != null && fresh.atk != null && old.atk !== fresh.atk) {
      const delta = fresh.atk - old.atk;
      addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
    }
  }
  for (const [uid, old] of beforeDom.units) {
    if (afterDom.units.has(uid)) continue;
    const damage = removedUnitDamage(detail, uid, beforeDom);
    if (damage != null && damage > 0) addLabel(floatingLabel(layer, old.rect, `-${damage}`, "negative"));
  }
  for (const owner of [0, 1] as const) {
    const old = beforeDom.heroes.get(owner), fresh = afterDom.heroes.get(owner);
    if (!old || !fresh || old.life === fresh.life) continue;
    const delta = fresh.life - old.life;
    addLabel(floatingLabel(layer, fresh.rect, `${delta > 0 ? "+" : ""}${delta}`, delta > 0 ? "positive" : "negative"));
  }
  if (!labels.length) {
    onReadable();
    return { completion: Promise.resolve() };
  }
  await Promise.all(labels.map((label) => label.readable));
  /* Release the old stat/life rendering exactly when every number has reached
     its readable keyframe. No wall-clock timeout can drift from the browser's
     actual animation timeline. */
  onReadable();
  return { completion: Promise.all(labels.map((label) => label.finished)).then(() => undefined) };
}

export default function GamePresentationRuntime'''
runtime, count = deltas_pattern.subn(deltas_replacement, runtime, count=1)
if count != 1:
    raise AssertionError(f"presentDeltas replacement count={count}")

runtime = replace_once(
    runtime,
    "await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable, false);",
    "const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);",
    "spell delta call",
)
runtime = replace_once(
    runtime,
    'for (const flight of resultArrivals) await animateCardMove(layers.motion, layers.effect, flight);\n      } else if (cue?.kind === "combat") {',
    'for (const flight of resultArrivals) await animateCardMove(layers.motion, layers.effect, flight);\n        await deltaCompletion;\n      } else if (cue?.kind === "combat") {',
    "spell delta completion",
)
runtime = replace_once(
    runtime,
    "await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable, cue.hero == null);",
    "const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);",
    "combat delta call",
)
runtime = replace_once(
    runtime,
    'for (const flight of arrivals) await animateCardMove(layers.motion, layers.effect, flight);\n      } else {',
    'for (const flight of arrivals) await animateCardMove(layers.motion, layers.effect, flight);\n        await deltaCompletion;\n      } else {',
    "combat delta completion",
)
runtime = replace_once(
    runtime,
    "await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable, true);",
    "const { completion: deltaCompletion } = await presentDeltas(detail, beforeDom, afterDom, layers.effect, releaseReadable);",
    "generic delta call",
)
runtime = replace_once(
    runtime,
    "for (const flight of resultArrivals) await animateCardMove(layers.motion, layers.effect, flight);\n      }\n      await animateHeroLevelUp",
    "for (const flight of resultArrivals) await animateCardMove(layers.motion, layers.effect, flight);\n        await deltaCompletion;\n      }\n      await animateHeroLevelUp",
    "generic delta completion",
)
path.write_text(runtime)


# ---------------------------------------------------------------------------
# Legacy animation owners: CSS/WAAPI completion replaces fixed millisecond locks.
# ---------------------------------------------------------------------------
path = Path("app/page.tsx")
page = path.read_text()
page = page.replace("const VISUAL_FX_HOLD_MS=2280;\n", "")
page = page.replace(
    'const COMBAT_STAGE_DELAY_MS:Record<CombatStage,number>={declared:220,priority:180,choosing:0,charging:320,impact:550,resolved:450};\n',
    "",
)
page = replace_once(
    page,
    ' useEffect(()=>{if(!visualFx)return;const t=setTimeout(()=>setVisualFx(null),VISUAL_FX_HOLD_MS);return()=>clearTimeout(t)},[visualFx]);\n',
    "",
    "legacy visual fx timer",
)
page = replace_once(
    page,
    ' const animateDeckShuffle=(owner:0|1)=>{setShufflingDeck(owner);setTimeout(()=>setShufflingDeck(current=>current===owner?null:current),4000)};',
    ' const animateDeckShuffle=(owner:0|1)=>{setShufflingDeck(owner)};',
    "shuffle timer",
)
page = replace_once(
    page,
    '  const delay=COMBAT_STAGE_DELAY_MS[action.stage];\n  const t=setTimeout(()=>{',
    '  const frame=requestAnimationFrame(()=>{',
    "combat delay start",
)
page = replace_once(
    page,
    '  },delay);return()=>clearTimeout(t)',
    '  });return()=>cancelAnimationFrame(frame)',
    "combat delay end",
)
page = replace_once(
    page,
    '{visualFx&&<VisualEffect fx={visualFx}/>} {shufflingDeck!==null&&<DeckShuffleEffect owner={shufflingDeck}/>}<button',
    '{visualFx&&<VisualEffect fx={visualFx} onComplete={()=>setVisualFx(current=>current?.id===visualFx.id?null:current)}/>} {shufflingDeck!==null&&<DeckShuffleEffect owner={shufflingDeck} onComplete={()=>setShufflingDeck(current=>current===shufflingDeck?null:current)}/>}<button',
    "visual fx render completion",
)

component_pattern = re.compile(
    r'function VisualEffect\(\{fx\}:\{fx:VisualFx\}\)\{.*?\n\nfunction DeckShuffleEffect\(\{owner\}:\{owner:0\|1\}\)\{.*?\n\nfunction DeckPicker',
    re.S,
)
component_replacement = '''function useFiniteVisualCompletion(ref:{current:HTMLElement|null},identity:string,onComplete:()=>void){
 const completeRef=useRef(onComplete);completeRef.current=onComplete;
 useEffect(()=>{let cancelled=false,frame=0;const finish=()=>{if(!cancelled)completeRef.current()};frame=requestAnimationFrame(()=>{if(cancelled)return;const element=ref.current;if(!element){queueMicrotask(finish);return}const animations=element.getAnimations({subtree:true}).filter(animation=>{const timing=animation.effect?.getTiming();return timing?Number.isFinite(Number(timing.iterations)):false});if(!animations.length){queueMicrotask(finish);return}void Promise.allSettled(animations.map(animation=>animation.finished)).then(finish)});return()=>{cancelled=true;if(frame)cancelAnimationFrame(frame)}},[identity,ref]);
}

function VisualEffect({fx,onComplete}:{fx:VisualFx;onComplete:()=>void}){const ref=useRef<HTMLDivElement>(null);useFiniteVisualCompletion(ref,fx.id,onComplete);return <div ref={ref} className={`visual-effect fx-${fx.kind} fx-theme-${fx.theme} ${fx.target?"fx-targeted":""}`} aria-live="polite"><div className="fx-emblem" aria-hidden="true">{fx.theme==="blood"?"☾":fx.theme==="dragon"?"◆":fx.theme==="goblin"?"⚙":fx.theme==="recruit"?"⚔":fx.theme==="divine"?"✦":fx.theme==="nature"?"❧":fx.theme==="arcane"?"◈":fx.theme==="chaos"?"✹":fx.theme==="order"?"♜":"◇"}</div><div className="fx-runes">{Array.from({length:10},(_,i)=><i key={i}></i>)}</div>{fx.card?<RemoteCardArt page={fx.card.page} name={fx.card.name} priority/>:<span>✦</span>}{fx.target&&<><div className="effect-link"><i/><b>➜</b><i/></div><RemoteCardArt page={fx.target.page} name={fx.target.name} priority/></>}<section><b>{fx.label}</b><strong>{fx.detail}</strong>{fx.target&&<small>{fx.card?.name||"Efeito"} afeta {fx.target.name}</small>}</section></div>}

function DeckShuffleEffect({owner,onComplete}:{owner:0|1;onComplete:()=>void}){const ref=useRef<HTMLDivElement>(null);useFiniteVisualCompletion(ref,`shuffle-${owner}`,onComplete);return <div ref={ref} className={`deck-shuffle-effect owner-${owner}`} aria-live="polite"><div><i>H</i><i>H</i><i>H</i><i>H</i><i>H</i></div><b>EMBARALHANDO</b><span>{owner===0?"Seu Deck Principal":"Deck Principal adversário"}</span></div>}

function DeckPicker'''
page, count = component_pattern.subn(component_replacement, page, count=1)
if count != 1:
    raise AssertionError(f"VisualEffect component replacement count={count}")
path.write_text(page)


# Visible legacy ability/damage effects get a concise finite timeline.
css_path = Path("app/game-presentation.css")
css = css_path.read_text()
marker = "/* Dynamic legacy presentation completion */"
if marker not in css:
    css += '''

/* Dynamic legacy presentation completion */
.screen-game .visual-effect.fx-ability { animation: fx-readable-hold 1.35s ease both !important; }
.screen-game .visual-effect.fx-damage { animation: fx-readable-hold .95s ease both !important; }
'''
css_path.write_text(css)


# ---------------------------------------------------------------------------
# Command bar: actual measured autofit, smaller baseline and scoped observers.
# ---------------------------------------------------------------------------
path = Path("app/match-ui-runtime.tsx")
ui = path.read_text()
fit_pattern = re.compile(
    r'const COMMAND_TITLE_SIZE = .*?\n\}\n\nfunction useCommandBarTextAutofit',
    re.S,
)
fit_replacement = '''const COMMAND_TITLE_SIZE = "clamp(.5rem,min(.62vw,1.05dvh),.66rem)";
const COMMAND_COPY_SIZE = "clamp(.58rem,min(.72vw,1.22dvh),.78rem)";
const COMMAND_COMPACT_COPY_SIZE = "clamp(.54rem,min(.66vw,1.12dvh),.72rem)";
const COMMAND_DENSE_COPY_SIZE = "clamp(.5rem,min(.61vw,1.04dvh),.68rem)";
const COMMAND_MIN_TITLE_PX = 7;
const COMMAND_MIN_COPY_PX = 7.5;

const commandChipFits = (content: HTMLElement, title: HTMLElement | null, description: HTMLElement | null) => {
  if (content.clientWidth <= 0 || content.clientHeight <= 0) return true;
  const contentFits = content.scrollHeight <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1;
  const titleFits = !title || title.scrollWidth <= title.clientWidth + 1;
  const copyFits = !description || description.scrollWidth <= description.clientWidth + 1;
  return contentFits && titleFits && copyFits;
};

function fitCommandChip(chip: HTMLElement) {
  const content = chip.querySelector<HTMLElement>(":scope > span");
  if (!content) return;
  const title = content.querySelector<HTMLElement>(":scope > b");
  const description = content.querySelector<HTMLElement>("p");
  const descriptionSize = chip.classList.contains("copy-dense")
    ? COMMAND_DENSE_COPY_SIZE
    : chip.classList.contains("copy-compact")
      ? COMMAND_COMPACT_COPY_SIZE
      : COMMAND_COPY_SIZE;

  content.style.removeProperty("gap");
  title?.style.removeProperty("line-height");
  title?.style.removeProperty("letter-spacing");
  description?.style.removeProperty("line-height");
  title?.style.setProperty("font-size", COMMAND_TITLE_SIZE, "important");
  description?.style.setProperty("font-size", descriptionSize, "important");
  chip.dataset.commandTextFit = "readable";
  if (commandChipFits(content, title, description)) return;

  const baseTitlePx = title ? parseFloat(getComputedStyle(title).fontSize) || 10 : 10;
  const baseCopyPx = description ? parseFloat(getComputedStyle(description).fontSize) || 11 : 11;
  const applyScale = (scale: number) => {
    if (title) title.style.setProperty("font-size", `${Math.max(COMMAND_MIN_TITLE_PX, baseTitlePx * scale)}px`, "important");
    if (description) description.style.setProperty("font-size", `${Math.max(COMMAND_MIN_COPY_PX, baseCopyPx * scale)}px`, "important");
  };

  let low = .48, high = 1, best = low;
  for (let index = 0; index < 8; index += 1) {
    const middle = (low + high) / 2;
    applyScale(middle);
    if (commandChipFits(content, title, description)) { best = middle; low = middle; }
    else high = middle;
  }
  applyScale(best);
  if (commandChipFits(content, title, description)) {
    chip.dataset.commandTextFit = "scaled";
    return;
  }

  // Last-resort compacting keeps PASSIVA/ATIVA and the complete description
  // inside the existing panel without line-clamp or text clipping.
  content.style.setProperty("gap", "0", "important");
  title?.style.setProperty("line-height", "1", "important");
  title?.style.setProperty("letter-spacing", ".035em", "important");
  description?.style.setProperty("line-height", "1.03", "important");
  applyScale(low);
  chip.dataset.commandTextFit = "minimum";
}

function useCommandBarTextAutofit'''
ui, count = fit_pattern.subn(fit_replacement, ui, count=1)
if count != 1:
    raise AssertionError(f"command fit replacement count={count}")

ui = replace_once(
    ui,
    '''    const mutationObserver = new MutationObserver(queueScan);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });''',
    '''    const mutationTouchesCommandBar = (record: MutationRecord) => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(".hero-command-bar")) return true;
      if (record.type !== "childList") return false;
      return [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches(".hero-command-bar,.hero-ability-chip") || !!node.querySelector(".hero-command-bar,.hero-ability-chip")));
    };
    const mutationObserver = new MutationObserver((records) => {
      if (records.some(mutationTouchesCommandBar)) queueScan();
    });
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });''',
    "command mutation observer",
)
path.write_text(ui)


path = Path("app/command-bar-fixes.css")
command_css = path.read_text()
replacements = {
    "font-size:clamp(.74rem,min(.88vw,1.56dvh),.92rem)!important;": "font-size:clamp(.58rem,min(.72vw,1.22dvh),.78rem)!important;",
    "font-size:clamp(.62rem,min(.72vw,1.28dvh),.74rem)!important;": "font-size:clamp(.5rem,min(.62vw,1.05dvh),.66rem)!important;",
    "font-size:clamp(.7rem,min(.8vw,1.42dvh),.86rem)!important;": "font-size:clamp(.54rem,min(.66vw,1.12dvh),.72rem)!important;",
    "font-size:clamp(.66rem,min(.74vw,1.32dvh),.8rem)!important;": "font-size:clamp(.5rem,min(.61vw,1.04dvh),.68rem)!important;",
}
for old, new in replacements.items():
    if old not in command_css:
        raise AssertionError(f"missing command CSS size: {old}")
    command_css = command_css.replace(old, new, 1)
command_css += '''

/* PASSIVA/ATIVA is a fixed semantic label: never clip it vertically or horizontally. */
html body .screen-game .game-stage>.game-content.hs-board .hero-command-bar>.hero-ability-chip>span>b{
  display:block!important;
  flex:0 0 auto!important;
  min-height:1em!important;
  padding-block:.02em!important;
  overflow:visible!important;
  white-space:nowrap!important;
  text-wrap:nowrap!important;
}
.screen-game .hero-command-bar .hero-ability-chip[data-command-text-fit="minimum"]{
  padding:clamp(.055rem,.11cqh,.09rem) clamp(.08rem,.14cqw,.12rem)!important;
}
.screen-game .hero-command-bar .hero-ability-chip[data-command-text-fit="minimum"]>span{
  margin-left:clamp(.035rem,.07cqw,.065rem)!important;
  padding:0!important;
}
'''
path.write_text(command_css)


# ---------------------------------------------------------------------------
# Regression tests.
# ---------------------------------------------------------------------------
path = Path("tests/combat-animation-flow.test.mjs")
tests = path.read_text()
old = '''  assert.match(runtime, /if \\(!labels\\.length\\) \\{ onReadable\\(\\); return; \\}/);
  assert.match(runtime, /window\\.setTimeout\\(resolve, prefersReducedMotion\\(\\) \\? 35 : 135\\)/);
  assert.match(runtime, /onReadable\\(\\);/);'''
new = '''  assert.match(runtime, /FloatingLabelLifecycle/);
  assert.match(runtime, /await Promise\\.all\\(labels\\.map\\(\\(label\\) => label\\.readable\\)\\)/);
  assert.doesNotMatch(runtime, /setTimeout\\(resolve, prefersReducedMotion\\(\\) \\? 35 : 135\\)/);
  assert.match(runtime, /completion: Promise\\.all\\(labels\\.map\\(\\(label\\) => label\\.finished\\)\\)/);'''
tests = replace_once(tests, old, new, "delta timing test")

for title in [
    "command bar caps remain compact at large viewport sizes",
    "command bar runtime uses the same compact caps as the stylesheet",
]:
    pattern = re.compile(r'test\("' + re.escape(title) + r'", \(\) => \{.*?\n\}\);\n', re.S)
    tests, count = pattern.subn("", tests, count=1)
    if count != 1:
        raise AssertionError(f"missing old test: {title}")

tests += '''

test("presentation busy releases from animation completion instead of wall-clock holds", () => {
  const runtime = read("app/game-presentation-runtime.tsx");
  const page = read("app/page.tsx");
  assert.doesNotMatch(runtime, /window\\.setTimeout/);
  assert.match(runtime, /await deltaCompletion/);
  assert.doesNotMatch(page, /VISUAL_FX_HOLD_MS|COMBAT_STAGE_DELAY_MS/);
  assert.match(page, /useFiniteVisualCompletion/);
  assert.match(page, /getAnimations\\(\\{subtree:true\\}\\)/);
  assert.match(page, /const frame=requestAnimationFrame\\(\\(\\)=>\\{/);
  assert.doesNotMatch(page, /setShufflingDeck\\(current=>current===owner\\?null:current\\),4000/);
});

test("command bar measures overflow and scales PASSIVA ATIVA copy to fit", () => {
  const runtime = read("app/match-ui-runtime.tsx");
  const css = read("app/command-bar-fixes.css");
  assert.match(runtime, /commandChipFits/);
  assert.match(runtime, /for \\(let index = 0; index < 8; index \\+= 1\\)/);
  assert.match(runtime, /COMMAND_MIN_TITLE_PX = 7/);
  assert.match(runtime, /COMMAND_MIN_COPY_PX = 7\\.5/);
  assert.match(runtime, /mutationTouchesCommandBar/);
  assert.match(css, /white-space:nowrap!important/);
  assert.match(css, /data-command-text-fit="minimum"/);
});
'''
path.write_text(tests)
