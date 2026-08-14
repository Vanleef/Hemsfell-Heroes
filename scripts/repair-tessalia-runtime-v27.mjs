import { readFile, writeFile } from "node:fs/promises";

const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const replaceIfNeeded = (source, before, after, label) => {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`v27 patch point not found: ${label}`);
  return source.replace(before, after);
};

// Card data: conditional Duelist keywords must not be printed as permanently active tags.
{
  const path = "app/cards.generated.json";
  const cards = JSON.parse(await read(path));
  const female = cards.find((card) => card.page === 171);
  const male = cards.find((card) => card.page === 172);
  const axe = cards.find((card) => card.page === 155);
  if (!female || !male || !axe) throw new Error("v27 Tessalia cards not found");
  female.tags = (female.tags || []).filter((tag) => !/^barreira m[aá]gica$/i.test(String(tag)));
  male.tags = (male.tags || []).filter((tag) => !/^robusto$/i.test(String(tag)));
  axe.type = "Artefato";
  axe.text = "A criatura equipada recebe Indomável e +3 de Ofensividade.";
  await writeFile(path, JSON.stringify(cards, null, 2) + "\n");
}

// Machado Indomável is an attachment with a continuous +3 attack / Indomável bonus.
{
  const path = "app/rules-engine/card-rules.mjs";
  let source = await read(path);
  const anchor = '  p154: [ability("onAttachedCreatureTargeted", [effect("draw", { amount: 1 })]), ability("static", [effect("graveReplacement", { destination: "obscuro" })])],';
  const rule = '  p155: [ability("static", [effect("attachedStats", { attack: 3, health: 0 }), effect("attachedKeyword", { keyword: "Indomável" })])],';
  if (!source.includes(rule)) {
    if (!source.includes(anchor)) throw new Error("v27 p155 card-rule anchor not found");
    source = source.replace(anchor, `${anchor}\n${rule}`);
  }
  await writeFile(path, source);
}

// Canonical engine: support auras are counted once; Duelists gain BOTH conditional keywords while paired.
{
  const path = "app/rules-engine/engine.mjs";
  let source = await read(path);
  source = source.replace(
    '.map((value)=>String(value).replace(/^(?:attachment|support):[^:]+:/,""))',
    '.map((value)=>String(value).replace(/^(?:attachment|support|duelist):[^:]+:/,""))'
  );
  const oldRefresh = 'function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(`support:${sourceId}:${aura.keyword}`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId});}}}}});}';
  const newRefresh = 'function refreshSupportAuras(state){for(const entry of state.players)for(const unit of entry.board||[]){unit.grantedKeywords=(unit.grantedKeywords||[]).filter(value=>!String(value).startsWith("support:")&&!String(value).startsWith("duelist:"));unit.modifiers=(unit.modifiers||[]).filter(value=>value.duration!=="support");}state.players.forEach((entry)=>{for(const source of entry.board||[]){if(source.suffocated)continue;const sourceId=source.uid||source.id;for(const aura of (source.staticModifiers||[]).filter(value=>value.type==="supportAura")){for(const target of entry.board.filter(unit=>!unit.suffocated&&(unit.uid||unit.id)!==sourceId&&Math.abs((unit.slot??-10)-(source.slot??10))===1)){if(aura.keyword){target.grantedKeywords||=[];target.grantedKeywords.push(`support:${sourceId}:${aura.keyword}`);}if(aura.attack||aura.health){target.modifiers||=[];target.modifiers.push({attack:aura.attack||0,health:aura.health||0,duration:"support",sourceId});}}}}const female=entry.board.find(unit=>unit.page===171&&!unit.suffocated),male=entry.board.find(unit=>unit.page===172&&!unit.suffocated);if(female&&male){for(const target of [female,male]){target.grantedKeywords||=[];target.grantedKeywords.push("duelist:pair:Barreira Mágica","duelist:pair:Robusto");}}});}';
  source = replaceIfNeeded(source, oldRefresh, newRefresh, "refreshSupportAuras / Duelist pair");
  await writeFile(path, source);
}

// Effect-level keyword checks also need to understand the dynamic Duelist prefix (notably Robusto damage reduction).
{
  const path = "app/rules-engine/effects.mjs";
  let source = await read(path);
  source = source.replace(
    '.map((value) => String(value).replace(/^(?:attachment|support):[^:]+:/, ""))',
    '.map((value) => String(value).replace(/^(?:attachment|support|duelist):[^:]+:/, ""))'
  );
  await writeFile(path, source);
}

