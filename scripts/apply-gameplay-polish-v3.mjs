import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = (path, value) => writeFile(path, normalize(value));
const replaceOnce = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch point not found: ${label}`);
  return source.replace(before, after);
};

// ---------------------------------------------------------------------------
// Responsive animation surface + Indomitable warning styling.
// ---------------------------------------------------------------------------
{
  const path = "app/lab-interaction-responsive.css";
  let source = await read(path);
  source = source
    .replace('width: clamp(8.7rem, min(14.2cqw, 27cqh), 15.5rem) !important;', 'width: clamp(11rem, min(17.4cqw, 31cqh), 18.8rem) !important;')
    .replace('max-width: min(14.2cqw, 27cqh) !important;', 'max-width: min(17.4cqw, 31cqh) !important;')
    .replace('width: clamp(10rem, min(15.5cqw, 29cqh), 16.5rem) !important;', 'width: clamp(12rem, min(18.6cqw, 33cqh), 20rem) !important;')
    .replace('max-width: min(15.5cqw, 29cqh) !important;', 'max-width: min(18.6cqw, 33cqh) !important;')
    .replace('width: clamp(7.8rem, min(13.3cqw, 24cqh), 13.5rem) !important;', 'width: clamp(10rem, min(16.4cqw, 28cqh), 16.8rem) !important;')
    .replace('max-width: min(13.3cqw, 24cqh) !important;', 'max-width: min(16.4cqw, 28cqh) !important;')
    .replace('width: min(12.3cqw, 22cqh) !important;', 'width: min(15.2cqw, 25cqh) !important;')
    .replace('max-width: min(12.3cqw, 22cqh) !important;', 'max-width: min(15.2cqw, 25cqh) !important;');

  if (!source.includes('.phase-orb-warning')) source += `

/* Mandatory attack feedback stays attached to the responsive phase control. */
.screen-game .game-stage > .game-content.hs-board > .phase-orb > .phase-orb-warning {
  position: absolute !important;
  top: calc(100% + clamp(.18rem, .42cqh, .36rem)) !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: clamp(7.5rem, 12cqw, 12rem) !important;
  padding: clamp(.2rem, .36cqh, .34rem) clamp(.28rem, .48cqw, .46rem) !important;
  border: 1px solid #e2b14a99 !important;
  border-radius: clamp(.28rem, .45cqw, .5rem) !important;
  background: #160d05ee !important;
  color: #ffd87a !important;
  font-size: clamp(.27rem, min(.43cqw, .72cqh), .5rem) !important;
  line-height: 1.15 !important;
  text-align: center !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  pointer-events: none !important;
  z-index: 190 !important;
  box-shadow: 0 .3cqh .8cqh #0008 !important;
}
`;
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Existing attachment cards with base + conditional subtype bonus.
// The attachment itself remains legal on any allied creature.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  if (!source.includes('p19: [ability("static"')) {
    const marker = '  p22: [ability("onCreatureDestroyed"';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: attachment conditional rules");
    const rules = `  p19: [ability("static", [effect("attachedStats", { attack: 0, health: 2 }), effect("conditionalAttachedBonus", { requiredSubtype: "Dragão", keyword: "Defensor" })])],
  p21: [ability("static", [effect("attachedKeyword", { keyword: "Voar" }), effect("conditionalAttachedBonus", { requiredSubtype: "Dragão", attack: 2, health: 0 })])],
`;
    source = source.slice(0, index) + rules + source.slice(index);
  }
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Effect semantics: subtype condition is an EXTRA attachment benefit, never an
// attachment legality constraint. Also preserve/clean explicit turn durations.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  if (!source.includes('conditionalAttachedBonus(state')) {
    const marker = '  gainEnergy(state, effect, context) {';
    const index = source.indexOf(marker);
    if (index < 0) throw new Error("Patch point not found: conditional attached effect");
    const handler = `  conditionalAttachedBonus(state, effect, context) { const source = findUnit(state, context.sourceId), target = source?.attachedTo ? findUnit(state, source.attachedTo) : null; if (!source || !target) return; if (effect.requiredSubtype && !hasSubtype(target, effect.requiredSubtype)) return; if (effect.attack || effect.health) defaultEffectHandlers.modifyStats(state, { type: "modifyStats", target: "attachedCreature", attack: effect.attack || 0, health: effect.health || 0, duration: "attached" }, context); if (effect.keyword) { target.grantedKeywords ||= []; const value = `attachment:${source.uid || source.id}:${effect.keyword}`; if (!target.grantedKeywords.includes(value)) target.grantedKeywords.push(value); } },
