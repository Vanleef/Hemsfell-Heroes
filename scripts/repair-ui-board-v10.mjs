import { readFile, writeFile } from "node:fs/promises";

const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const read = async (path) => normalize(await readFile(path, "utf8"));
const write = async (path, value) => writeFile(path, normalize(value));

{
  const path = "app/globals.css";
  let source = await read(path);
  const importLine = '@import "./ui-board-polish-v10.css";';
  if (!source.includes(importLine)) {
    const anchor = '@import "./ui-board-polish-v9.css";';
    if (!source.includes(anchor)) throw new Error("Could not locate v9 import in globals.css.");
    source = source.replace(anchor, `${anchor}\n${importLine}`);
    await write(path, source);
  }
}

{
  const path = "app/page.tsx";
  let source = await read(path);

  if (!source.includes('inspectable=true')) {
    source = source.replace(
      'function OriginalCard({card,controller,small=false,disabled=false,selected=false,targetClass="",activeEffect="",priority=false,draggable=false,onDragStart,onDragEnd,onClick,onActivate,activationDisabled=false}:{card:CardDef|Unit;controller?:Player;small?:boolean;disabled?:boolean;selected?:boolean;targetClass?:string;activeEffect?:string;priority?:boolean;draggable?:boolean;onDragStart?:(e:React.DragEvent)=>void;onDragEnd?:()=>void;onClick?:()=>void;onActivate?:()=>void;activationDisabled?:boolean}){',
      'function OriginalCard({card,controller,small=false,disabled=false,selected=false,targetClass="",activeEffect="",priority=false,draggable=false,onDragStart,onDragEnd,onClick,onActivate,activationDisabled=false,inspectable=true}:{card:CardDef|Unit;controller?:Player;small?:boolean;disabled?:boolean;selected?:boolean;targetClass?:string;activeEffect?:string;priority?:boolean;draggable?:boolean;onDragStart?:(e:React.DragEvent)=>void;onDragEnd?:()=>void;onClick?:()=>void;onActivate?:()=>void;activationDisabled?:boolean;inspectable?:boolean}){'
    );
  }

  const v9Click = 'onClick={event=>{event.stopPropagation();const interactionClick=!!onClick&&!!targetClass.trim();if(interactionClick){onClick?.();return}requestCardInspection(card)}} aria-label={displayName}';
  const v10Click = 'onClick={event=>{event.stopPropagation();const interactionClick=!!onClick&&(!inspectable||!!targetClass.trim());if(interactionClick){onClick?.();return}if(inspectable)requestCardInspection(card)}} aria-label={displayName}';
  const semanticV10Click = source.includes('!inspectable||!!targetClass.trim()') && source.includes('if(inspectable)requestCardInspection(card)');
  if (!source.includes(v10Click) && !semanticV10Click) {
    if (!source.includes(v9Click)) throw new Error("Could not locate v9 OriginalCard click behavior.");
    source = source.replace(v9Click, v10Click);
  }

  source = source
    .replace(/<OriginalCard card=\{card\} small selected=\{engineTargetSelection\.includes\(id\)\} onClick=/g, '<OriginalCard card={card} small inspectable={false} selected={engineTargetSelection.includes(id)} onClick=')
    .replace(/<OriginalCard card=\{card\} small onClick=\{\(\)=>selectForcedAttack/g, '<OriginalCard card={card} small inspectable={false} onClick={()=>selectForcedAttack')
    .replace(/<OriginalCard card=\{card\} small selected=\{engineTargetSelection\.includes\(card\.uid\)\} onClick=/g, '<OriginalCard card={card} small inspectable={false} selected={engineTargetSelection.includes(card.uid)} onClick=')
    .replace(/<OriginalCard card=\{card\} small onClick=\{\(\)=>void runRulesCommand/g, '<OriginalCard card={card} small inspectable={false} onClick={()=>void runRulesCommand')
    .replace(/<OriginalCard card=\{card\} small onClick=\{\(\)=>resolveChoiceTarget/g, '<OriginalCard card={card} small inspectable={false} onClick={()=>resolveChoiceTarget')
    .replace(/<OriginalCard key=\{card\.id\} card=\{card\} small onClick=\{\(\)=>onInspect\(card\)\}\/?>/g, '<OriginalCard key={card.id} card={card} small inspectable={false}/>')
    .replace(/<OriginalCard card=\{card\} small selected=\{chosen\} onClick=\{\(\)=>toggle\(card\)\}\/?>/g, '<OriginalCard card={card} small inspectable={false} selected={chosen} onClick={()=>toggle(card)}/>')
    .replace(/<OriginalCard card=\{card\} small activeEffect="RESPOSTA ACELERADA"/g, '<OriginalCard card={card} small inspectable={false} activeEffect="RESPOSTA ACELERADA"')
    .replace(/<OriginalCard card=\{card\} small disabled\/?>/g, '<OriginalCard card={card} small inspectable={false} disabled/>');

  source = source.replace(
    '<OriginalCard key={card.id} card={card} small onClick={()=>setShowInspector(card)}/>',
    '<OriginalCard key={card.id} card={card} small inspectable={false}/>'
  );

  source = source.replace(
    'function ExtraDeckModal({title,cards,onClose,onInspect}:{title:string;cards:CardDef[];onClose:()=>void;onInspect:(card:CardDef)=>void}){',
    'function ExtraDeckModal({title,cards,onClose}:{title:string;cards:CardDef[];onClose:()=>void}){'
  );
  source = source.replace(
    '<ExtraDeckModal title={extraView.title} cards={extraView.cards} onClose={()=>setExtraView(null)} onInspect={setShowInspector}/>',
    '<ExtraDeckModal title={extraView.title} cards={extraView.cards} onClose={()=>setExtraView(null)}/>'
  );

  {
    const marker = 'function HeroAbilities';
    const start = source.indexOf(marker);
    const end = start >= 0 ? source.indexOf('\nfunction ResourceSummary', start) : -1;
    if (start < 0 || end < 0) throw new Error("Could not locate HeroAbilities boundaries for v10.");
    const replacement = `function HeroAbilities({player,enemy=false,onAbility,interactionEnabled=true}:{player:Player;enemy?:boolean;onAbility?:(slot:number)=>void;interactionEnabled?:boolean}){
 const d=deckById(player.heroId);
 return <aside className={\`hero-abilities hero-command-bar \${enemy?"enemy":""}\`} style={{"--deck":d.color} as React.CSSProperties} aria-label={\`Habilidades de \${heroDisplayName(player.heroId)}\`}>
  <header><b>Poderes</b><span>Nv. {player.level}</span></header>
  {d.abilities.map((ability,slot)=>{
   const active=isActiveAbility(d.id,slot),key=\`\${d.id}-\${slot}\`,locked=slot+1>player.level,used=!!player.abilityUses[key];
   const noResource=d.id==="saymon"&&(slot===0||slot===1)?player.life<=2:d.id==="ngoro"&&slot===2?player.heroXP<3:false;
   const noValidTarget=d.id==="gimble"&&slot===1?!player.board.some(card=>hasFaction(card,"Dragão")&&card.exhausted):false;
   const unavailable=enemy||locked||used||noResource||noValidTarget||!interactionEnabled;
   const clickable=active&&!unavailable;
   const stateClass=locked?"is-locked":active?(clickable?"is-active is-available":"is-active is-unavailable"):"is-passive";
   const action=d.id==="saymon"?"Pagar 2 de vida":d.id==="ngoro"?"Gastar 3 Pistas":"Ativar";
   const title=locked?\`Habilidade liberada no nível \${slot+1}.\`:active?(used?"Habilidade já usada neste turno.":noResource?"Recursos insuficientes.":noValidTarget?"Não há alvo válido.":!interactionEnabled?"Aguarde a ação atual terminar.":\`\${action}: \${ability}\`):"Habilidade passiva; resolve automaticamente.";
   return <button type="button" className={\`ability hero-ability-chip \${stateClass}\`} key={ability} disabled={!clickable} onClick={()=>{if(clickable)onAbility?.(slot)}} title={title} aria-label={\`\${active?"Ativa":"Passiva"}: \${ability}\`}><i aria-hidden="true">{slot+1}</i><span><b>{active?"ATIVA":"PASSIVA"}</b><p>{ability.replace(/^[IVX]+ · /,"")}</p></span></button>
  })}
 </aside>
}
`;
    source = source.slice(0, start) + replacement + source.slice(end);
  }

  source = source.replace(
    '<HeroAbilities player={me} onAbility={activateAbility}/>',
    '<HeroAbilities player={me} onAbility={activateAbility} interactionEnabled={game.active===0&&!priorityLocked&&!combatAction&&!responseWindow&&!game.pendingDecision}/>'
  );

  if (!source.includes('const heroAbilityTargetIds=')) {
    source = source.replace(
      'const defenseTargets=defenseChoice&&game?legalDefenders(game.players[1].board.find(unit=>unit.uid===combatAction!.attackerUid)!,game.players[1],game.players[0]).map(unit=>unit.uid):undefined;',
      'const defenseTargets=defenseChoice&&game?legalDefenders(game.players[1].board.find(unit=>unit.uid===combatAction!.attackerUid)!,game.players[1],game.players[0]).map(unit=>unit.uid):undefined;\n const heroAbilityTargetIds=targeting?.kind==="gimble"&&game?game.players[0].board.filter(unit=>hasFaction(unit,"Dragão")&&unit.exhausted).map(unit=>unit.uid):undefined;\n const localTargetableCreatureIds=defenseChoice?defenseTargets:heroAbilityTargetIds;'
    );
  }
  source = source.replace('targetableCreatureIds={defenseTargets}', 'targetableCreatureIds={localTargetableCreatureIds}');
  source = source.replace('const u=p.board.find(x=>x.uid===uid&&hasFaction(x,"Dragão"));if(!u)return;u.exhausted=false;', 'const u=p.board.find(x=>x.uid===uid&&hasFaction(x,"Dragão")&&x.exhausted);if(!u)return;u.exhausted=false;');

  await write(path, source);
}

console.log("Responsive v10 UI contexts, hero abilities and targeting applied.");
