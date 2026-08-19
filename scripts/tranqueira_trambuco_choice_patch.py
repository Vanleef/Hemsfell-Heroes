from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# 1) Canonical p46 rule: the generated card is actually named
#    TRAMBUCO DO PIPOCO in the catalog.  The six-card reward must attach to a
#    Goblin, automatically when there is one legal host and by controller
#    choice when there are two or more.
rules_path = Path("app/rules-engine/card-rules.mjs")
rules = rules_path.read_text(encoding="utf-8")
rules = replace_once(
    rules,
    'effect("createImage", { name: "TRAMBUCO DE PIPOCO", destination: "field" })',
    'effect("createImage", { name: "TRAMBUCO DO PIPOCO", destination: "field", autoAttachSubtype: "Goblin", chooseAttachmentIfMultiple: true, ignoreSupportPage: 46, skipIfNoValidPlacement: true })',
    "canonical Trambuco reward",
)
rules_path.write_text(rules, encoding="utf-8")


# 2) Authoritative createImage primitive.
#    `ignoreSupportPage: 46` lets the generated artifact occupy the slot that
#    the resolving Tranqueira is about to vacate.  All ordinary createImage
#    calls keep their previous placement semantics.
effects_path = Path("app/rules-engine/effects.mjs")
effects = effects_path.read_text(encoding="utf-8")
create_start = effects.index('  createImage(state, effect, context) {')
create_end = effects.index('  resurrect(state, effect, context)', create_start)
create_block = effects[create_start:create_end]

old_base = '    const base = catalog.find((card) => card.name === effect.name) || { id: `image:${effect.name}`, name: effect.name, type: "Criatura", atk: 1, hp: 1, tags: [] };\n'
new_base = '''    const base = catalog.find((card) => card.name === effect.name) || { id: `image:${effect.name}`, name: effect.name, type: "Criatura", atk: 1, hp: 1, tags: [] };\n    const ignoredSupportIds = new Set(effect.ignoreSupportPage == null ? [] : (entry.support || []).filter((unit) => unit.page === effect.ignoreSupportPage).map((unit) => unit.uid || unit.id));\n    const supportSlotAvailable = (slot) => !(entry.support || []).some((unit) => unit.slot === slot && !ignoredSupportIds.has(unit.uid || unit.id));\n    let generatedAttachmentHost = null;\n    if (base.type === "Artefato" && effect.autoAttachSubtype) {\n      const candidates = (entry.board || []).filter((unit) => hasSubtype(unit, effect.autoAttachSubtype) && supportSlotAvailable(unit.slot));\n      const chosenAttachmentId = selectedIds(context)[0] || context.attachedTo;\n      if (chosenAttachmentId) {\n        generatedAttachmentHost = candidates.find((unit) => (unit.uid || unit.id) === chosenAttachmentId) || null;\n        if (!generatedAttachmentHost) { if (effect.skipIfNoValidPlacement) return; throw new RulesViolation("invalid-attachment-target"); }\n      } else if (candidates.length === 1) generatedAttachmentHost = candidates[0];\n      else if (candidates.length > 1 && effect.chooseAttachmentIfMultiple) {\n        if (state.pendingDecision) throw new RulesViolation("decision-pending");\n        state.pendingDecision = {\n          kind: "targets",\n          owner: context.owner,\n          effect: { replayEffects: [{ ...effect }] },\n          context: { ...context, targetIds: [] },\n          targetSteps: [{ scope: "allyCreature", role: "effect", requiredSubtype: effect.autoAttachSubtype, allowedIds: candidates.map((unit) => unit.uid || unit.id) }],\n          sourceName: context.effectSource?.name || effect.name,\n        };\n        return;\n      } else if (candidates.length) generatedAttachmentHost = candidates[0];\n      else { if (effect.skipIfNoValidPlacement) return; throw new RulesViolation("artifact-target-required"); }\n    }\n'''
create_block = replace_once(create_block, old_base, new_base, "createImage base block")
create_block = replace_once(
    create_block,
    '      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => !entry.support.some((unit) => unit.slot === slot));\n',
    '      const openSlot = Array.from({ length: 5 }, (_, slot) => slot).find((slot) => supportSlotAvailable(slot));\n',
    "createImage support open slot",
)
old_artifact = '''      if (base.type === "Artefato" && base.page !== 304) {\n        const host = entry.board.find((unit) => unit.uid === context.attachedTo);\n        if (!host) throw new RulesViolation("artifact-target-required");\n        copy.attachedTo = host.uid; copy.slot = host.slot;\n      } else copy.slot = context.slot != null && !entry.support.some((unit) => unit.slot === context.slot) ? context.slot : openSlot;'''
new_artifact = '''      if (base.type === "Artefato" && base.page !== 304) {\n        const host = generatedAttachmentHost || entry.board.find((unit) => unit.uid === context.attachedTo || unit.id === context.attachedTo);\n        if (!host) { if (effect.skipIfNoValidPlacement) return; throw new RulesViolation("artifact-target-required"); }\n        if (!supportSlotAvailable(host.slot)) { if (effect.skipIfNoValidPlacement) return; throw new RulesViolation("support-zone-full"); }\n        copy.attachedTo = host.uid || host.id; copy.slot = host.slot;\n      } else copy.slot = context.slot != null && supportSlotAvailable(context.slot) ? context.slot : openSlot;'''
create_block = replace_once(create_block, old_artifact, new_artifact, "createImage artifact placement")
effects = effects[:create_start] + create_block + effects[create_end:]
effects_path.write_text(effects, encoding="utf-8")


