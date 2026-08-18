import { executeCommand } from "./engine.mjs";

const fold = (value = "") => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const now = () => globalThis.performance?.now?.() ?? Date.now();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cardId = (card) => card?.uid || card?.id;
const permanents = (player) => [...(player?.board || []), ...(player?.support || []), ...(player?.terrain ? [player.terrain] : [])];
const visibleTo = (card, viewer) => !!card?.revealed || (card?.revealedTo || []).includes(viewer);

const CONFIG = Object.freeze({
  Easy: { id:"Easy", cardBudget:1, responseBias:.25, attackBias:.68, particleCount:6, runtimeIterations:0, runtimeMs:0, rolloutDepth:1, errorRate:.28, noise:.22 },
  Normal: { id:"Normal", cardBudget:2, responseBias:.55, attackBias:.88, particleCount:16, runtimeIterations:12, runtimeMs:4, rolloutDepth:2, errorRate:.10, noise:.09 },
  Hard: { id:"Hard", cardBudget:3, responseBias:.86, attackBias:.97, particleCount:32, runtimeIterations:28, runtimeMs:8, rolloutDepth:3, errorRate:.035, noise:.035 },
  Expert: { id:"Expert", cardBudget:4, responseBias:.96, attackBias:1, particleCount:48, runtimeIterations:52, runtimeMs:13, rolloutDepth:4, errorRate:.012, noise:.015 },
  Master: { id:"Master", cardBudget:5, responseBias:1, attackBias:1, particleCount:72, runtimeIterations:84, runtimeMs:18, rolloutDepth:5, errorRate:.003, noise:.005 },
});

export function normalizeCompetitiveDifficulty(value = "Normal") {
  const key = fold(value);
  if (key === "easy" || key === "facil") return "Easy";
  if (key === "hard" || key === "dificil") return "Hard";
  if (key === "expert") return "Expert";
  if (key === "master") return "Master";
  return "Normal";
}

export function effectiveAIDifficulty(requested = "Normal") {
  const override = typeof globalThis !== "undefined" ? globalThis.__HEMSFELL_AI_DIFFICULTY__ : undefined;
  return normalizeCompetitiveDifficulty(override || requested);
}

export function competitiveDifficultyProfile(requested = "Normal") {
  return CONFIG[effectiveAIDifficulty(requested)];
}

export function legacyDifficulty(requested = "Normal") {
  const difficulty = effectiveAIDifficulty(requested);
  return difficulty === "Easy" ? "Fácil" : difficulty === "Normal" ? "Normal" : "Difícil";
}

const personalityForHero = (heroId) => ({
  goblin:"aggro", uruk:"combo", tifon:"control", saymon:"midrange", tessalia:"midrange", quarion:"combo",
  rasmus:"combo", ngoro:"control", zayan:"tempo", natureza:"combo", gimble:"midrange",
}[heroId] || "midrange");

function adaptivePersonality(state, owner, difficulty) {
  const base = personalityForHero(state.players?.[owner]?.heroId);
  if (difficulty !== "Master") return base;
  const self = state.players[owner], foe = state.players[1-owner];
  const ready = (self.board || []).filter(unit => !unit.exhausted && !unit.summoning && !unit.stunned).reduce((sum, unit) => sum + attack(unit), 0);
  if (ready >= Number(foe.life || 30) || foe.life <= 7) return "aggro";
  if (self.life <= 10 || self.board.length + self.support.length < foe.board.length + foe.support.length) return "control";
  if (self.reserve >= 2 && self.hand.some(card => /acelerado|instant/.test(fold(`${card.text} ${(card.tags||[]).join(" ")}`)))) return "tempo";
  return base;
}

const PERSONALITY = Object.freeze({
  aggro:{ life:.65, board:1.0, pressure:1.9, hand:.4, resource:1.2, response:.5, risk:.55, attack:.18, pass:-.08 },
  midrange:{ life:1, board:1.45, pressure:1.15, hand:.85, resource:1.05, response:.9, risk:1, attack:.08, pass:0 },
  control:{ life:1.35, board:1.5, pressure:.5, hand:1.45, resource:1.1, response:1.65, risk:1.45, attack:-.03, pass:.08 },
  tempo:{ life:.85, board:1.15, pressure:1.4, hand:.7, resource:1.75, response:1.2, risk:.85, attack:.12, pass:.04 },
  combo:{ life:1.0, board:.85, pressure:.7, hand:1.6, resource:1.15, response:1.35, risk:1.2, attack:.02, pass:.06 },
});

