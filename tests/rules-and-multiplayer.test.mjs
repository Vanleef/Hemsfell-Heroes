import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=(await Promise.all([
 readFile(new URL("../app/lab.css",import.meta.url),"utf8"),
 readFile(new URL("../app/lab-legacy.css",import.meta.url),"utf8"),
])).join("\n");
const roomApi=await readFile(new URL("../app/api/rooms/[id]/route.ts",import.meta.url),"utf8");
const roomMachine=await readFile(new URL("../app/api/rooms/machine.ts",import.meta.url),"utf8");
const roomStore=await readFile(new URL("../app/api/rooms/store.ts",import.meta.url),"utf8");
const hosting=JSON.parse(await readFile(new URL("../.openai/hosting.json",import.meta.url),"utf8"));
const catalogRoute=await readFile(new URL("../app/api/hemsfell-card-catalog.pdf/route.ts",import.meta.url),"utf8");
const roomValidation=await readFile(new URL("../app/api/rooms/validation.ts",import.meta.url),"utf8");
const nextConfig=await readFile(new URL("../next.config.ts",import.meta.url),"utf8");
const roomConstants=await readFile(new URL("../app/api/rooms/constants.ts",import.meta.url),"utf8");
const remoteCardArt=await readFile(new URL("../app/remote-card-art.tsx",import.meta.url),"utf8");
const uiOverrides=await readFile(new URL("../app/ui-overrides.css",import.meta.url),"utf8");

test("decision panels explain each action and the hand limit explicitly",()=>{
 assert.match(page,/eyebrow:"LIMITE DE MÃO"/);
 assert.match(page,/para ficar com 9 cartas/);
 assert.match(page,/decisionCopy\.instruction/);
 assert.doesNotMatch(page,/A partida continuará somente depois que o servidor validar esta decisão/);
});