# 3) Local / vs-AI compatibility path.  The authoritative online interface
#    already renders pending `targets` decisions.  The legacy local end-turn
#    path needs to pause before cleanup and use its existing battlefield target
#    selector when multiple Goblins are legal.
page_path = Path("app/page.tsx")
page = page_path.read_text(encoding="utf-8")

page = replace_once(
    page,
    'type Targeting={kind:"attach"|"spell"|"elemental-optional"|"gimble"|"natureza"|"saymon"|"saymon-life"|"ngoro"|"uruk-fire";source:string;cardIndex?:number;amount?:number;response?:boolean;fieldSlot?:number;required?:number;minimum?:number;selected?:string[];chosenElement?:ElementName};',
    'type Targeting={kind:"attach"|"spell"|"elemental-optional"|"gimble"|"natureza"|"saymon"|"saymon-life"|"ngoro"|"uruk-fire"|"tranqueira-attach";source:string;cardIndex?:number;amount?:number;response?:boolean;fieldSlot?:number;required?:number;minimum?:number;selected?:string[];chosenElement?:ElementName;sourceUid?:string;allowedIds?:string[]};',
    "Targeting union",
)

summon_start = page.index('const summonImage=(g:Game,owner:0|1,name:string')
summon_end = page.index('const summonCreatedImage=', summon_start)
summon = page[summon_start:summon_end]
summon = replace_once(
    summon,
    'const summonImage=(g:Game,owner:0|1,name:string,destination?:"field"|"hand",temporary=false)=>{',
    'const summonImage=(g:Game,owner:0|1,name:string,destination?:"field"|"hand",temporary=false,attachedToUid?:string)=>{',
    "summonImage signature",
)
summon = replace_once(
    summon,
    'const artifactHost=card.type==="Artefato"?p.board.find(creature=>!p.support.some(a=>a.attachedTo===creature.uid)):undefined;',
    'const isTrambuco=cleanName(card.name)===cleanName("TRAMBUCO DO PIPOCO"),artifactCandidates=card.type==="Artefato"?p.board.filter(creature=>isTrambuco?(hasFaction(creature,"Goblin")&&!p.support.some(a=>a.slot===creature.slot&&a.page!==46)):!p.support.some(a=>a.attachedTo===creature.uid)):[],artifactHost=card.type==="Artefato"?(attachedToUid?artifactCandidates.find(creature=>creature.uid===attachedToUid):artifactCandidates[0]):undefined;',
    "summonImage artifact candidates",
)
page = page[:summon_start] + summon + page[summon_end:]

# Only replace the live-per-instance p46 branch added by the prior expiry fix;
# the fallback `pendingTranqueira` compatibility branch intentionally remains
# unchanged because old serialized matches do not have a source instance/uid.
old_live_reward = 'else if(played===6)summonImage(g,owner,"TRAMBUCO DO PIPOCO");'
if page.count(old_live_reward) < 1:
    raise SystemExit("live Tranqueira six-card reward: no match")