function attack(unit) {
  if (unit?.frozen) return 0;
  return Math.max(0, Number(unit?.atk || 0) + Number(unit?.bonusAtk || 0) + Number(unit?.temporaryAtk || 0));
}
function health(unit) { return Math.max(0, Number(unit?.hp || 0) + Number(unit?.bonusHp || 0) + Number(unit?.temporaryHp || 0) - Number(unit?.damage || 0)); }
function cardText(card) { return fold(`${card?.text || ""} ${(card?.tags || []).join(" ")} ${(card?.subtypes || []).join(" ")}`); }
function cardValue(card) {
  if (!card) return 0;
  const text = cardText(card);
  let value = Number(card.cost || 0) * .38 + Number(card.atk || 0) * 1.05 + Number(card.hp || 0) * .62 + (card.type === "Criatura" ? 1.6 : .4);
  if (/compre|busque|procure|investigue/.test(text)) value += 1.7;
  if (/destrua|bana|cause .*dano|retorne.*mao|sufocad|atordoad|congelad/.test(text)) value += 2.1;
  if (/roubo de vida|toque da morte|indestrutivel|barreira magica/.test(text)) value += 1.3;
  if (/primeiro ato|ultimo suspiro|fura-fila/.test(text)) value += .65;
  return value;
}
function publicOpponentView(state, owner) {
  const raw=state.players[1-owner], hand=(raw.hand||[]).filter(card=>visibleTo(card,owner));
  return { player:{...raw,hand}, unknownHand:Math.max(0,(raw.hand||[]).length-hand.length) };
}
function boardValue(player) {
  return permanents(player).reduce((sum, unit) => {
    let value = attack(unit) * 1.2 + health(unit) * .72 + cardValue(unit) * .25;
    if (unit.exhausted) value *= .9;
    if (unit.stunned || unit.immobilized) value *= .72;
    if (unit.suffocated) value *= .72;
    return sum + value;
  }, 0);
}
function readyPressure(player) {
  return (player?.board || []).reduce((sum, unit) => {
    const used = Number(unit.attacksThisTurn ?? (unit.attackedThisTurn ? 1 : 0));
    if (unit.exhausted || unit.summoning || unit.stunned || unit.immobilized || used >= Number(unit.attackLimit || 1)) return sum;
    const text = cardText(unit);
    return sum + attack(unit) * (text.includes("furtivo") ? 1.3 : text.includes("voar") ? 1.1 : 1);
  }, 0);
}
function knownOpponentHandValue(state, owner) {
  const opponent = state.players[1-owner];
  const revealed = (opponent.hand || []).filter(card => visibleTo(card,owner));
  const unknown = Math.max(0, opponent.hand.length - revealed.length);
  return revealed.reduce((sum, card) => sum + cardValue(card), 0) + unknown * 3.15;
}
function ownHandValue(player) { return (player.hand || []).reduce((sum, card) => sum + cardValue(card), 0); }
function responseValue(player, unknown=0) {
  const known=(player.hand || []).filter(card => /acelerado|instant/.test(cardText(card)) && Number(card.cost || 0) <= Number(player.reserve || 0)).reduce((sum, card) => sum + 1 + cardValue(card) * .2, 0);
  return known + (Number(player.reserve||0)>0 ? Math.min(unknown,4)*.3 : 0) + Number(player.reserve || 0) * .28;
}
function synergy(player) {
  const text = [...(player.hand||[]), ...permanents(player)].map(cardText).join(" ");
  const count = pattern => (text.match(pattern) || []).length;
  switch (player.heroId) {
    case "gimble": return count(/dragao/g) * .45;
    case "goblin": return count(/goblin|fura-fila/g) * .35 + Number(player.turnCardsPlayed || 0) * .25;
    case "uruk": return player.hand.filter(card => card.type === "Feitiço").length * .5;
    case "tifon": return count(/ultimo suspiro/g) * .48;
    case "saymon": return count(/vampiro|roubo de vida/g) * .4;
    case "tessalia": return player.board.some(unit => unit.slot === 2) ? 1.6 : -1.2;
    case "quarion": return count(/primeiro ato/g) * .45;
    case "rasmus": return count(/gato|cafe/g) * .4;
    case "ngoro": return Number(player.heroXP || 0) * .22;
    default: return 0;
  }
}

