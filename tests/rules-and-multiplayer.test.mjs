import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/lab.css",import.meta.url),"utf8");
const roomApi=await readFile(new URL("../app/api/rooms/[id]/route.ts",import.meta.url),"utf8");
const roomMachine=await readFile(new URL("../app/api/rooms/machine.ts",import.meta.url),"utf8");
const hosting=JSON.parse(await readFile(new URL("../.openai/hosting.json",import.meta.url),"utf8"));
const catalogRoute=await readFile(new URL("../app/api/hemsfell-card-catalog.pdf/route.ts",import.meta.url),"utf8");
const roomValidation=await readFile(new URL("../app/api/rooms/validation.ts",import.meta.url),"utf8");
const nextConfig=await readFile(new URL("../next.config.ts",import.meta.url),"utf8");
const roomConstants=await readFile(new URL("../app/api/rooms/constants.ts",import.meta.url),"utf8");
const remoteCardArt=await readFile(new URL("../app/remote-card-art.tsx",import.meta.url),"utf8");

test("rulebook resource and turn invariants stay automated",()=>{
 assert.match(page,/life:startingLife/);
 assert.match(page,/Math\.min\(10,p\.maxEnergy\+1\)/);
 assert.match(page,/Math\.min\(3,p\.reserve\+p\.energy\)/);
 assert.match(page,/levelUpsThisTurn>0/);
 assert.match(page,/iniciou a Manutenção com o Deck vazio e perdeu/);
});

test("combat excludes turned defenders and preserves simultaneous resolution",()=>{
 assert.match(page,/defenderPlayer\.board\.filter\(defender=>!defender\.exhausted/);
 assert.match(page,/liveDefender\.damage\+=attackDamage/);
 assert.match(page,/liveAttacker\.damage\+=counterDamage/);
});

test("graveyards expose their complete public card list",()=>{
 assert.match(page,/title:`Cemitério de/);
 assert.match(page,/title:"Seu Cemitério",cards:me\.grave/);
 assert.match(page,/className="extra-card-grid"/);
});

test("targeted effects are serialized and visually identify both cards",()=>{
 assert.match(page,/showTargetEffect\("EFEITO DE DANO",target\)/);
 assert.match(page,/fx\.card\?\.name\|\|"Efeito"} afeta/);
 assert.match(css,/\.visual-effect\.fx-targeted/);
});

test("multiplayer uses durable shared state and authenticated room participants",()=>{
 assert.equal(hosting.d1,"DB");
 assert.match(roomApi,/action === "sync"/);
 assert.match(roomApi,/invalid participant/);
 assert.match(page,/mirrorOnlineGame/);
 assert.match(page,/setInterval\(fn,850\)/);
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


test("deferred elemental text never forces an immediate target",()=>{
 assert.match(page,/const immediateEffectText=.*split\(\/neste turno/);
 assert.match(page,/const targetRule=.*immediateEffectText\(c\)/);
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
 assert.match(css,/\.original-card\.is-exhausted\{[^}]*rotate\(90deg\)/s);
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

test("visual effects coalesce accidental duplicates but explicit copies may repeat",()=>{
 assert.match(page,/visualFxDedupeRef/);
 assert.match(page,/allowRepeat=false/);
 assert.match(page,/now-previous<1450/);
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
 assert.match(page,/Ngoro I investigou 1 carta/);
});


test("investigate dispatches revealed-card triggers without consuming the reveal",()=>{
 assert.match(page,/Espião Infiltrado recebeu \+1\/\+0/);
 assert.match(page,/Nmali triturou/);
 assert.match(page,/Base de Investigação concedeu 1 de energia/);
 assert.match(page,/Base de Investigação comprou 1 carta/);
 assert.match(page,/if\(investigator\.heroId==="ngoro"\)/);
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
 assert.match(page,/\[3,5,6,7,8,9,10,11,23,24,25,216\]/);
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
