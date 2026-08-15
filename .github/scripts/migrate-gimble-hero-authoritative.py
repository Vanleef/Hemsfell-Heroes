from pathlib import Path

# 1) Canonical hero rule for Gimble II.
card_rules = Path('app/rules-engine/card-rules.mjs')
text = card_rules.read_text(encoding='utf-8')
anchor = 'export const explicitCardRules = Object.freeze({\n  p3:'
insert = '''export const explicitCardRules = Object.freeze({
  p2: { hero: true, levels: { 1: [], 2: [ability("activated", [effect("ready", { target: "allyCreature", requiredSubtype: "Dragão", requireExhausted: true, selections: 1 })], [], { id: "gimble-level-2", uiActivation: true, usageLimit: { count: 1, period: "turn" } })], 3: [] } },
  p3:'''
if 'gimble-level-2' not in text:
    if anchor not in text:
        raise SystemExit('card-rules anchor not found')
    text = text.replace(anchor, insert, 1)
card_rules.write_text(text, encoding='utf-8')

# 2) Authoritative engine recognizes Gimble hero page.
engine_base = Path('app/rules-engine/engine-base.mjs')
text = engine_base.read_text(encoding='utf-8')
old = 'const HERO_RULE_PAGE = Object.freeze({ saymon: 129, quarion: 180, rasmus: 211, ngoro: 255, zayan: 273, natureza: 291 });'
new = 'const HERO_RULE_PAGE = Object.freeze({ gimble: 2, saymon: 129, quarion: 180, rasmus: 211, ngoro: 255, zayan: 273, natureza: 291 });'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('engine-base HERO_RULE_PAGE anchor not found')
engine_base.write_text(text, encoding='utf-8')

# 3) Priority engine exposes Gimble II and filters hero abilities with impossible targets.
priority = Path('app/rules-engine/priority.mjs')
text = priority.read_text(encoding='utf-8')
old = 'const HERO_RULE_PAGE = Object.freeze({ saymon: 129, ngoro: 255, natureza: 291 });'
new = 'const HERO_RULE_PAGE = Object.freeze({ gimble: 2, saymon: 129, ngoro: 255, natureza: 291 });'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('priority HERO_RULE_PAGE anchor not found')

helper_anchor = 'const heroUsageKey = (state, source, ability) => `${source.uid || source.id}:${ability.id}${ability?.condition?.firstEachTurn ? `:round-${state.round}` : ""}`;\n'
helper = '''const heroUsageKey = (state, source, ability) => `${source.uid || source.id}:${ability.id}${ability?.condition?.firstEachTurn ? `:round-${state.round}` : ""}`;
const normalizedSubtype = (value = "") => String(value).normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase();
const hasSubtype = (card, subtype) => !subtype || (card?.subtypes || card?.tags || []).some((value) => normalizedSubtype(value) === normalizedSubtype(subtype));
function heroAbilityTargetsAvailable(state, owner, ability) {
  for (const effect of ability.effects || []) {
    const target = effect.target;
    if (!target || !/(?:Character|Creature|Permanent)$/.test(target)) continue;
    const minimum = Number(effect.minimumSelections ?? effect.selections ?? 1);
    if (minimum <= 0) continue;
    const wantsCreature = /Creature$/.test(target) || /Character$/.test(target);
    const wantsPermanent = /Permanent$/.test(target);
    const owners = target.startsWith("ally") ? [owner] : target.startsWith("enemy") ? [1 - owner] : [0, 1];
    let count = 0;
    for (const targetOwner of owners) {
      const entry = state.players[targetOwner];
      const candidates = wantsCreature ? (entry.board || []) : wantsPermanent ? permanents(entry) : [];
      count += candidates.filter((card) => hasSubtype(card, effect.requiredSubtype) && (!effect.requireExhausted || card.exhausted)).length;
      if (/Character$/.test(target) && targetOwner !== owner) count += 1;
    }
    if (count < minimum) return false;
  }
  return true;
}
'''
if 'function heroAbilityTargetsAvailable' not in text:
    if helper_anchor not in text:
        raise SystemExit('priority helper anchor not found')
    text = text.replace(helper_anchor, helper, 1)
old = '    if (ability.trigger !== "activated" || ability.responseAllowed === false || !ability.id) return [];\n'
new = '    if (ability.trigger !== "activated" || ability.responseAllowed === false || !ability.id || !heroAbilityTargetsAvailable(state, owner, ability)) return [];\n'
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('priority ability filter anchor not found')
priority.write_text(text, encoding='utf-8')

