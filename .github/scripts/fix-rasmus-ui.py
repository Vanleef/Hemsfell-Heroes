from pathlib import Path
import json

def rep(path, old, new):
 p=Path(path); t=p.read_text(encoding='utf-8')
 if old not in t: raise SystemExit(f'pattern missing: {path}: {old[:90]}')
 p.write_text(t.replace(old,new,1),encoding='utf-8')

rep('app/page.tsx','rasmus:"Controle simultaneamente a quantidade indicada de Gatos."','rasmus:"Conte os Gatos em jogo nos campos dos dois jogadores; atinja simultaneamente a quantidade indicada."')
rep('app/page.tsx','rasmus:`Controle ${target} Gatos simultaneamente em seus campos.`,','rasmus:`Tenha ${target} Gatos simultaneamente em jogo, somando os campos dos dois jogadores.`,')
rep('app/page.tsx','const heroEvolutionProgress=(player:Player)=>{if(player.heroId==="uruk")return player.spellsPlayed||0;if(player.heroId==="gimble")return player.board.filter(card=>hasFaction(card,"Dragão")).length;if(player.heroId==="goblin")return player.turnCardsPlayed||0;if(player.heroId==="quarion")return new Set(player.board.map(unit=>cleanName(effectiveCreatureName(player,unit))).filter(Boolean)).size;if(player.heroId==="rasmus")return [...player.board,...player.support].filter(card=>hasFaction(card,"Gato")).length;if(player.heroId==="zayan")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].filter(card=>!card.text.trim()).length;if(player.heroId==="natureza")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].reduce((sum,card)=>sum+(card.markers||0),0);return player.heroXP};','const heroEvolutionProgress=(player:Player,allPlayers:Player[]=[player])=>{if(player.heroId==="uruk")return player.spellsPlayed||0;if(player.heroId==="gimble")return player.board.filter(card=>hasFaction(card,"Dragão")).length;if(player.heroId==="goblin")return player.turnCardsPlayed||0;if(player.heroId==="quarion")return new Set(player.board.map(unit=>cleanName(effectiveCreatureName(player,unit))).filter(Boolean)).size;if(player.heroId==="rasmus")return allPlayers.flatMap(candidate=>[...candidate.board,...candidate.support,...(candidate.terrain?[candidate.terrain]:[])]).filter(card=>hasFaction(card,"Gato")).length;if(player.heroId==="zayan")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].filter(card=>!card.text.trim()).length;if(player.heroId==="natureza")return [...player.board,...player.support,...(player.terrain?[player.terrain]:[])].reduce((sum,card)=>sum+(card.markers||0),0);return player.heroXP};')
rep('app/page.tsx','function PlayerHero({player,enemy=false,onLevel,canEvolveThisTurn=true,targetClass="",onTarget,onInspect}:{player:Player;enemy?:boolean;onLevel?:()=>void;canEvolveThisTurn?:boolean;targetClass?:string;onTarget?:()=>void;onInspect?:()=>void}){','function PlayerHero({player,allPlayers,enemy=false,onLevel,canEvolveThisTurn=true,targetClass="",onTarget,onInspect}:{player:Player;allPlayers?:Player[];enemy?:boolean;onLevel?:()=>void;canEvolveThisTurn?:boolean;targetClass?:string;onTarget?:()=>void;onInspect?:()=>void}){')
rep('app/page.tsx','progress=heroEvolutionProgress(player),progressReady=','progress=heroEvolutionProgress(player,allPlayers),progressReady=')
rep('app/page.tsx','<PlayerHero player={foe} enemy ','<PlayerHero player={foe} allPlayers={game.players} enemy ')
rep('app/page.tsx','<PlayerHero player={me} onLevel={levelUp}','<PlayerHero player={me} allPlayers={game.players} onLevel={levelUp}')
rep('app/page.tsx','heroEvolutionProgress(game.players[1])>=evolutionNeed','heroEvolutionProgress(game.players[1],game.players)>=evolutionNeed')
rep('app/page.tsx','progress=heroEvolutionProgress(p);if(p.level>=3','progress=heroEvolutionProgress(p,game.players);if(p.level>=3')

p=Path('app/cards.generated.json'); data=json.loads(p.read_text(encoding='utf-8')); hero=next(c for c in data if c.get('page')==211)
hero['text']=hero['text'].replace('Rasmus pode subir nível pela        5 Gatos → nível 2 quantidade de Gatos em jogo         7 Gatos → nível 3','Rasmus pode subir de nível pela quantidade total de Gatos em jogo nos campos dos dois jogadores: 5 Gatos → nível 2; 7 Gatos → nível 3.')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

Path('app/hero-inspector-fix.css').write_text('''/* Structured hero inspector: force every hero to follow the same normal-flow guide used by Rasmus. */
.inspector.card-focus-layer > div:has(.inspector-hero-guide){width:min(72rem,96vw)!important;max-height:94dvh!important;grid-template-columns:minmax(13rem,18rem) minmax(0,1fr)!important;align-items:start!important;overflow:hidden!important}
.inspector.card-focus-layer > div:has(.inspector-hero-guide)>:is(img,canvas){width:100%!important;max-width:18rem!important;height:auto!important;object-fit:contain!important}
.inspector.card-focus-layer aside:has(.inspector-hero-guide){min-width:0!important;height:min(82dvh,48rem)!important;overflow:hidden!important;display:block!important}
.inspector-hero-guide{margin:0!important;width:100%!important;height:100%!important;max-height:none!important;overflow:auto!important;padding-right:clamp(.15rem,.4vw,.35rem)!important}
.inspector-hero-guide .hero-guide{position:relative!important;display:block!important;width:100%!important;min-width:0!important;overflow:hidden!important}
.inspector-hero-guide .hero-guide>header,.inspector-hero-guide .hero-evolution-guide,.inspector-hero-guide .hero-abilities-guide{position:static!important;width:auto!important;height:auto!important;inset:auto!important;transform:none!important;float:none!important}
.inspector-hero-guide .hero-abilities-guide>div:last-child{display:grid!important;grid-template-columns:1fr!important;gap:clamp(.45rem,.8vh,.7rem)!important}
.inspector-hero-guide .hero-abilities-guide article{position:relative!important;inset:auto!important;transform:none!important;width:100%!important;min-width:0!important;display:grid!important;grid-template-columns:clamp(1.9rem,3vw,2.4rem) minmax(0,1fr)!important}
.inspector-hero-guide .hero-abilities-guide article>div,.inspector-hero-guide .hero-abilities-guide article p,.inspector-hero-guide .hero-abilities-guide article p>span{min-width:0!important;max-width:100%!important;white-space:normal!important;overflow-wrap:anywhere!important}
@media(max-width:720px){.inspector.card-focus-layer>div:has(.inspector-hero-guide){grid-template-columns:1fr!important;overflow:auto!important}.inspector.card-focus-layer>div:has(.inspector-hero-guide)>:is(img,canvas){width:min(12rem,55vw)!important;justify-self:center!important}.inspector.card-focus-layer aside:has(.inspector-hero-guide){height:auto!important;max-height:none!important}.inspector-hero-guide{height:auto!important;overflow:visible!important}}
''',encoding='utf-8')
lab=Path('app/lab.css'); t=lab.read_text(encoding='utf-8')
if '@import "./hero-inspector-fix.css";' not in t: t=t.replace('@import "./lab-interaction-responsive.css";\n','@import "./lab-interaction-responsive.css";\n@import "./hero-inspector-fix.css";\n')
lab.write_text(t,encoding='utf-8')
