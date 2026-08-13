import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// Pinga Levanta Defunto (p48): only playable while the controller has a Goblin
// in their graveyard. Por Conta da Casa (p43) already queues -2 for the next
// non-creature card; this migration keeps that authoritative rule intact.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'p48: [ability("onPlay", [effect("resurrect", { zone: "grave", cardType: "Criatura", subtype: "Goblin", destination: "field" }), effect("configureResurrected", { grantKeywordIfCombo: "Investida", destroyAtTurnEnd: true })])],',
    'p48: [ability("onPlay", [effect("resurrect", { zone: "grave", cardType: "Criatura", subtype: "Goblin", destination: "field" }), effect("configureResurrected", { grantKeywordIfCombo: "Investida", destroyAtTurnEnd: true })], [], { playCondition: { controllerGraveHasSubtype: "Goblin" } })],',
    "Pinga play condition"
  );
  await write(path, source);
}

// Canonical engine play-condition for graveyard subtype requirements.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  source = replaceOnce(
    source,
    'function playConditionMatches(state, owner, condition) {\n  if (!condition) return true;\n  if (condition.alliedPermanentHasTrigger)',
    'function playConditionMatches(state, owner, condition) {\n  if (!condition) return true;\n  if (condition.controllerGraveHasSubtype && !state.players[owner].grave.some((card) => subtype(card, condition.controllerGraveHasSubtype))) return false;\n  if (condition.alliedPermanentHasTrigger)',
    "grave subtype play condition"
  );
  await write(path, source);
}

// Cards entering hidden zones must lose every battlefield/temporary mutation.
// The printed identity/stats/text remain; runtime state, counters, modifiers,
// granted keywords, attachments and temporary cost changes are discarded.
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  const before = `  for (const key of [\n    "exhausted", "summoning", "attackedThisTurn", "attacksThisTurn", "defenseUses",\n    "frozen", "stunned", "suffocated", "immobilized", "impacting", "activatedThisTurn",\n    "temporaryAtk", "temporaryHp", "temporaryTags", "targetClass", "selected"\n  ]) delete copy[key];`;
  const after = `  for (const key of [\n    "uid", "slot", "enteredRound", "exhausted", "summoning", "attackedThisTurn", "attacksThisTurn", "defenseUses",\n    "damage", "bonusAtk", "bonusHp", "frozen", "stunned", "suffocated", "suffocatedUntilTurnEnd", "suffocatedBySources",\n    "immobilized", "impacting", "activatedThisTurn", "markers", "modifiers", "grantedKeywords", "staticModifiers",\n    "temporaryAtk", "temporaryHp", "temporaryTags", "temporarySubtypes", "combatRestrictions", "damageShields",\n    "attachedTo", "linkedCreatures", "lastDamagedBy", "damagedOwnersThisTurn", "killedByRepeatSourceId",\n    "costModifier", "costModifierExpires", "costModifierExpiresRound", "cardsPlayedAfterSelf", "targetClass", "selected"\n  ]) delete copy[key];`;
  source = replaceOnce(source, before, after, "graveyard runtime reset");
  await write(path, source);
}

// UI mirrors the canonical queued-discount system and exposes Pinga as
// unavailable until a Goblin exists in the graveyard.
{
  const path = "app/page.tsx";
  let source = await read(path);

  source = replaceOnce(
    source,
    'reserve:number;noReserveStorageThisTurn?:boolean;deck:CardDef[];',
    'reserve:number;noReserveStorageThisTurn?:boolean;nextCardDiscounts?:Array<{amount:number;type?:CardType;typeNot?:CardType;expiresRound?:number}>;deck:CardDef[];',
    "Player queued discounts type"
  );

  source = replaceOnce(
    source,
    'if(c.type==="Feitiço"&&boardEffects.some(unit=>/seus feitiços custam 1 a menos de energia/i.test(unit.text+unit.tags.join(" "))))cost-=1;cost-=p.nextCardDiscount;',
    'if(c.type==="Feitiço"&&boardEffects.some(unit=>/seus feitiços custam 1 a menos de energia/i.test(unit.text+unit.tags.join(" "))))cost-=1;const queuedDiscount=(p.nextCardDiscounts||[]).find(rule=>(rule.expiresRound==null||rule.expiresRound>0)&&(!rule.type||rule.type===c.type)&&(!rule.typeNot||rule.typeNot!==c.type));if(queuedDiscount)cost-=queuedDiscount.amount||0;cost-=p.nextCardDiscount;',
    "UI queued discount calculation"
  );

  if (!source.includes('const cardPlayRequirementMet=')) {
    source = replaceOnce(
      source,
      'const playableResource=(c:CardDef,p:Player,asResponse=false)=>creaturePaysLife(c,p,asResponse)?(p.heroId==="saymon"?Math.max(0,p.life-1):p.life):playableEnergy(c,p,asResponse);',
      'const playableResource=(c:CardDef,p:Player,asResponse=false)=>creaturePaysLife(c,p,asResponse)?(p.heroId==="saymon"?Math.max(0,p.life-1):p.life):playableEnergy(c,p,asResponse);\nconst cardPlayRequirementMet=(c:CardDef,p:Player)=>c.page!==48||p.grave.some(card=>hasFaction(card,"Goblin"));',
      "UI Pinga availability helper"
    );
  }

  source = replaceOnce(
    source,
    'const p=game.players[0],c=p.hand[idx];if(!c)return;',
    'const p=game.players[0],c=p.hand[idx];if(!c)return;if(!cardPlayRequirementMet(c,p)){update(g=>log(g,`${c.name} só pode ser jogada se houver um Goblin no seu Cemitério.`,"danger"));return}',
    "requestPlay Pinga gate"
  );

  source = replaceOnce(
    source,
    'disabled={priorityLocked||game.active!==0||game.phase!=="principal"||effectiveCost(c,me)>playableResource(c,me)}',
    'disabled={priorityLocked||game.active!==0||game.phase!=="principal"||!cardPlayRequirementMet(c,me)||effectiveCost(c,me)>playableResource(c,me)}',
    "hand availability gate"
  );

  await write(path, source);
}

console.log("v14 applied: Por Conta da Casa UI discount sync, Pinga grave requirement, and graveyard state reset.");