page = page.replace(
    old_live_reward,
    'else if(played===6)summonImage(g,owner,"TRAMBUCO DO PIPOCO",undefined,false,(x as any).chosenTranqueiraHostUid);',
    1,
)

helper_marker = '  return true\n };\n const endTurn=(urukTargetUid?:string)=>{'
helpers = '''  return true\n };\n function tranqueiraAttachmentChoice(state:Game,owner:0|1){\n  const p=state.players[owner],live=p.support.filter(card=>card.page===46),reserved=new Set(live.map(card=>(card as any).chosenTranqueiraHostUid).filter(Boolean));\n  for(const source of live){\n   if(Number((source as any).cardsPlayedAfterSelf||0)!==6||(source as any).chosenTranqueiraHostUid)continue;\n   const allowedIds=p.board.filter(unit=>hasFaction(unit,"Goblin")&&!reserved.has(unit.uid)&&!p.support.some(support=>support.page!==46&&support.slot===unit.slot)).map(unit=>unit.uid);\n   if(allowedIds.length>1)return{sourceUid:source.uid,allowedIds};\n  }\n  return null;\n }\n function finalizeLocalTurnState(g:Game,owner:0|1,urukTargetUid?:string){\n  resolveUrukLevelOne(g,owner,urukTargetUid);finishImageEffects(g,owner);const p=g.players[owner];p.nextElementEffects=[];p.elementChain=undefined;p.goblinTurnCardsPlayed=0;bankRemainingEnergy(p);g.players.forEach(entry=>[...entry.board,...entry.support,...(entry.terrain?[entry.terrain]:[])].forEach(unit=>{unit.temporaryAtk=0;unit.temporaryHp=0;unit.temporaryTags=[];unit.modifiers=(unit.modifiers||[]).filter(modifier=>modifier.duration!=="turn");unit.combatRestrictions=(unit.combatRestrictions||[]).filter(rule=>rule.duration!=="turn");unit.damageShields=(unit.damageShields||[]).filter(shield=>shield.duration!=="turn"&&shield.expires!=="turn")}));g.active=g.active===0?1:0;g.phase="manutencao";g.round++;g.turnDeadline=Date.now()+(roomInfo?.settings?.turnSeconds??120)*1000;log(g,`Turno ${g.round}: ${deckById(g.players[g.active].heroId).name}.`,"phase");\n }\n const endTurn=(urukTargetUid?:string)=>{'''
page = replace_once(page, helper_marker, helpers, "endTurn helper insertion")

old_end_tail = '''  if(mode==="online"&&!urukTargetUid){void runRulesCommand({type:"advancePhase"},0);return}\n  update(g=>{const owner=g.active;resolveUrukLevelOne(g,owner,urukTargetUid);finishImageEffects(g,owner);const p=g.players[owner];p.nextElementEffects=[];p.elementChain=undefined;p.goblinTurnCardsPlayed=0;bankRemainingEnergy(p);g.players.forEach(entry=>[...entry.board,...entry.support,...(entry.terrain?[entry.terrain]:[])].forEach(unit=>{unit.temporaryAtk=0;unit.temporaryHp=0;unit.temporaryTags=[];unit.modifiers=(unit.modifiers||[]).filter(modifier=>modifier.duration!=="turn");unit.combatRestrictions=(unit.combatRestrictions||[]).filter(rule=>rule.duration!=="turn");unit.damageShields=(unit.damageShields||[]).filter(shield=>shield.duration!=="turn"&&shield.expires!=="turn")}));g.active=g.active===0?1:0;g.phase="manutencao";g.round++;g.turnDeadline=Date.now()+(roomInfo?.settings?.turnSeconds??120)*1000;log(g,`Turno ${g.round}: ${deckById(g.players[g.active].heroId).name}.`,"phase")})'''
new_end_tail = '''  if(mode==="online"&&!urukTargetUid){void runRulesCommand({type:"advancePhase"},0);return}\n  if(!urukTargetUid&&game.active===0){const choice=tranqueiraAttachmentChoice(game,0);if(choice){setTargeting({kind:"tranqueira-attach",source:"TRANQUEIRA-MÁTICA · escolha o Goblin que receberá TRAMBUCO DO PIPOCO",sourceUid:choice.sourceUid,allowedIds:choice.allowedIds});return}}\n  update(g=>finalizeLocalTurnState(g,g.active,urukTargetUid))'''
page = replace_once(page, old_end_tail, new_end_tail, "local endTurn finalization")

