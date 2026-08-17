from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text(encoding='utf-8')
    if old not in s:
        raise SystemExit(f'anchor not found in {path}: {old[:120]!r}')
    p.write_text(s.replace(old, new, 1), encoding='utf-8')

# 1) Café do Tempo triggers only after maintenance is left and opens an
# authoritative placement decision owned by the card controller.
replace_once(
    'app/rules-engine/card-rules.mjs',
    '  p212: [ability("onMaintenance", [effect("createImage", { name: "Gato Multidimensional", destination: "activePlayerField", mandatory: true, replaceIfFull: true, supportAllowedIfHeroLevel: { hero: "Rasmus, o Barista do Tempo", level: 3 } })])],',
    '  p212: [ability("onMaintenanceExit", [effect("chooseActivePlayerImagePlacement", { name: "Gato Multidimensional", supportAllowedIfHeroLevel: { heroId: "rasmus", level: 3 } })])],'
)

# 2) New effect queues the placement choice. The owner of the decision remains
# the Café controller while targetOwner is always the active player.
effects = Path('app/rules-engine/effects.mjs')
s = effects.read_text(encoding='utf-8')
anchor = '  createImage(state, effect, context) {\n'
insert = '''  chooseActivePlayerImagePlacement(state, effect, context) {\n    const targetOwner = state.active, target = player(state, targetOwner), controller = player(state, context.owner);\n    const creatureSlots = Array.from({ length: 5 }, (_, slot) => slot).filter((slot) => !(target.board || []).some((unit) => unit.slot === slot));\n    const supportRule = effect.supportAllowedIfHeroLevel;\n    const supportAllowed = !!supportRule && controller.heroId === supportRule.heroId && (controller.level || 1) >= (supportRule.level || 3);\n    const supportSlots = supportAllowed ? Array.from({ length: 5 }, (_, slot) => slot).filter((slot) => !(target.support || []).some((unit) => unit.slot === slot)) : [];\n    if (!creatureSlots.length && !supportSlots.length) return;\n    queueDecision(state, { ...effect, targetOwner, creatureSlots, supportSlots }, { ...context, decisionOwner: context.owner }, "image-placement");\n  },\n'''
if anchor not in s:
    raise SystemExit('createImage anchor not found')
s = s.replace(anchor, insert + anchor, 1)
old_creature = '''    } else if (base.type === "Criatura") {\n      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot));\n      if (openSlot == null) { if (effect.mandatory) { queueDecision(state, effect, { ...context, owner }, "replace-for-mandatory-image"); return; } throw new RulesViolation("field-full"); }\n      copy.slot = context.slot != null && !entry.board.some((unit) => unit.slot === context.slot) ? context.slot : openSlot;\n      entry.board.push(copy);\n    } else {'''
new_creature = '''    } else if (base.type === "Criatura") {\n      if (context.placementZone === "support") {\n        const desired = Number(context.slot);\n        if (!Number.isInteger(desired) || desired < 0 || desired > 4 || entry.support.some((unit) => unit.slot === desired)) throw new RulesViolation("support-zone-full");\n        copy.slot = desired;\n        entry.support.push(copy);\n      } else {\n        const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.board.some((unit) => unit.slot === slot));\n        if (openSlot == null) { if (effect.mandatory) { queueDecision(state, effect, { ...context, owner }, "replace-for-mandatory-image"); return; } throw new RulesViolation("field-full"); }\n        copy.slot = context.slot != null && !entry.board.some((unit) => unit.slot === context.slot) ? context.slot : openSlot;\n        entry.board.push(copy);\n      }\n    } else {'''
if old_creature not in s:
    raise SystemExit('createImage creature block not found')
effects.write_text(s.replace(old_creature, new_creature, 1), encoding='utf-8')

# 3) Emit the new event exactly when maintenance -> principal happens.
engine = Path('app/rules-engine/engine-base.mjs')
s = engine.read_text(encoding='utf-8')
old = 'state.phase = order[(index + 1) % order.length]; if (state.phase === "fim")'
new = 'const leavingPhase = state.phase; state.phase = order[(index + 1) % order.length]; if (leavingPhase === "manutencao" && state.phase === "principal") stack.push({ kind: "event", event: { type: "onMaintenanceExit", owner: state.active } }); if (state.phase === "fim")'
if old not in s:
    raise SystemExit('phase transition anchor not found')
s = s.replace(old, new, 1)