export function competitiveStateValue(state, owner, requested = "Normal") {
  const difficulty = effectiveAIDifficulty(requested);
  const self = state.players[owner], rawFoe = state.players[1-owner];
  if (!self || !rawFoe) return 0;
  if (state.winner === owner || rawFoe.life <= 0) return 1;
  if (state.winner === 1-owner || self.life <= 0) return -1;
  const {player:foe,unknownHand}=publicOpponentView(state,owner);
  const persona = PERSONALITY[adaptivePersonality(state, owner, difficulty)];
  const selfBoard = boardValue(self), foeBoard = boardValue(foe), selfPressure = readyPressure(self), foePressure = readyPressure(foe);
  const handDiff = ownHandValue(self) - knownOpponentHandValue(state, owner);
  const resourceDiff = Number(self.energy||0)+Number(self.reserve||0)-Number(foe.energy||0)-Number(foe.reserve||0);
  const responseDiff = responseValue(self) - responseValue(foe,unknownHand);
  const lifeDiff = (Number(self.life||0)-Number(foe.life||0))/30;
  const danger = clamp((Number(self.life||0)-foePressure)/30,-1,1), lethal = selfPressure >= Number(foe.life||0) ? 1 : selfPressure/Math.max(8,Number(foe.life||30));
  const raw = lifeDiff*persona.life + ((selfBoard-foeBoard)/22)*persona.board + ((selfPressure-foePressure)/16 + lethal*.45)*persona.pressure + (handDiff/26)*persona.hand + (resourceDiff/10)*persona.resource + (responseDiff/7)*persona.response + danger*persona.risk + (synergy(self)-synergy(foe))/8;
  return Math.tanh(raw/3.7);
}

function shuffled(source, random) {
  const out=[...source]; for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];} return out;
}
function determinize(state, owner, random) {
  const next=structuredClone(state), opponent=next.players[1-owner], handSize=opponent.hand.length;
  const revealed=opponent.hand.filter(card=>visibleTo(card,owner));
  const revealedIds=new Set(revealed.map(cardId));
  const pool=shuffled([...opponent.hand,...opponent.deck].filter(card=>!revealedIds.has(cardId(card))),random);
  opponent.hand=[...revealed,...pool.slice(0,Math.max(0,handSize-revealed.length))];
  opponent.deck=pool.slice(Math.max(0,handSize-revealed.length));
  return next;
}
function actorToMove(state) {
  if (state?.pendingDecision) return typeof state.pendingDecision.context?.decisionOwner === "number" ? state.pendingDecision.context.decisionOwner : state.pendingDecision.owner;
  if (typeof state?.pendingReposition?.activeOwner === "number") return state.pendingReposition.activeOwner;
  if (state?.pendingResponse) return state.pendingResponse.responder;
  return state?.active;
}
function safeApply(state, command) {
  try { return executeCommand(state, command, {priority:true}).state; } catch { return null; }
}
function settlePriority(state, maxPasses=5) {
  let current=state;
  for(let i=0;i<maxPasses && current?.pendingResponse;i++){
    const responder=current.pendingResponse.responder;
    const next=safeApply(current,{type:"passPriority",owner:responder,auto:true});
    if(!next)break; current=next;
  }
  return current;
}
function immediateActionBias(action, state, owner, requested) {
  const persona=PERSONALITY[adaptivePersonality(state,owner,effectiveAIDifficulty(requested))];
  if(action.type==="attack")return persona.attack;
  if(action.type==="advancePhase")return persona.pass * Math.min(3,Number(state.players[owner]?.reserve||0)+Number(state.players[owner]?.energy||0));
  if(action.type==="activateHero")return .025;
  return 0;
}