old_apply = 'targetUnit=targetPlayer&&(targetPlayer.board.find(x=>x.uid===uid)||targetPlayer.support.find(x=>x.uid===uid)||(targetPlayer.terrain?.uid===uid?targetPlayer.terrain:undefined));if(t.kind==="elemental-optional")'
new_apply = '''targetUnit=targetPlayer&&(targetPlayer.board.find(x=>x.uid===uid)||targetPlayer.support.find(x=>x.uid===uid)||(targetPlayer.terrain?.uid===uid?targetPlayer.terrain:undefined));if(t.kind==="tranqueira-attach"){if(!t.sourceUid||!t.allowedIds?.includes(uid)||targetPlayer!==game.players[0]||!targetUnit||!hasFaction(targetUnit,"Goblin")){update(g=>log(g,"Escolha um Goblin aliado válido para receber o TRAMBUCO DO PIPOCO.","danger"));return}setTargeting(null);update(g=>{const source=g.players[0].support.find(card=>card.uid===t.sourceUid&&card.page===46);if(!source)return;(source as any).chosenTranqueiraHostUid=uid;const next=tranqueiraAttachmentChoice(g,0);if(next){queueMicrotask(()=>setTargeting({kind:"tranqueira-attach",source:"TRANQUEIRA-MÁTICA · escolha o Goblin que receberá TRAMBUCO DO PIPOCO",sourceUid:next.sourceUid,allowedIds:next.allowedIds}));return}finalizeLocalTurnState(g,0)});return}if(t.kind==="elemental-optional")'''
page = replace_once(page, old_apply, new_apply, "applyTarget Tranqueira branch")

old_target_lines = ''' const heroAbilityTargetIds=targeting?.kind==="gimble"&&game?game.players[0].board.filter(unit=>hasFaction(unit,"Dragão")&&unit.exhausted).map(unit=>unit.uid):undefined;\n const baseLocalTargetableCreatureIds=defenseChoice?defenseTargets:heroAbilityTargetIds;\n const allyTarget=(!!targeting&&["attach","elemental-optional","gimble","natureza","saymon-life","ngoro"].includes(targeting.kind))'''
new_target_lines = ''' const heroAbilityTargetIds=targeting?.kind==="gimble"&&game?game.players[0].board.filter(unit=>hasFaction(unit,"Dragão")&&unit.exhausted).map(unit=>unit.uid):undefined;\n const tranqueiraTargetIds=targeting?.kind==="tranqueira-attach"?targeting.allowedIds:undefined;\n const baseLocalTargetableCreatureIds=defenseChoice?defenseTargets:(tranqueiraTargetIds??heroAbilityTargetIds);\n const allyTarget=(!!targeting&&["attach","elemental-optional","gimble","natureza","saymon-life","ngoro","tranqueira-attach"].includes(targeting.kind))'''
page = replace_once(page, old_target_lines, new_target_lines, "local target highlighting")
page_path.write_text(page, encoding="utf-8")


# 4) Focused regressions.
test_path = Path("tests/tranqueira-trambuco-choice-regression.test.mjs")
test_path.write_text(r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileCard } from "../app/rules-engine/compiler.mjs";
import { explicitCardRules } from "../app/rules-engine/card-rules.mjs";
import { executeCommand } from "../app/rules-engine/engine.mjs";

const goblin = (uid, slot) => ({ uid, id: uid, name: `Goblin ${uid}`, type: "Criatura", cost: 1, atk: 1, hp: 3, damage: 0, tags: [], subtypes: ["Goblin"], abilities: [], modifiers: [], slot, exhausted: false, summoning: false, defenseUses: 0 });
const tranqueira = () => ({ ...compileCard({ page: 46, id: "p46", name: "TRANQUEIRA-MÁTICA ELETROSTÁTICA", type: "Feitiço", cost: 1, text: "", tags: [] }), uid: "tranqueira", slot: 0, enteredRound: 1, damage: 0, exhausted: false, summoning: false, modifiers: [], cardsPlayedAfterSelf: 6, remainUntilTurnEnd: true });
const trambuco = () => ({ ...compileCard({ page: 38, id: "p38", name: "TRAMBUCO DO PIPOCO", type: "Artefato", cost: 0, text: "", tags: ["Veloz"] }), imageCard: true });
const state = () => ({ active: 0, phase: "fim", round: 1, cardCatalog: [trambuco()], players: [0, 1].map(() => ({ heroId: "goblin", level: 1, life: 30, maxLife: 30, energy: 0, maxEnergy: 10, reserve: 0, deck: [], hand: [], board: [], support: [], terrain: null, grave: [], obscuro: [], extraDeck: [trambuco()], abilityUses: {}, turnCardsPlayed: 0, turnSpellsPlayed: 0 })) });