# Resolve placement: decision owner chooses, targetOwner receives the Image.
anchor = '        if (decision.kind === "investigate-selection") {\n'
branch = '''        if (decision.kind === "image-placement") {\n          const targetOwner = Number(decision.effect.targetOwner), slot = Number(item.command.slot), placementZone = item.command.placementZone === "support" ? "support" : "creature";\n          if (![0, 1].includes(targetOwner) || !Number.isInteger(slot) || slot < 0 || slot > 4) throw new RulesViolation("invalid-image-placement");\n          const allowed = placementZone === "support" ? (decision.effect.supportSlots || []) : (decision.effect.creatureSlots || []);\n          if (!allowed.includes(slot)) throw new RulesViolation("invalid-image-placement");\n          const targetEntry = state.players[targetOwner];\n          if (placementZone === "support" ? targetEntry.support.some((unit) => unit.slot === slot) : targetEntry.board.some((unit) => unit.slot === slot)) throw new RulesViolation("image-placement-occupied");\n          state.pendingDecision = null; stack.push(...continuation);\n          stack.push({ kind: "effect", effect: { type: "createImage", name: decision.effect.name, destination: "field" }, context: { ...decision.context, owner: targetOwner, decisionOwner: item.command.owner, slot, placementZone } });\n          continue;\n        }\n'''
if anchor not in s:
    raise SystemExit('resolveDecision anchor not found')
s = s.replace(anchor, branch + anchor, 1)
engine.write_text(s, encoding='utf-8')

# 4) AI can resolve a Café do Tempo placement when it owns the decision.
ai = Path('app/rules-engine/ai.mjs')
s = ai.read_text(encoding='utf-8')
anchor = '  if (decision.kind === "investigate-selection") {\n'
branch = '''  if (decision.kind === "image-placement") {\n    const creatureSlots = effect.creatureSlots || [], supportSlots = effect.supportSlots || [];\n    if (creatureSlots.length) return { ...command, slot: creatureSlots[0], placementZone: "creature" };\n    if (supportSlots.length) return { ...command, slot: supportSlots[0], placementZone: "support" };\n    return null;\n  }\n'''
if anchor not in s:
    raise SystemExit('AI decision anchor not found')
ai.write_text(s.replace(anchor, branch + anchor, 1), encoding='utf-8')

# 5) UI: expose the authoritative placement decision as clickable empty slots.
page = Path('app/page.tsx')
s = page.read_text(encoding='utf-8')
s = s.replace(
    'nameIncludes?:string};context?:Record<string,any>;',
    'nameIncludes?:string;name?:string;targetOwner?:0|1;creatureSlots?:number[];supportSlots?:number[]};context?:Record<string,any>;',
    1,
)

old_sig = 'onSupportTarget?:(uid:string)=>void;activationEnabled?:boolean;combatActive?:boolean;repositionActive?:boolean;onRepositionDrop?:(uid:string,slot:number)=>void}){'
new_sig = 'onSupportTarget?:(uid:string)=>void;placementCreatureSlots?:number[];placementSupportSlots?:number[];onPlacement?:(slot:number,zone:"creature"|"support")=>void;activationEnabled?:boolean;combatActive?:boolean;repositionActive?:boolean;onRepositionDrop?:(uid:string,slot:number)=>void}){'
if old_sig not in s:
    raise SystemExit('BattlefieldRows type anchor not found')
s = s.replace(old_sig, new_sig, 1)
old_params = 'onActivateSupport,onActivateCreature,onSupportTarget,activationEnabled=false,combatActive=false,repositionActive=false,onRepositionDrop}'
new_params = 'onActivateSupport,onActivateCreature,onSupportTarget,placementCreatureSlots,placementSupportSlots,onPlacement,activationEnabled=false,combatActive=false,repositionActive=false,onRepositionDrop}'
if old_params not in s:
    raise SystemExit('BattlefieldRows param anchor not found')
s = s.replace(old_params, new_params, 1)

old_vars = 'canSupport=!repositionActive&&drop&&!support&&(isAuxiliaryCard||catSupport)&&(dragged!.type!=="Artefato"||!!creature),creatureRuleTarget='
new_vars = 'canSupport=!repositionActive&&drop&&!support&&(isAuxiliaryCard||catSupport)&&(dragged!.type!=="Artefato"||!!creature),placementCreature=!!placementCreatureSlots?.includes(slot),placementSupport=!!placementSupportSlots?.includes(slot),creatureRuleTarget='
if old_vars not in s:
    raise SystemExit('BattlefieldRows slot vars anchor not found')
s = s.replace(old_vars, new_vars, 1)

s = s.replace(
    '${canCreature?`can-drop exact-drop ${creature?"replace-drop":""}`:""}`} data-slot={slot+1}',
    '${canCreature?`can-drop exact-drop ${creature?"replace-drop":""}`:""} ${placementCreature?"placement-target":""}`} data-slot={slot+1} onClick={()=>{if(placementCreature)onPlacement?.(slot,"creature")}}',
    1,
)
s = s.replace(
    '${canSupport?"can-drop exact-drop":""}`} data-slot={slot+1}',
    '${canSupport?"can-drop exact-drop":""} ${placementSupport?"placement-target":""}`} data-slot={slot+1} onClick={()=>{if(placementSupport)onPlacement?.(slot,"support")}}',
    1,
)