// Client/legacy runtime fixes. This path is still used by a number of card/combat interactions.
{
  const path = "app/page.tsx";
  let source = await read(path);

  const oldSupport = 'const supportNumbers=(p:Player|undefined,u:Unit)=>{if(!p||u.suffocated)return{atk:0,hp:0};let atk=0,hp=0;for(const source of [...p.board,...p.support]){if(source.uid===u.uid||source.suffocated||Math.abs(source.slot-u.slot)!==1||!/\\bSuporte\\b/i.test(source.text)&&!source.tags.some(tag=>cleanName(tag)==="suporte"))continue;const match=source.text.match(/Suporte\\s*:?\\s*([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/i);if(match){atk+=Number(match[1]);hp+=Number(match[2])}}return{atk,hp}};';
  const newSupport = 'const supportNumbers=(p:Player|undefined,u:Unit)=>{if(!p||u.suffocated)return{atk:0,hp:0};let atk=0,hp=0;for(const source of [...p.board,...p.support]){if(source.uid===u.uid||source.suffocated||Math.abs(source.slot-u.slot)!==1||!/\\bSuporte\\b/i.test(source.text)&&!source.tags.some(tag=>cleanName(tag)==="suporte"))continue;if((u.modifiers||[]).some(modifier=>modifier.duration==="support"&&modifier.sourceId===source.uid))continue;const match=source.text.match(/Suporte\\s*:?\\s*([+-]?\\d+)\\s*\\/\\s*([+-]?\\d+)/i);if(match){atk+=Number(match[1]);hp+=Number(match[2])}}return{atk,hp}};';
  source = replaceIfNeeded(source, oldSupport, newSupport, "client support double count");

  const oldKeyword = 'const hasKeyword=(p:Player|undefined,u:Unit,keyword:string)=>{if(u.suffocated)return false;const wanted=cleanName(keyword),matches=(value:string)=>cleanName(value).includes(wanted);if(wanted==="barreira magica"&&u.page===171&&!p?.board.some(card=>card.page===172))return false;if(wanted==="robusto"&&u.page===172&&!p?.board.some(card=>card.page===171))return false;if(wanted==="atropelar"&&isCommander(p,u)&&p!.level>=2)return true;if(u.tags.some(tag=>cleanName(tag)===wanted)||u.temporaryTags?.some(tag=>cleanName(tag)===wanted)||u.grantedKeywords?.some(matches)||matches(u.text))return true;if(!p)return false;return p.support.some(source=>!source.suffocated&&(source.attachedTo===u.uid||Math.abs(source.slot-u.slot)===1&&/\\bSuporte\\b/i.test(source.text))&&matches(source.text))||!!p.terrain&&!p.terrain.suffocated&&matches(p.terrain.text)};';
  const newKeyword = 'const hasKeyword=(p:Player|undefined,u:Unit,keyword:string)=>{if(u.suffocated)return false;const wanted=cleanName(keyword),matches=(value:string)=>cleanName(value).includes(wanted),pairedDuelist=u.page===171?p?.board.some(card=>card.page===172&&!card.suffocated):u.page===172?p?.board.some(card=>card.page===171&&!card.suffocated):false;if((u.page===171||u.page===172)&&(wanted==="barreira magica"||wanted==="robusto"))return !!pairedDuelist;if(wanted==="atropelar"&&isCommander(p,u)&&p!.level>=2)return true;if(u.tags.some(tag=>cleanName(tag)===wanted)||u.temporaryTags?.some(tag=>cleanName(tag)===wanted)||u.grantedKeywords?.some(matches)||matches(u.text))return true;if(!p)return false;return p.support.some(source=>!source.suffocated&&(source.attachedTo===u.uid||Math.abs(source.slot-u.slot)===1&&/\\bSuporte\\b/i.test(source.text))&&matches(source.text))||!!p.terrain&&!p.terrain.suffocated&&matches(p.terrain.text)};';
  source = replaceIfNeeded(source, oldKeyword, newKeyword, "client Duelist pair keywords");

  const oldUpdate = ' const update=(fn:(g:Game)=>void)=>setGame(old=>{if(!old)return old;const g=structuredClone(old),before:[number,number]=[g.players[0].life,g.players[1].life];fn(g);resolveLifeLossTriggers(g,before);removeDead(g,(owner,card)=>resolveText(g,owner,card));g.players.forEach((p,i)=>{if(p.life<=0)g.winner=i===0?1:0});queueMicrotask(()=>syncOnlineGame(g));return g});';
  const newUpdate = ' const update=(fn:(g:Game)=>void)=>setGame(old=>{if(!old)return old;const g=structuredClone(old),before:[number,number]=[g.players[0].life,g.players[1].life],cruelDamageBefore=new Map(g.players.flatMap(player=>player.board.filter(unit=>unit.page===165).map(unit=>[unit.uid,Number(unit.damage||0)] as const)));fn(g);g.players.forEach(player=>player.board.filter(unit=>unit.page===165&&!unit.suffocated).forEach(unit=>{if(Number(unit.damage||0)>Number(cruelDamageBefore.get(unit.uid)||0)){unit.modifiers||=[];unit.modifiers.push({attack:1,health:0,duration:"permanent",sourceId:`escudeiro-cruel:${unit.uid}:${g.events}`});log(g,`${unit.name} recebeu +1 de Ofensividade permanente após sofrer dano.`,"effect")}}));resolveLifeLossTriggers(g,before);removeDead(g,(owner,card)=>resolveText(g,owner,card));g.players.forEach((p,i)=>{if(p.life<=0)g.winner=i===0?1:0});queueMicrotask(()=>syncOnlineGame(g));return g});';
  source = replaceIfNeeded(source, oldUpdate, newUpdate, "legacy Escudeiro Cruel damage trigger");

  const oldIcon = '{lastBreath&&<i className="card-frame-last-breath" title="Último Suspiro: ativa quando esta criatura é destruída.">☠</i>}{markerCount>0&&<i className="card-frame-marker" title={`${markerCount} marcador(es)`}>+{markerCount}</i>}';
  const newIcon = '{lastBreath&&<i className="card-frame-last-breath" title="Último Suspiro: ativa quando esta criatura é destruída.">☠</i>}{tessaliaCommander&&<i className="card-frame-commander" title="Comandante: sua criatura central é o Comandante." aria-label="Comandante: sua criatura central é o Comandante.">♛</i>}{markerCount>0&&<i className="card-frame-marker" title={`${markerCount} marcador(es)`}>+{markerCount}</i>}';
  source = replaceIfNeeded(source, oldIcon, newIcon, "Tessalia commander status icon");

  await writeFile(path, source);
}