function rollout(state, owner, requested, config, generate, random) {
  let current=state;
  for(let depth=0;depth<config.rolloutDepth;depth++){
    if(current.winner!=null||current.players?.some(player=>player.life<=0))break;
    const actor=actorToMove(current); if(actor==null)break;
    let actions;
    if(current.pendingResponse?.responder===actor) actions=[{type:"passPriority",owner:actor,auto:true}];
    else actions=generate?.(current,actor) || [];
    if(!actions.length)break;
    const sampled=actions.slice(0,10).map(action=>{const next=safeApply(current,action);return next?{action,next,score:competitiveStateValue(settlePriority(next),owner,requested)+immediateActionBias(action,current,owner,requested)}:null}).filter(Boolean);
    if(!sampled.length)break;
    const chosen=random()<.7?sampled.sort((a,b)=>(actor===owner?b.score-a.score:a.score-b.score))[0]:sampled[Math.floor(random()*sampled.length)];
    current=settlePriority(chosen.next);
  }
  return competitiveStateValue(current,owner,requested);
}

/** Browser compatibility search: tightly time-boxed open-loop root IS-MCTS. */
export function rankCompetitiveCandidates(state, owner, candidates, requested="Normal", options={}) {
  if(!Array.isArray(candidates)||candidates.length<2)return candidates||[];
  const difficulty=effectiveAIDifficulty(requested), config=CONFIG[difficulty], random=options.random||Math.random;
  const base=candidates.slice(0,24).map(action=>{
    const next=safeApply(state,action); if(!next)return null;
    const settled=settlePriority(next);
    return {action,visits:1,value:competitiveStateValue(settled,owner,difficulty)+immediateActionBias(action,state,owner,difficulty)};
  }).filter(Boolean);
  if(!base.length)return candidates;
  if(difficulty==="Easy"){
    const noisy=base.map(item=>({...item,score:item.value+(random()*2-1)*config.noise})).sort((a,b)=>b.score-a.score);
    if(noisy.length>1&&random()<config.errorRate){const top=noisy.slice(0,Math.min(3,noisy.length));const picked=top[Math.floor(random()*top.length)];return [picked.action,...noisy.filter(item=>item!==picked).map(item=>item.action)];}
    return noisy.map(item=>item.action);
  }
  const started=now(); let iterations=0;
  while(iterations<config.runtimeIterations&&now()-started<config.runtimeMs){
    let selected=base[0],best=-Infinity,total=base.reduce((sum,item)=>sum+item.visits,0)+1;
    for(const item of base){const mean=item.value/item.visits,uct=mean+1.3*Math.sqrt(Math.log(total+1)/item.visits);if(uct>best){best=uct;selected=item;}}
    const sample=determinize(state,owner,random),next=safeApply(sample,selected.action);
    const reward=next?rollout(settlePriority(next),owner,difficulty,config,options.generate,random):-1;
    selected.visits++;selected.value+=reward;iterations++;
  }
  let ranked=base.sort((a,b)=>b.visits-a.visits||(b.value/b.visits)-(a.value/a.visits));
  if(ranked.length>1&&random()<config.errorRate){const bestMean=ranked[0].value/ranked[0].visits,plausible=ranked.slice(1,4).filter(item=>bestMean-item.value/item.visits<.2);if(plausible.length){const picked=plausible[Math.floor(random()*plausible.length)];ranked=[picked,...ranked.filter(item=>item!==picked)];}}
  return ranked.map(item=>item.action);
}

export function rankPriorityResponses(state, owner, legal, requested="Normal", random=Math.random) {
  const difficulty=effectiveAIDifficulty(requested), config=CONFIG[difficulty];
  const pass={type:"passPriority",owner,auto:true};
  const candidates=[...(legal||[]),pass];
  const scored=candidates.map(command=>{
    if(command.type==="passPriority"){
      const threat=fold(state.pendingResponse?.action||"");
      const threatScore=/ataque|dano|destr|bana|sufoc|atord/.test(threat)?.5:.05;
      return {command,score:-threatScore*config.responseBias+random()*config.noise};
    }
    const card=command.type==="playCard"?state.players[owner].hand.find(card=>card.id===command.cardId):null;
    const text=cardText(card),impact=cardValue(card)+(/destr|dano|sufoc|atord|congel/.test(text)?2:0);
    const reserveAfter=Number(state.players[owner].reserve||0)-Number(card?.cost||0);
    return {command,score:impact*.18+reserveAfter*.03*config.responseBias+random()*config.noise};
  }).sort((a,b)=>b.score-a.score);
  if(difficulty==="Easy"&&scored.length>1&&random()<config.errorRate)return scored[Math.floor(random()*Math.min(3,scored.length))].command;
  return scored[0]?.command||pass;
}