# Local decision derivation and command.
anchor = ' const engineTargetDecision=!!engineDecision&&["targets","activation-targets"].includes(engineDecision.kind);\n'
insert = ''' const imagePlacementDecision=!!engineDecision&&engineDecision.kind==="image-placement"&&engineDecision.owner===0;\n const imagePlacementTargetOwner=imagePlacementDecision?Number(engineDecision.effect.targetOwner):-1;\n const imagePlacementCreatureSlots=imagePlacementDecision?(engineDecision.effect.creatureSlots||[]):[];\n const imagePlacementSupportSlots=imagePlacementDecision?(engineDecision.effect.supportSlots||[]):[];\n const chooseImagePlacement=(slot:number,zone:"creature"|"support")=>{if(!imagePlacementDecision)return;void runRulesCommand({type:"resolveDecision",slot,placementZone:zone},0)};\n'''
if anchor not in s:
    raise SystemExit('engine decision UI anchor not found')
s = s.replace(anchor, insert + anchor, 1)

# Add props to enemy and local battlefield rows.
old_enemy = 'onSupportTarget={enemyPermanentTarget?applyTarget:undefined}/><EnergyPanel player={foe} enemy/>'
new_enemy = 'onSupportTarget={enemyPermanentTarget?applyTarget:undefined} placementCreatureSlots={imagePlacementTargetOwner===1?imagePlacementCreatureSlots:undefined} placementSupportSlots={imagePlacementTargetOwner===1?imagePlacementSupportSlots:undefined} onPlacement={imagePlacementTargetOwner===1?chooseImagePlacement:undefined}/><EnergyPanel player={foe} enemy/>'
if old_enemy not in s:
    raise SystemExit('enemy BattlefieldRows usage anchor not found')
s = s.replace(old_enemy, new_enemy, 1)
old_local = 'onSupportTarget={allyPermanentTarget?applyTarget:undefined}/><EnergyPanel player={me}/>'
new_local = 'onSupportTarget={allyPermanentTarget?applyTarget:undefined} placementCreatureSlots={imagePlacementTargetOwner===0?imagePlacementCreatureSlots:undefined} placementSupportSlots={imagePlacementTargetOwner===0?imagePlacementSupportSlots:undefined} onPlacement={imagePlacementTargetOwner===0?chooseImagePlacement:undefined}/><EnergyPanel player={me}/>'
if old_local not in s:
    raise SystemExit('local BattlefieldRows usage anchor not found')
s = s.replace(old_local, new_local, 1)

# Mandatory placement banner; no cancel button.
anchor = '   {targeting&&<div className="target-banner">'
insert = '   {imagePlacementDecision&&<div className="target-banner cafe-time-placement-banner"><div><b>POSICIONE O GATO MULTIDIMENSIONAL</b><span>Café do Tempo · escolha um espaço disponível no campo do jogador da vez</span></div></div>}\n'
if anchor not in s:
    raise SystemExit('target banner render anchor not found')
s = s.replace(anchor, insert + anchor, 1)

# Legacy maintenance used by the local/bot UI also queues the same decision.
# It checks both players because Café do Tempo triggers even during the opponent turn.
helper_anchor = ' const update=(fn:(g:Game)=>void)=>setGame(old=>{'
helper = ''' const queueCafeDoTempoPlacement=(g:Game)=>{\n  if(g.pendingDecision)return;\n  const targetOwner=g.active;\n  for(const owner of [0,1] as const){\n   const source=g.players[owner].terrain?.page===212&&!g.players[owner].terrain?.suffocated?g.players[owner].terrain:null;if(!source)continue;\n   const target=g.players[targetOwner],creatureSlots=Array.from({length:5},(_,slot)=>slot).filter(slot=>!target.board.some(unit=>unit.slot===slot));\n   const supportSlots=g.players[owner].heroId==="rasmus"&&g.players[owner].level>=3?Array.from({length:5},(_,slot)=>slot).filter(slot=>!target.support.some(unit=>unit.slot===slot)):[];\n   if(!creatureSlots.length&&!supportSlots.length)continue;\n   g.pendingDecision={kind:"image-placement",owner,effect:{name:"Gato Multidimensional",targetOwner,creatureSlots,supportSlots},context:{owner,sourceId:source.uid,decisionOwner:owner},sourceName:"Café do Tempo"};return;\n  }\n };\n'''
if helper_anchor not in s:
    raise SystemExit('update helper anchor not found')