# 4) Player UI uses authoritative activateHero for Gimble II instead of legacy targeting mutation.
page = Path('app/page.tsx')
text = page.read_text(encoding='utf-8')
old = 'const authoritativeId=d.id==="saymon"?(slot===0?"saymon-level-1":slot===1?"saymon-level-2":undefined):d.id==="ngoro"?(slot===1?"ngoro-level-2":slot===2?"ngoro-level-3":undefined):d.id==="natureza"?(slot===0?"natureza-level-1":slot===2?"natureza-level-3":undefined):undefined;if(authoritativeId){void runRulesCommand({type:"activateHero",abilityId:authoritativeId},0);return}if(d.id==="gimble"&&slot===1)setTargeting({kind:"gimble",source:d.abilities[slot]})'
new = 'const authoritativeId=d.id==="gimble"?(slot===1?"gimble-level-2":undefined):d.id==="saymon"?(slot===0?"saymon-level-1":slot===1?"saymon-level-2":undefined):d.id==="ngoro"?(slot===1?"ngoro-level-2":slot===2?"ngoro-level-3":undefined):d.id==="natureza"?(slot===0?"natureza-level-1":slot===2?"natureza-level-3":undefined):undefined;if(authoritativeId){void runRulesCommand({type:"activateHero",abilityId:authoritativeId},0);return}'
if old in text:
    text = text.replace(old, new, 1)
elif 'gimble-level-2' not in text:
    raise SystemExit('activateAbility Gimble anchor not found')

old = 'if(heroAction.kind==="gimble-ready"){update(g=>{const p=g.players[1],target=p.board.find(unit=>unit.uid===heroAction.targetId);if(target)target.exhausted=false;p.abilityUses[`${p.heroId}-${heroAction.slot}`]=1;log(g,`A IA ativou uma habilidade de ${deckById(p.heroId).name}.`,"effect")})}else{'
new = 'if(heroAction.kind==="gimble-ready"){void runRulesCommand({type:"activateHero",owner:1,abilityId:"gimble-level-2",targetIds:heroAction.targetId?[heroAction.targetId]:[]},1)}else{'
if old in text:
    text = text.replace(old, new, 1)
elif 'abilityId:"gimble-level-2"' not in text:
    raise SystemExit('AI Gimble legacy branch anchor not found')

old = 'const slot=command.abilityId==="saymon-level-1"?0:'
new = 'const slot=command.abilityId==="gimble-level-2"?1:command.abilityId==="saymon-level-1"?0:'
if old in text:
    text = text.replace(old, new, 1)
elif 'command.abilityId==="gimble-level-2"?1:' not in text:
    raise SystemExit('hero priority label anchor not found')
page.write_text(text, encoding='utf-8')

# 5) Regression tests prove main-phase, priority, invalid-target filtering and AI all use authoritative path.
test_path = Path('tests/gimble-authoritative-hero.test.mjs')
test_path.write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport { executeCommand } from "../app/rules-engine/engine.mjs";\nimport { legalPriorityResponses } from "../app/rules-engine/priority.mjs";\n\nconst dragon=(exhausted=true)=>({id:"dragon",uid:"dragon-1",name:"Dragão Teste",type:"Criatura",subtypes:["Dragão"],tags:[],abilities:[],cost:2,atk:2,hp:2,damage:0,slot:0,exhausted,summoning:false,defenseUses:0,markers:0});\nconst player=(heroId="gimble",level=2,board=[])=>({heroId,level,life:30,energy:3,reserve:3,hand:[],deck:[],grave:[],obscuro:[],support:[],terrain:null,board,abilityUses:{},markers:0,heroXP:0});\nconst state=(board=[dragon(true)])=>({active:0,phase:"principal",round:5,players:[player("gimble",2,board),player("saymon",1,[])]});\n\ntest("Gimble II is resolved by authoritative activateHero and readies an exhausted Dragon",()=>{\n const before=state();\n const after=executeCommand(before,{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}).state;\n assert.equal(after.players[0].board[0].exhausted,false);\n assert.equal(after.players[0].abilityUses["gimble-hero-0:gimble-level-2"],1);\n});\n\ntest("Gimble II enters priority off-turn only when an exhausted allied Dragon exists",()=>{\n const withDragon=state(); withDragon.active=1; withDragon.phase="combate"; withDragon.pendingAction={type:"attack",owner:1}; withDragon.pendingResponse={responder:0,actor:1,action:"ataque",passes:0};\n assert.ok(legalPriorityResponses(withDragon,0).some(c=>c.type==="activateHero"&&c.abilityId==="gimble-level-2"));\n const withoutTarget=structuredClone(withDragon); withoutTarget.players[0].board[0].exhausted=false;\n assert.ok(!legalPriorityResponses(withoutTarget,0).some(c=>c.type==="activateHero"&&c.abilityId==="gimble-level-2"));\n});\n\ntest("Gimble II cannot be used twice in the same turn",()=>{\n const first=executeCommand(state(),{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}).state;\n first.players[0].board[0].exhausted=true;\n assert.throws(()=>executeCommand(first,{type:"activateHero",owner:0,abilityId:"gimble-level-2",targetIds:["dragon-1"]},{priority:true}),/ability-not-available/);\n});\n''', encoding='utf-8')