test("command bar copy is density-aware and cannot overflow its panel",()=>{
 assert.match(page,/copyDensity=abilityCopy\.length>110/);
 assert.match(uiOverrides,/\.hero-command-bar\{[\s\S]*?max-width:100%[\s\S]*?overflow:hidden/);
 assert.match(uiOverrides,/-webkit-line-clamp:4/);
 assert.match(uiOverrides,/overflow-wrap:anywhere/);
});

test("response window remains a compact responsive drawer",()=>{
 assert.match(uiOverrides,/\.response-overlay\{[\s\S]*?width:min\(18rem,calc\(100vw - \.8rem\)\)/);
 assert.match(uiOverrides,/\.response-dialog\{[\s\S]*?width:100%[\s\S]*?max-height:min\(68dvh,29rem\)/);
 assert.match(uiOverrides,/@media\(max-width:36rem\)[\s\S]*?bottom:\.4rem/);
 assert.doesNotMatch(uiOverrides,/\.response-dialog\{width:min\(34rem/);
 assert.match(uiOverrides,/\.response-cards\{[\s\S]*?flex-wrap:nowrap[\s\S]*?overflow-x:auto[\s\S]*?overflow-y:hidden/);
});

test("multiplayer response polling and resource display stay fast and authoritative",()=>{
 assert.match(page,/window\.setInterval\(fn,600\)/);
 assert.match(page,/const responseBudget=\(state:Game,owner:0\|1\)=>state\.active===owner\?state\.players\[owner\]\.energy\+state\.players\[owner\]\.reserve/);
 assert.match(page,/const usableAcceleratedResponses=[\s\S]*?!isFast\(card\)\|\|cost>budget[\s\S]*?canChooseAllTargets/);
 assert.doesNotMatch(page,/cost>budget\?"unavailable"/);
});

test("Spectral Sorceress activation survives stale serialized card instances",()=>{
 assert.match(page,/const activatedUnitAbility=[\s\S]*?canonicalUnit\(unit\)\.abilities/);
 assert.match(page,/markerGatedActivation=unit\?\.page===80\|\|unit\?\.page===134/);
 assert.match(page,/const structured=activatedUnitAbility\(card\)/);
 assert.match(page,/compiled=localAbility\?unit:canonicalUnit\(unit\)/);
 assert.match(page,/if\(unit\.page===80\)return !!ability&&!used&&!unit\.suffocated&&!unit\.summoning&&markerAmount\(unit\)>=1/);
});

test("mulligan has a server-authoritative 30 second deadline and visible card inspection",()=>{
 assert.match(roomApi,/const mulliganDeadline = deadline\(30\)/);
 assert.match(page,/Se o tempo acabar, sua mão atual será mantida/);
 assert.match(page,/<OriginalCard card=\{card\} small inspectable\/>/);
 assert.match(uiOverrides,/\.mulligan-card-static \.card-tooltip\{display:none!important/);
 assert.match(uiOverrides,/\.mulligan-card-static \.original-card:hover>\.card-tooltip[\s\S]*?display:flex!important/);
});

test("local end of turn expires turn-duration effects before the opponent turn",()=>{
 assert.match(page,/unit\.modifiers=\(unit\.modifiers\|\|\[\]\)\.filter\(modifier=>modifier\.duration!=="turn"\)/);
 assert.match(page,/unit\.combatRestrictions=\(unit\.combatRestrictions\|\|\[\]\)\.filter\(rule=>rule\.duration!=="turn"\)/);
});

test("rulebook resource and turn invariants stay automated",()=>{
 assert.match(page,/life:startingLife/);
 assert.match(page,/Math\.min\(10,p\.maxEnergy\+1\)/);
 assert.match(page,/Math\.min\(3,p\.reserve\+p\.energy\)/);
 assert.match(page,/levelUpsThisTurn>0/);
 assert.match(page,/iniciou a Manutenção com o Deck vazio e perdeu/);
});

test("combat excludes turned defenders and preserves simultaneous resolution",()=>{
 assert.match(page,/defenderPlayer\.board\.filter\(defender=>!defender\.exhausted/);
 assert.match(page,/liveDefender\.damage\+=resolvedAttackDamage/);
 assert.match(page,/liveAttacker\.damage\+=counterDamage/);
});

test("graveyards expose their complete public card list",()=>{
 assert.match(page,/title:`Cemitério de/);
 assert.match(page,/title:"Seu Cemitério",cards:me\.grave/);
 assert.match(page,/className="extra-card-grid"/);
});

test("targeted effects are serialized and visually identify both cards",()=>{
 assert.match(page,/deferUnitImpact\(target,targetOwner,"EFEITO DE DANO"/);
 assert.match(page,/fx\.card\?\.name\|\|"Efeito"} afeta/);
 assert.match(css,/\.visual-effect\.fx-targeted/);
});

test("multiplayer uses durable shared state and authenticated room participants",()=>{
 assert.equal(hosting.d1,"DB");
 assert.match(roomApi,/action === "sync"/);
 assert.match(roomApi,/invalid participant/);
 assert.match(page,/mirrorOnlineGame/);
 assert.match(page,/setInterval\(fn,600\)/);
});

test("multiplayer lobby runs invitation, coin choice and one mulligan before play",()=>{
 assert.match(page,/Aceitar convite/);
 assert.match(roomApi,/action === "choose_start"/);
 assert.match(roomApi,/action === "mulligan"/);
 assert.match(page,/deck\.slice\(0,7\)/);
 assert.match(roomApi,/Math\.max\(1, player\.hand\.length - 1\)/);
 assert.match(roomApi,/current\.mulliganCount\+\+/);
 assert.match(roomMachine,/prepareCoin/);
 assert.match(roomMachine,/coinWinner/);
});

test("online priority and authoritative deadlines prevent simultaneous actions",()=>{
 assert.match(roomMachine,/waiting for opponent response/);
 assert.match(roomMachine,/stale revision/);
 assert.match(roomMachine,/turnDeadline/);
 assert.match(roomMachine,/pendingResponse\.deadline/);
 assert.match(page,/baseRevision/);
 assert.match(page,/Aguardando resposta do oponente/);
});


test("canonical deferred elemental text never forces an immediate target",()=>{
 assert.match(page,/const immediateCardEffectText=.*split\(\/neste turno/);
 assert.match(page,/const cardPlayEffectText=.*immediateCardEffectText\(card\)/);
 assert.match(page,/const targetRule=.*targetScopeAt\(c,step\)/);
 assert.doesNotMatch(page,/const targetRule=.*test\(c\.text\).*atordoad/);
});

test("elemental chain is consumed by the matching next spell and announces impact",()=>{
 assert.match(page,/p\.elementChain\?\.element===element/);
 assert.match(page,/Cadeia Elemental consumida/);
 assert.match(page,/deferUnitImpact\(unit,owner===0\?1:0/);
 assert.match(page,/p\.elementChain=elementChainFrom\(c\)/);
});

test("turned, positive and negative card states have distinct visuals",()=>{
 assert.match(page,/unit\?\.exhausted\?"is-exhausted"/);
 assert.match(page,/status-frozen/);
 assert.match(page,/status-stunned/);
 assert.match(page,/status-suffocated/);
 assert.match(page,/status-immobilized/);
 assert.match(css,/\.original-card\.is-exhausted[^\{]*\{[^}]*transform:\s*none/s);
 assert.match(css,/positive-card-bloom/);
 assert.match(css,/elemental-ready/);
 assert.match(css,/frozen-card-pulse/);
 assert.match(css,/stunned-card-jolt/);
 assert.match(css,/suffocated-card-throb/);
 assert.match(css,/immobilized-card-lock/);
});


test("the official card catalogue is available in native Next development",()=>{
 assert.match(catalogRoute,/drive\.usercontent\.google\.com/);
 assert.match(catalogRoute,/content-type": "application\/pdf"/);
 assert.match(catalogRoute,/export async function GET/);
});


test("Uruk I resolves only the latest elemental spell at end of turn",()=>{
 assert.match(page,/lastElement\?:ElementName/);
 assert.match(page,/p\.lastElement=element;p\.lastElementSource=spell\.name/);
 assert.match(page,/const resolveUrukLevelOne=/);
 assert.match(page,/URUK I ·/);
 assert.match(page,/element==="Fogo"/);
 assert.match(page,/element==="Terra"/);
 assert.match(page,/element==="Água"/);
 assert.match(page,/p\.energy=Math\.min\(p\.maxEnergy,p\.energy\+1\)/);
 assert.match(page,/p\.lastElement=undefined;p\.lastElementSource=undefined/);
});

test("equal elemental status cues render only once",()=>{
 assert.match(page,/const shownElementCues=new Set<string>\(\)/);
 assert.match(page,/if\(shownElementCues\.has\(cueKey\)\)continue/);
});

test("visual effects coalesce accidental duplicates but explicit copies may repeat",()=>{
 assert.match(page,/visualFxDedupeRef/);
 assert.match(page,/allowRepeat=false/);
 assert.match(page,/now-previous<3600/);
 assert.match(page,/allowVisualRepeat=false/);
 assert.match(page,/activation>0/);
});


test("spell-cast triggers resolve from permanent text with one animation each",()=>{
 assert.match(page,/unit\.page===78/);
 assert.match(page,/unit\.bonusAtk\+=1/);
 assert.match(page,/unit\.page===79/);
 assert.match(page,/athos-spell-\$\{unit\.uid\}/);
 assert.match(page,/draw\(g,p\)/);
 assert.match(page,/unit\.page===80/);
 assert.match(page,/GATILHO · ATHOS/);
 assert.match(page,/resolveSpellCastTriggers\(g,owner,c,\(label,detail,source,target\)=>/);
});

test("Uruk fire explicitly asks for an enemy creature or enemy hero",()=>{
 assert.match(page,/kind:"uruk-fire"/);
 assert.match(page,/criatura inimiga ou o herói inimigo/);
 assert.match(page,/targeting\?\.kind==="uruk-fire"/);
 assert.match(page,/endTurn\(uid\)/);
});


test("trigger lifecycle covers entries, deaths and turn boundaries",()=>{
 assert.match(page,/const resolveCreatureEntryTriggers/);
 assert.match(page,/Valorian causou 2 de dano/);
 assert.match(page,/Bombardeiro Gente Boa causou 1 de dano/);
 assert.match(page,/Acumulador recebeu \+\$\{cardsInHand\}/);
 assert.match(page,/Extrator da Lua Sangrenta atacou/);
 assert.match(page,/Gimble I curou 1 de vida/);
 assert.match(page,/Sr\. Goblin I comprou 1 carta/);
 assert.match(page,/Tifon II causou 1 de dano/);
 assert.match(page,/GATILHO · UNDARIS/);
 assert.match(page,/GATILHO · RITUAL/);
 assert.match(page,/GATO-METRO detectou/);
 assert.match(page,/Após escolher os recursos da manutenção, Ngoro I permite escolher um deck para Investigar 1/);
});


test("investigate uses an authoritative public selection without consuming revealed cards",()=>{
 assert.match(page,/kind:"investigate-selection"/);
 assert.match(page,/Escolha quais cartas revelar/);
 assert.match(page,/permanecerão reveladas no topo do deck/);
 assert.match(page,/targetOwner/);
});


test("life-loss triggers use one event dispatcher",()=>{
 assert.match(page,/const resolveLifeLossTriggers/);
 assert.match(page,/Saymon recebeu 1 marcador por perder vida/);
 assert.match(page,/Discípulo de Sangue recebeu \+1\/\+0/);
 assert.match(page,/Castelo Carmesim: primeira perda de vida/);
 assert.match(page,/const g=structuredClone\(old\),before:\[number,number\]/);
});

test("global effects and Tessália's Commander lane stay deterministic",()=>{
 assert.match(page,/Global effects never request a target/);
 assert.match(page,/todas\?\\s\+\(\?:as\?\\s\+\)\?criaturas/);
 assert.match(page,/const scope=.*\[\.\.\.p\.board,\.\.\.o\.board\]/);
 assert.match(page,/const isCommander=/);
 assert.match(page,/Tessália precisa de um Comandante no espaço central/);
 assert.match(page,/O Comandante de Tessália atacou/);
 assert.match(page,/commander-slot/);
 assert.match(css,/\.commander-slot/);
});


test("room APIs reject unsafe input and never expose opponent hidden zones",()=>{
 assert.match(roomConstants,/ROOM_LIMITS/);
 assert.match(roomValidation,/MAX_ROOM_PAYLOAD_BYTES/);
 assert.match(roomValidation,/forbiddenKeys/);
 assert.match(roomValidation,/isBoundedGame/);
 assert.match(roomApi,/readSafeJson/);
 assert.match(roomApi,/preserveOpponentSecrets/);
 assert.match(roomApi,/isRoomId/);
 assert.match(roomApi,/request failed/);
 assert.match(roomMachine,/stale revision/);
 assert.match(roomStore,/visibleTo\(card, viewer\) \? card : hiddenCard/);
 assert.match(roomStore,/revealedTo\.includes\(viewer\)/);
 assert.match(roomStore,/kind: "opponent-choice"/);
 assert.match(roomStore,/effect: \{\}/);
 assert.match(roomStore,/context: \{\}/);
 assert.match(roomStore,/targetSteps: \[\]/);
});

test("public hand and deck information is rendered symmetrically",()=>{
 assert.match(page,/className="opponent-card-back official-card-back"/);
 assert.match(page,/card\.revealed\?<OriginalCard/);
 assert.match(page,/className="revealed-badge" title="Carta revelada/);
 assert.match(page,/className="hero-clue-counter" title="Pistas"/);
 assert.match(page,/revealedTop\.map/);
 assert.match(uiOverrides,/opponent-hand>\.card-frame/);
 assert.match(uiOverrides,/hero-clue-counter/);
 assert.match(uiOverrides,/min-width:clamp\(1\.85rem,3\.15cqw,2\.9rem\)/);
});

test("browser-facing routes include baseline hardening headers",()=>{
 assert.match(nextConfig,/poweredByHeader: false/);
 assert.match(nextConfig,/X-Content-Type-Options/);
 assert.match(nextConfig,/X-Frame-Options/);
 assert.match(nextConfig,/Permissions-Policy/);
});


test("remote card art reuses document pages instead of reopening them per card",()=>{
 assert.match(remoteCardArt,/const pagePromises = new Map/);
 assert.match(remoteCardArt,/function loadCatalogPage/);
 assert.match(remoteCardArt,/void loadCatalogPage\(page\)/);
});


test("room creation request stays valid TypeScript without escaped object keys",()=>{
 assert.match(page,/body: JSON\.stringify\(\{ settings \}\)/);
 assert.doesNotMatch(page,/\\\\:/);
});


test("local development uses memory while production requires a durable room store",()=>{
 assert.match(roomStore,/memoryRooms/);
 assert.match(roomStore,/useMemoryStore/);
 assert.match(roomStore,/process\.env\.NODE_ENV === "development"/);
 assert.match(roomStore,/hasSupabaseStore/);
 assert.match(roomStore,/hasBlobStore/);
 assert.doesNotMatch(roomStore,/allowMemoryFallback/);
});


test("activated costs, flexible damage and Uruk elemental choices stay covered",()=>{
 assert.match(page,/hasActivatableEffect/);
 assert.match(page,/card-frame-activation/);
 assert.match(page,/sacrifique\[\^\.\]\*criatura/);
 assert.match(page,/lifeLoss=Number/);
 assert.match(page,/target=chosenEnemy\|\|chosenAlly/);
 assert.match(page,/isEarthquake/);
 assert.match(page,/orbe cromatico/);
 assert.match(page,/hero-status-cues/);
 assert.match(page,/clone de agua/);
 assert.match(css,/deck-picker\{display:grid/);
});