test("p46 six-card branch uses the canonical Trambuco name and Goblin attachment policy", () => {
  const turnEnd = explicitCardRules.p46.find((ability) => ability.trigger === "onTurnEnd");
  const branch = turnEnd.effects[0].branches.find((entry) => entry.min === 6 && entry.max === 6);
  const reward = branch.effects[0];
  assert.equal(reward.name, "TRAMBUCO DO PIPOCO");
  assert.equal(reward.autoAttachSubtype, "Goblin");
  assert.equal(reward.chooseAttachmentIfMultiple, true);
  assert.equal(reward.ignoreSupportPage, 46);
  assert.equal(reward.skipIfNoValidPlacement, true);
});

test("one valid Goblin receives Trambuco automatically", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0));
  game.players[0].support.push(tranqueira());
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.pendingDecision ?? null, null);
  const artifact = result.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact, "six-card reward should create the real artifact");
  assert.equal(artifact.name, "TRAMBUCO DO PIPOCO");
  assert.equal(artifact.attachedTo, "g1");
  assert.ok(result.players[0].grave.some((card) => card.page === 46));
});

test("two valid Goblins require the controller to choose the attachment target", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0), goblin("g2", 1));
  game.players[0].support.push(tranqueira());
  const waiting = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(waiting.pendingDecision?.kind, "targets");
  assert.equal(waiting.pendingDecision?.owner, 0);
  assert.deepEqual(new Set(waiting.pendingDecision?.targetSteps?.[0]?.allowedIds || []), new Set(["g1", "g2"]));
  assert.equal(waiting.players[0].support.some((card) => card.page === 38), false);

  const resolved = executeCommand(waiting, { type: "resolveDecision", owner: 0, targetIds: ["g2"] }).state;
  const artifact = resolved.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact);
  assert.equal(artifact.attachedTo, "g2");
  assert.ok(resolved.players[0].grave.some((card) => card.page === 46));
});

test("an occupied auxiliary slot removes that Goblin from the attachment choices", () => {
  const game = state();
  game.players[0].board.push(goblin("g1", 0), goblin("g2", 1));
  game.players[0].support.push(tranqueira(), { uid: "occupied", id: "occupied", page: 999, name: "Outra constante", type: "Encanto", slot: 1, tags: [], abilities: [] });
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.pendingDecision ?? null, null);
  const artifact = result.players[0].support.find((card) => card.page === 38);
  assert.ok(artifact);
  assert.equal(artifact.attachedTo, "g1");
});

test("zero valid Goblins skips the reward without locking end of turn", () => {
  const game = state();
  game.players[0].support.push(tranqueira());
  const result = executeCommand(game, { type: "advancePhase", owner: 0 }).state;
  assert.equal(result.pendingDecision ?? null, null);
  assert.equal(result.players[0].support.some((card) => card.page === 38), false);
  assert.ok(result.players[0].grave.some((card) => card.page === 46));
  assert.equal(result.active, 1);
  assert.equal(result.phase, "manutencao");
});

test("local bot UI asks for a Goblin when multiple hosts exist and honors the chosen uid", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /"tranqueira-attach"/);
  assert.match(page, /function tranqueiraAttachmentChoice\(state:Game,owner:0\|1\)/);
  assert.match(page, /allowedIds\.length>1/);
  assert.match(page, /chosenTranqueiraHostUid=uid/);
  assert.match(page, /summonImage\(g,owner,"TRAMBUCO DO PIPOCO",undefined,false,\(x as any\)\.chosenTranqueiraHostUid\)/);
  assert.match(page, /attachedToUid\?:string/);
});
''', encoding="utf-8")
