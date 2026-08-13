import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const write = (path, value) => writeFile(path, value);
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  source = replaceOnce(source,
    'p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    'p30: [ability("onPlay", [effect("modifyStatsFromTurnCardsPlayed", { target: "self", attackPerCard: 1, healthPerCard: 1, duration: "permanent" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    "Biriba permanent Fura-Fila stats");

  const meteLegacy = 'p41: [ability("onPlay", [effect("returnToHand", { target: "allyCreature", selections: 1 }), effect("discountReturnedCard", { amount: 1, duration: "turn" })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } }), ability("onPlay", [effect("returnToHand", { target: "allyCreature", selections: 1 })], [], { condition: { cardsPlayedBeforeThisAtMost: 0 } })],';
  const meteIntermediate = 'p41: [ability("onPlay", [effect("returnToHand", { target: "allyCreature", selections: 1 }), effect("discountReturnedCardIfCombo", { amount: 1, duration: "turn" })])],';
  const meteFixed = 'p41: [ability("onPlay", [effect("returnAllyToHandWithComboDiscount", { target: "allyCreature", selections: 1, amount: 1, duration: "turn" })])],';
  if (!source.includes(meteFixed)) {
    if (source.includes(meteIntermediate)) source = source.replace(meteIntermediate, meteFixed);
    else source = replaceOnce(source, meteLegacy, meteFixed, "Mete o Pé single target");
  }

  source = replaceOnce(source,
    'p32: [ability("static", [effect("keyword", { keyword: "Veloz" })]), ability("onPlay", [effect("destroyByCardsPlayedThisTurn", { target: "anyCreature", selections: 1 })], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    'p32: [ability("static", [effect("keyword", { keyword: "Veloz" })]), ability("onPlay", [effect("destroyCreatureUpToTurnCardsPlayed")], [], { condition: { cardsPlayedBeforeThisAtLeast: 1 } })],',
    "Zoiudo dynamic target");
  await write(path, source);
}

{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = replaceOnce(source,
    'configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; if (effect.grantKeywordIfCombo && (player(state, context.owner).turnCardsPlayed || 0) > 0) { target.temporaryTags ||= []; target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; }',
    'configureResurrected(state, effect, context) { const target = findUnit(state, context.resurrectedId); if (!target) return; const cardsPlayedBeforeThis = Math.max(0, (player(state, context.owner).turnCardsPlayed || 0) - 1); if (effect.grantKeywordIfCombo && cardsPlayedBeforeThis > 0) { target.temporaryTags ||= []; if (!target.temporaryTags.includes(effect.grantKeywordIfCombo)) target.temporaryTags.push(effect.grantKeywordIfCombo); target.summoning = false; }',
    "Pinga Fura-Fila Investida timing");

  if (!source.includes('returnAllyToHandWithComboDiscount(state')) {
    const marker = '  discountReturnedCard(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: Goblin combo effect handlers");
    const handlers = `  returnAllyToHandWithComboDiscount(state, effect, context) {\n    const entry = player(state, context.owner);\n    const id = context.targetIds?.[0];\n    const target = entry.board.find((card) => (card.uid || card.id) === id);\n    if (!target) throw new RulesViolation("target-required");\n    const removed = removeFromZones(state, id);\n    if (!removed || removed.owner !== context.owner) throw new RulesViolation("invalid-target");\n    const card = cleanCardForHiddenZone(removed.card);\n    const combo = Math.max(0, Number(entry.turnCardsPlayed || 0) - 1) >= 1;\n    if (combo) {\n      card.costModifier = (card.costModifier || 0) - (effect.amount || 0);\n      card.costModifierExpires = effect.duration || "turn";\n      card.costModifierExpiresRound = (state.round || 0) + 1;\n    }\n    entry.hand.push(card);\n  },\n  destroyCreatureUpToTurnCardsPlayed(state, effect, context) {\n    const limit = Math.max(0, Number(player(state, context.owner).turnCardsPlayed || 0));\n    const eligible = state.players.flatMap((entry) => entry.board || []).filter((card) => Number(card.cost || 0) <= limit);\n    const chosenId = context.targetIds?.[0];\n    if (!chosenId) {\n      if (!eligible.length) return;\n      if (state.pendingDecision) throw new RulesViolation("decision-pending");\n      state.pendingDecision = { kind: "targets", owner: context.owner, effect: { replayEffects: [{ ...effect }] }, context: { ...context, targetIds: [] }, targetSteps: [{ scope: "anyCreature", role: "effect", maxCost: limit }], sourceName: context.effectSource?.name || "Zoiudo" };\n      return;\n    }\n    const target = eligible.find((card) => (card.uid || card.id) === chosenId);\n    if (!target) throw new RulesViolation("target-cost-too-high");\n    defaultEffectHandlers.destroy(state, { type: "destroy", target: "selected" }, { ...context, targetIds: [chosenId] });\n  },\n`;
    source = source.slice(0, index) + handlers + source.slice(index);
  }
  await write(path, source);
}

{
  const path = "app/page.tsx";
  let source = await read(path);
  source = replaceOnce(source,
    '<span className="card-tooltip"><b>{displayName}</b><em>{card.type} · custo {card.cost}</em><RichCardText text={card.text}/>{card.tags.length>0&&<span className="keyword-list">{card.tags.map(tag=><KeywordBadge name={tag} key={tag}/>)}</span>}</span>',
    '{!unit&&<span className="card-tooltip"><b>{displayName}</b><em>{card.type} · custo {card.cost}{card.type==="Criatura"?` · ${card.atk??0}/${card.hp??0}`:""}</em><RichCardText text={card.text}/>{card.tags.length>0&&<span className="keyword-list">{card.tags.map(tag=><KeywordBadge name={tag} key={tag}/>)}</span>}</span>}',
    "field tooltip suppression and creature stats");

  if (!source.includes('const previousHeroLife=useRef(player.life)')) {
    source = replaceOnce(source,
      'function PlayerHero({player,enemy=false,onLevel,canEvolveThisTurn=true,targetClass="",onTarget,onInspect}:{player:Player;enemy?:boolean;onLevel?:()=>void;canEvolveThisTurn?:boolean;targetClass?:string;onTarget?:()=>void;onInspect?:()=>void}){\n const d=deckById(player.heroId)',
      'function PlayerHero({player,enemy=false,onLevel,canEvolveThisTurn=true,targetClass="",onTarget,onInspect}:{player:Player;enemy?:boolean;onLevel?:()=>void;canEvolveThisTurn?:boolean;targetClass?:string;onTarget?:()=>void;onInspect?:()=>void}){\n const previousHeroLife=useRef(player.life),[heroHurt,setHeroHurt]=useState(false);\n useEffect(()=>{if(player.life<previousHeroLife.current){setHeroHurt(true);const timer=window.setTimeout(()=>setHeroHurt(false),620);previousHeroLife.current=player.life;return()=>window.clearTimeout(timer)}previousHeroLife.current=player.life},[player.life]);\n const d=deckById(player.heroId)',
      "hero damage state");
    source = replaceOnce(source,
      'return <div className={`player-hero ${enemy?"enemy":""} ${progressReady?"level-ready":""} ${targetClass}`}',
      'return <div className={`player-hero ${enemy?"enemy":""} ${progressReady?"level-ready":""} ${heroHurt?"hero-hurt":""} ${targetClass}`}',
      "hero damage class");
  }

  source = source.replace(
    'return <button type="button" className={`ability hero-ability-chip ${stateClass}`} key={ability} disabled={!clickable} onClick={()=>{if(clickable)onAbility?.(slot)}}',
    'return <button type="button" className={`ability hero-ability-chip ${stateClass}`} key={ability} aria-disabled={!clickable} tabIndex={clickable?0:-1} onClick={event=>{event.preventDefault();event.stopPropagation();if(clickable)onAbility?.(slot)}}'
  );
  await write(path, source);
}

{
  const path = "app/ui-board-polish-v17.css";
  const css = `/* Hemsfell Heroes — board interaction polish v17 */\n.screen-game .hero-command-bar{pointer-events:auto!important;z-index:620!important}\n.screen-game .hero-command-bar>.hero-ability-chip{position:relative!important;pointer-events:auto!important}\n.screen-game .hero-command-bar>.hero-ability-chip[aria-disabled=\"true\"]{pointer-events:none!important}\n.screen-game .hero-command-bar>.hero-ability-chip>span{margin-left:clamp(.12rem,.24cqw,.28rem)!important;align-self:stretch!important;display:flex!important;flex-direction:column!important;justify-content:center!important}\n.screen-game .hero-command-bar>.hero-ability-chip>span>b{align-self:flex-start!important;margin:0 0 clamp(.08rem,.16cqh,.14rem)!important;line-height:.9!important;letter-spacing:.08em!important}\n.screen-game .hero-command-bar>.hero-ability-chip>span>p{margin:0!important}\n.screen-game .hero-command-bar>.hero-ability-chip.is-active.is-available:hover,.screen-game .hero-command-bar>.hero-ability-chip.is-active.is-available:focus-visible{box-shadow:0 0 0 .1rem #ffd35ccc,0 0 clamp(.7rem,1.25cqw,1.25rem) #ffc934a8,inset 0 0 clamp(.35rem,.65cqw,.65rem) #ffd45a32!important;filter:brightness(1.13) saturate(1.14)!important}\n.screen-game .player-hero.hero-hurt>.hero-power-trigger{animation:heroDamagePulse .62s cubic-bezier(.2,.8,.25,1) both}\n.screen-game .player-hero.hero-hurt>.hero-power-trigger::after{content:\"\";position:absolute;inset:-7%;border-radius:16%;pointer-events:none;animation:heroDamageFlash .62s ease-out both}\n@keyframes heroDamagePulse{0%{transform:translateX(0) scale(1)}18%{transform:translateX(-2.5%) scale(1.035)}36%{transform:translateX(2.2%) scale(1.025)}54%{transform:translateX(-1.2%) scale(1.015)}100%{transform:translateX(0) scale(1)}}\n@keyframes heroDamageFlash{0%{box-shadow:0 0 0 0 rgba(255,74,57,.92);background:rgba(255,55,38,.28);opacity:1}100%{box-shadow:0 0 clamp(1rem,2cqw,2rem) clamp(.25rem,.55cqw,.55rem) rgba(255,51,34,0);background:rgba(255,55,38,0);opacity:0}}\n@container hemsfell-board (max-height:44rem){.screen-game .hero-command-bar>.hero-ability-chip>span{margin-left:clamp(.09rem,.2cqw,.2rem)!important}.screen-game .hero-command-bar>.hero-ability-chip>span>b{margin-bottom:clamp(.06rem,.12cqh,.1rem)!important}}\n@container hemsfell-board (max-height:36rem){.screen-game .hero-command-bar>.hero-ability-chip>span{margin-left:clamp(.07rem,.17cqw,.16rem)!important}}\n`;
  await write(path, css);
  const globals = "app/globals.css";
  let source = await read(globals);
  const importLine = '@import "./ui-board-polish-v17.css";';
  if (!source.includes(importLine)) source += `\n${importLine}\n`;
  await write(globals, source);
}

console.log("v17 applied: Pinga/Biriba, Mete o Pé, Zoiudo, field tooltips, hero controls and damage feedback.");
await import("./repair-runtime-ai-cost-v18.mjs");