// Commander visuals stay in a dedicated v27 stylesheet; v18/v20 remain untouched.
{
  const cssPath = "app/ui-tessalia-runtime-v27.css";
  const css = `/* Tessalia/runtime v27 — deliberately isolated from ui-readability-v18 and ui-board-visual-polish-v20. */\n.screen-game .field-slot.creature-slot.commander-slot{border-color:#f0444f!important;background:radial-gradient(circle at 50% 35%,rgba(191,35,47,.42),rgba(64,6,13,.72) 70%)!important;box-shadow:inset 0 0 1.7rem rgba(239,49,63,.34),0 0 .8rem rgba(222,35,48,.34)!important}\n.screen-game .field-slot.creature-slot.commander-slot::before{content:none!important;display:none!important}\n.screen-game .field-slot.creature-slot.commander-slot:has(.original-card){border-color:#ff5a61!important;box-shadow:inset 0 0 2rem rgba(255,55,69,.4),0 0 1rem rgba(230,36,50,.48)!important}\n.screen-game .card-frame-commander{position:absolute;z-index:36;top:clamp(-.32rem,-.24cqw,-.18rem);right:clamp(.12rem,.32cqw,.34rem);width:clamp(1rem,1.45cqw,1.35rem);height:clamp(1rem,1.45cqw,1.35rem);display:grid;place-items:center;border:1px solid rgba(255,111,116,.92);border-radius:50%;background:radial-gradient(circle,#a91f2c,#4a0710);color:#ff7379;font-style:normal;font-size:clamp(.62rem,.9cqw,.9rem);line-height:1;box-shadow:0 0 .65rem rgba(255,48,60,.58);cursor:help}\n`;
  await writeFile(cssPath, css);
  const globalsPath = "app/globals.css";
  let globals = await read(globalsPath);
  const importLine = '@import "./ui-tessalia-runtime-v27.css";';
  if (!globals.includes(importLine)) globals += `\n${importLine}\n`;
  await writeFile(globalsPath, globals);
}

console.log("v27 applied: support bonuses single-counted; Machado Indomavel fixed; Escudeiro Cruel legacy trigger fixed; Tessalia Commander icon/slot updated; Duelist pair synchronized.");