`;
    source = source.slice(0, index) + handler + source.slice(index);
  }
  source = source.replace(
    'grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId }); },',
    'grantDamageShield(state, effect, context) { const target = findUnit(state, context.targetIds?.[0]); if (!target) throw new RulesViolation("target-required"); target.damageShields ||= []; target.damageShields.push({ uses: effect.uses ?? 1, sourceId: context.sourceId, expires: effect.duration }); },'
  );
  await write(path, source);
}

// ---------------------------------------------------------------------------
// Engine authority: own-turn card counter for Sr. Goblin, exact Indomitable
// remaining-attack check, end-of-turn cleanup, and pre-entry "other creature"
// snapshot semantics.
// ---------------------------------------------------------------------------
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);

  source = replaceOnce(
    source,
    'entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1;',
    'entry.cardsPlayed = (entry.cardsPlayed || 0) + 1; if (state.active === item.command.owner) entry.turnCardsPlayed = (entry.turnCardsPlayed || 0) + 1; if (state.active === item.command.owner && entry.heroId === "goblin") entry.goblinTurnCardsPlayed = (entry.goblinTurnCardsPlayed || 0) + 1;',
    'own-turn card counter'
  );

  source = source.replace(
    'if (condition.controllerTurn && state.active !== owner) return false;',
    'if (condition.controllerTurn && state.active !== owner) return false;\n  if (condition.controllerControlsOtherSubtype) { const preEntry = event.preEntryControlledIds; const candidates = state.players[owner].board.filter((card) => Array.isArray(preEntry) ? preEntry.includes(card.uid || card.id) : (card.uid || card.id) !== (source.uid || source.id)); if (!candidates.some((card) => subtype(card, condition.controllerControlsOtherSubtype))) return false; }'
  );

  source = source.replace(
    '} entry.board.push(unit); entry.subtypesEnteredThisTurn ||= {};',
    '} const preEntryControlledIds = entry.board.map((card) => card.uid || card.id); entry.board.push(unit); entry.subtypesEnteredThisTurn ||= {};'
  );
  source = source.replace(
    'stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit } });',
    'stack.push({ kind: "event", event: { type: "onCreatureEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit, preEntryControlledIds } });'
  );
  source = source.replace(
    'stack.push({ kind: "event", event: { type: "onEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit } });',
    'stack.push({ kind: "event", event: { type: "onEnter", owner: item.command.owner, sourceId: unit.uid, cardId: unit.uid, card: unit, preEntryControlledIds: card.type === "Criatura" ? (entry.board || []).filter((candidate) => candidate.uid !== unit.uid).map((candidate) => candidate.uid || candidate.id) : undefined } });'
  );

  source = source.replace(
    'if (state.phase === "combate" && state.players[state.active].board.some((unit) => !unit.exhausted && !unit.attackedThisTurn && !unit.summoning && !unit.stunned && !hasKeyword(unit, /indom[aá]vel/i)',
    'if (state.phase === "combate" && state.players[state.active].board.some((unit) => { const attacksUsed = unit.attacksThisTurn ?? (unit.attackedThisTurn ? 1 : 0); return !unit.exhausted && attacksUsed < (unit.attackLimit || 1) && !unit.summoning && !unit.stunned && !hasKeyword(unit, /atordoado/i) && attackPermissionMet(unit) && hasKeyword(unit, /indom[aá]vel/i); })) throw new RulesViolation("indomitable-must-attack"); if (false && state.players[state.active].board.some((unit) => !unit.exhausted && !unit.attackedThisTurn && !unit.summoning && !unit.stunned && !hasKeyword(unit, /indom[aá]vel/i)'
  );
  /* Collapse the disabled legacy tail introduced above, if present. */
  source = source.replace(/if \(false && state\.players\[state\.active\]\.board\.some\(\(unit\) => !unit\.exhausted[\s\S]*?\)\) throw new RulesViolation\("indomitable-must-attack"\); /, '');

  source = source.replace(
    'unit.attackLimit = 1; } });',
    'unit.attackLimit = 1; unit.damageShields = (unit.damageShields || []).filter((shield) => shield.expires !== "turn" && shield.duration !== "turn"); } entry.nextElementEffects = (entry.nextElementEffects || []).filter((effect) => effect.expires !== "turn"); });'
  );

  source = source.replace(
    'if (state.phase === "manutencao") { state.active = 1 - state.active;',
    'if (state.phase === "manutencao") { const previousActive = 1 - state.active; state.players[previousActive].goblinTurnCardsPlayed = 0; state.active = 1 - state.active;'
  );

  await write(path, source);
}

// ---------------------------------------------------------------------------
// Client/UI: own-turn Sr. Goblin progress + exact Indomitable availability.
// ---------------------------------------------------------------------------
{
  const path = "app/page.tsx";
  let source = await read(path);
  source = source.replace('cardsPlayed:number;turnCardsPlayed:number;turnSpellsPlayed:number;', 'cardsPlayed:number;turnCardsPlayed:number;goblinTurnCardsPlayed?:number;turnSpellsPlayed:number;');
  source = source.replace('cardsPlayed:0,turnCardsPlayed:0,turnSpellsPlayed:0', 'cardsPlayed:0,turnCardsPlayed:0,goblinTurnCardsPlayed:0,turnSpellsPlayed:0');
  source = source.replace('if(player.heroId==="goblin")return player.turnCardsPlayed;', 'if(player.heroId==="goblin")return player.goblinTurnCardsPlayed||0;');

  if (!source.includes('const mandatoryIndomitableAttacker=')) {
    source = source.replace(
      'const heroEvolutionProgress=(player:Player)=>',
      'const mandatoryIndomitableAttacker=(player:Player)=>player.board.find(unit=>{const used=unit.attacksThisTurn??(unit.attackedThisTurn?1:0);return !unit.exhausted&&used<(unit.attackLimit||1)&&!unit.summoning&&!unit.stunned&&!unit.immobilized&&!/não pode atacar/i.test(unit.text)&&hasKeyword(player,unit,"Indomável")});\nconst heroEvolutionProgress=(player:Player)=>'
    );
  }

  source = source.replace(
    'p.hand.splice(idx,1);p.cardsPlayed++;p.turnCardsPlayed++;if(c.type==="Feitiço")p.turnSpellsPlayed++;',
    'p.hand.splice(idx,1);p.cardsPlayed++;if(g.active===owner)p.turnCardsPlayed++;if(g.active===owner&&p.heroId==="goblin")p.goblinTurnCardsPlayed=(p.goblinTurnCardsPlayed||0)+1;if(c.type==="Feitiço"&&g.active===owner)p.turnSpellsPlayed++;'
  );
  source = source.replace(
    'p.hand.splice(pick.i,1);p.cardsPlayed++;p.turnCardsPlayed++;if(c.type==="Feitiço")p.turnSpellsPlayed++;',
    'p.hand.splice(pick.i,1);p.cardsPlayed++;p.turnCardsPlayed++;if(p.heroId==="goblin")p.goblinTurnCardsPlayed=(p.goblinTurnCardsPlayed||0)+1;if(c.type==="Feitiço")p.turnSpellsPlayed++;'
  );

  source = source.replace(
    'finishImageEffects(g,owner);const p=g.players[owner];bankRemainingEnergy(p);g.active=',
    'finishImageEffects(g,owner);const p=g.players[owner];p.goblinTurnCardsPlayed=0;bankRemainingEnergy(p);g.active='
  );
  source = source.replace(
    'resolveUrukLevelOne(g,1,urukFireTarget);finishImageEffects(g,1);bankRemainingEnergy(p);g.active=0;',
    'resolveUrukLevelOne(g,1,urukFireTarget);finishImageEffects(g,1);p.goblinTurnCardsPlayed=0;bankRemainingEnergy(p);g.active=0;'
  );

  source = source.replace(
    'const finishCombat=()=>{if(combatAction||responseWindow||!game)return;const forced=game.players[0].board.find(unit=>!unit.exhausted&&!unit.attackedThisTurn&&!unit.summoning&&!unit.stunned&&!unit.immobilized&&!/não pode atacar/i.test(unit.text)&&hasKeyword(game.players[0],unit,"Indomável"));',
    'const finishCombat=()=>{if(combatAction||responseWindow||!game)return;const forced=mandatoryIndomitableAttacker(game.players[0]);'
  );
  source = source.replace(
    'disabled={priorityLocked||!!combatAction||!!responseWindow||!!game.pendingReposition} onClick={finishCombat}',
    'disabled={priorityLocked||!!combatAction||!!responseWindow||!!game.pendingReposition||!!mandatoryIndomitableAttacker(me)} onClick={finishCombat}'
  );
  source = source.replace(
    '{game.active===0&&game.phase==="fim"&&<button disabled={priorityLocked} onClick={()=>endTurn()}>Encerrar turno<span>→</span></button>}</div>',
    '{game.active===0&&game.phase==="fim"&&<button disabled={priorityLocked} onClick={()=>endTurn()}>Encerrar turno<span>→</span></button>}{game.active===0&&game.phase==="combate"&&mandatoryIndomitableAttacker(me)&&<small className="phase-orb-warning">⚠ {mandatoryIndomitableAttacker(me)!.name} precisa atacar antes de encerrar o combate.</small>}</div>'
  );

  await write(path, source);
}

console.log("Gameplay polish v3 applied successfully.");