s = s.replace(helper_anchor, helper + helper_anchor, 1)

old_local_maintenance = 'p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,0);if(p.terrain?.page===212)summonImage(g,0,"Gato Multidimensional");g.phase="principal";'
new_local_maintenance = 'p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,0);g.phase="principal";queueCafeDoTempoPlacement(g);'
if old_local_maintenance not in s:
    raise SystemExit('local maintenance anchor not found')
s = s.replace(old_local_maintenance, new_local_maintenance, 1)
old_bot_maintenance = 'p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,1);if(p.terrain?.page===212)summonImage(g,1,"Gato Multidimensional");g.phase="principal";'
new_bot_maintenance = 'p.energy=p.maxEnergy;resolveMaintenanceTriggers(g,1);g.phase="principal";queueCafeDoTempoPlacement(g);'
if old_bot_maintenance not in s:
    raise SystemExit('bot maintenance anchor not found')
s = s.replace(old_bot_maintenance, new_bot_maintenance, 1)
page.write_text(s, encoding='utf-8')

# 6) Regression coverage.
Path('tests/cafe-do-tempo-placement.test.mjs').write_text(r'''import assert from "node:assert/strict";
import test from "node:test";
import cards from "../app/cards.generated.json" with { type: "json" };
import { compileCard } from "../app/rules-engine/compiler.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";
import { chooseAIDecision } from "../app/rules-engine/ai.mjs";

const catalog=cards.map(compileCard);
const printed=page=>compileCard(cards.find(card=>card.page===page));
const player=(heroId,level=1)=>({heroId,level,heroXP:0,markers:{},abilityUses:{},life:30,maxLife:30,energy:5,maxEnergy:5,reserve:0,deck:[],extraDeck:catalog.filter(card=>card.imageCard),hand:[],board:[],support:[],terrain:null,grave:[],obscuro:[],turnCardsPlayed:0,turnSpellsPlayed:0});
const state=(active=0,level=1)=>({active,phase:"manutencao",round:3,cardCatalog:catalog,players:[player("rasmus",level),player("goblin",1)]});
const installCafe=(game,owner=0)=>{game.players[owner].terrain={...printed(212),uid:`cafe-time-${owner}`,slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false};};

test("Café do Tempo waits until maintenance is left and its controller chooses on own turn",()=>{
 const game=state(0);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.phase,"principal");
 assert.equal(next.pendingDecision?.kind,"image-placement");
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,0);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:2,placementZone:"creature"}).state;
 const cat=placed.players[0].board.find(card=>card.name==="Gato Multidimensional");
 assert.ok(cat);assert.equal(cat.slot,2);assert.equal(placed.players[1].board.length,0);
});

test("Café do Tempo controller chooses placement on the opponent active field",()=>{
 const game=state(1);installCafe(game,0);
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.equal(next.pendingDecision?.owner,0);
 assert.equal(next.pendingDecision?.effect.targetOwner,1);
 assert.throws(()=>executeCommand(next,{type:"resolveDecision",owner:1,slot:1,placementZone:"creature"}),/decision-not-owned/);
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:3,placementZone:"creature"}).state;
 assert.equal(placed.players[0].board.length,0);
 const cat=placed.players[1].board.find(card=>card.name==="Gato Multidimensional");assert.ok(cat);assert.equal(cat.slot,3);
});

test("Rasmus level 3 may place Café do Tempo cat in an available auxiliary slot of the active player",()=>{
 const game=state(1,3);installCafe(game,0);game.players[1].support.push({...printed(229),uid:"occupied",slot:0,enteredRound:1,damage:0,modifiers:[],grantedKeywords:[],exhausted:false,summoning:false});
 const next=executeCommand(game,{type:"advancePhase",owner:1}).state;
 assert.ok(next.pendingDecision.effect.supportSlots.includes(1));
 const placed=executeCommand(next,{type:"resolveDecision",owner:0,slot:1,placementZone:"support"}).state;
 const cat=placed.players[1].support.find(card=>card.name==="Gato Multidimensional");assert.ok(cat);assert.equal(cat.slot,1);
});

test("AI resolves its own Café do Tempo placement through the same decision",()=>{
 const game=state(0);installCafe(game,1);game.players[1].heroId="rasmus";
 const next=executeCommand(game,{type:"advancePhase",owner:0}).state;
 assert.equal(next.pendingDecision.owner,1);
 const command=chooseAIDecision(next,1,"Normal");assert.equal(command.type,"resolveDecision");assert.equal(command.owner,1);assert.ok(Number.isInteger(command.slot));
 const placed=executeCommand(next,command).state;assert.ok(placed.players[0].board.some(card=>card.name==="Gato Multidimensional"));
});
''', encoding='utf-8')
