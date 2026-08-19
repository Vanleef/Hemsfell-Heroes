import { readFile, writeFile } from "node:fs/promises";

const files = {
  page: "app/page.tsx",
  store: "app/api/rooms/store.ts",
  route: "app/api/rooms/[id]/route.ts",
  machine: "app/api/rooms/machine.ts",
  clock: "app/api/rooms/online-clock.mjs",
  test: "tests/online-risk-hardening.test.mjs",
};

async function load(path) { return readFile(path, "utf8"); }
async function save(path, content) { await writeFile(path, content); }
function requireReplace(source, search, replacement, label) {
  const next = typeof search === "string" ? source.replace(search, replacement) : source.replace(search, replacement);
  if (next === source) throw new Error(`Patch point not found: ${label}`);
  return next;
}
function insertAfter(source, marker, insertion, label) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Patch marker not found: ${label}`);
  return source.slice(0, index + marker.length) + insertion + source.slice(index + marker.length);
}
function replaceInSection(source, sectionMarker, search, replacement, label) {
  const section = source.indexOf(sectionMarker);
  if (section < 0) throw new Error(`Section not found: ${label}`);
  const index = source.indexOf(search, section);
  if (index < 0) throw new Error(`Section patch point not found: ${label}`);
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

async function patchStore() {
  let source = await load(files.store);
  source = requireReplace(
    source,
    'const hasBlobStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);',
    'const hasBlobStore = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);\nexport const hasTransactionalRoomStore = () => hasSupabaseStore();\nconst requiresTransactionalAuthority = (room: Room) => ["mulligan", "started", "finished"].includes(room.status);',
    "store transactional capability",
  );

  const authorityWriter = `\nasync function writeSupabaseAuthority(room: Room) {\n  try {\n    return await writeSupabase(room);\n  } catch (error) {\n    if (!isStaleRevision(error)) throw error;\n    const expectedRevision = room.revision - 1;\n    const primary = await readSupabase(room.id);\n    if (primary && Number(primary.revision) >= expectedRevision) throw error;\n\n    const payload = { id: room.id, payload: JSON.stringify(room), revision: room.revision, updated_at: new Date().toISOString() };\n    if (!primary) {\n      const response = await supabase("multiplayer_rooms?on_conflict=id", {\n        method: "POST",\n        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },\n        body: JSON.stringify(payload),\n      });\n      const rows = await response.json() as unknown[];\n      if (rows.length) return;\n      const latest = await readSupabase(room.id);\n      if (latest && Number(latest.revision) === room.revision) return;\n      throw staleRevision();\n    }\n\n    const response = await supabase(\`multiplayer_rooms?id=eq.\${encodeURIComponent(room.id)}&revision=eq.\${Number(primary.revision)}\`, {\n      method: "PATCH",\n      headers: { Prefer: "return=representation" },\n      body: JSON.stringify({ payload: payload.payload, revision: payload.revision, updated_at: payload.updated_at }),\n    });\n    const rows = await response.json() as unknown[];\n    if (!rows.length) throw staleRevision();\n  }\n}\n`;
  source = insertAfter(source, '\nasync function supabaseStorage(path: string, init: RequestInit = {}) {', authorityWriter, "store authority writer");

  const activeGuard = `  if (requiresTransactionalAuthority(room)) {\n    if (!hasSupabaseStore()) throw new Error("transactional multiplayer storage required");\n    /* Active matches never fall through to object storage. If an old fallback\n       copy is newer, writeSupabaseAuthority migrates that full snapshot with a\n       CAS against the table revision before gameplay continues. */\n    return writeSupabaseAuthority(room);\n  }\n`;
  source = replaceInSection(
    source,
    'export async function writeRoom(room: Room) {',
    '  if (hasSupabaseStore()) {',
    activeGuard + '  if (hasSupabaseStore()) {',
    "store active authority guard",
  );

  await save(files.store, source);
}

async function patchRoute() {
  let source = await load(files.route);
  source = requireReplace(
    source,
    'import { readRoom, roleFor, roomView, writeRoom, type Room } from "../store";',
    'import { hasTransactionalRoomStore, readRoom, roleFor, roomView, writeRoom, type Room } from "../store";',
    "route store import",
  );
  source = requireReplace(
    source,
    'const VALID_DECK_IDS = new Set(["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"]);',
    'const VALID_DECK_IDS = new Set(["gimble", "goblin", "uruk", "tifon", "saymon", "tessalia", "quarion", "rasmus", "ngoro", "zayan", "natureza"]);\nconst REVISION_GUARDED_ACTIONS = new Set(["select", "settings", "choose_start", "mulligan"]);',
    "route guarded actions",
  );
  source = requireReplace(
    source,
    'async function persistDueTimeout(room: Room, id: string) {\n  if (!applyTimeout(room)) return room;',
    'async function persistDueTimeout(room: Room, id: string) {\n  if (["mulligan", "started", "finished"].includes(room.status) && !hasTransactionalRoomStore()) return room;\n  if (!applyTimeout(room)) return room;',
    "route timeout authority",
  );
  source = requireReplace(
    source,
    '    const activeParticipant = room[role];\n    if (!activeParticipant) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });',
    '    const activeParticipant = room[role];\n    if (!activeParticipant) return NextResponse.json({ error: "player not connected" }, { status: 409, ...noStore });\n    if (["mulligan", "started", "finished"].includes(room.status) && !hasTransactionalRoomStore()) {\n      return NextResponse.json({ error: "authoritative multiplayer storage unavailable", ...roomView(room, true, role) }, { status: 503, ...noStore });\n    }',
    "route active authority refusal",
  );
  source = requireReplace(
    source,
    '    if (activeParticipant.disconnectedAt) return NextResponse.json({ error: "resume required", ...roomView(room, true, role) }, { status: 409, ...noStore });\n\n    if (body.action === "select") {',
    '    if (activeParticipant.disconnectedAt) return NextResponse.json({ error: "resume required", ...roomView(room, true, role) }, { status: 409, ...noStore });\n    if (REVISION_GUARDED_ACTIONS.has(String(body.action)) && Number(body.baseRevision) !== room.revision) {\n      return NextResponse.json({ error: "stale revision", ...roomView(room, true, role) }, { status: 409, ...noStore });\n    }\n\n    if (body.action === "select") {',
    "route setup revision guard",
  );
  source = requireReplace(
    source,
    '    } else if (body.action === "choose_start") {\n      if (room.status !== "coin-choice" || room.coinWinner !== role) return NextResponse.json({ error: "only coin winner chooses" }, { status: 403, ...noStore });',
    '    } else if (body.action === "choose_start") {\n      if (room.status !== "coin-choice" || room.coinWinner !== role) return NextResponse.json({ error: "only coin winner chooses" }, { status: 403, ...noStore });\n      if (!hasTransactionalRoomStore()) return NextResponse.json({ error: "authoritative multiplayer storage unavailable" }, { status: 503, ...noStore });',
    "route start requires transactional store",
  );
  source = requireReplace(
    source,
    '    if (isStaleWrite(error)) {\n      const latest = await readRoom(id);',
    '    if (isStaleWrite(error)) {\n      const latest = await readRoom(id);',
    "route stale catch present",
  );
  source = requireReplace(
    source,
    '    console.error("[rooms] request failed", error);\n    return NextResponse.json({ error: "request failed" }, { status: 500, ...noStore });',
    '    if (error instanceof Error && /transactional multiplayer storage required|Supabase room store failed|Supabase project endpoint unavailable/i.test(error.message)) {\n      return NextResponse.json({ error: "authoritative multiplayer storage unavailable" }, { status: 503, ...noStore });\n    }\n    console.error("[rooms] request failed", error);\n    return NextResponse.json({ error: "request failed" }, { status: 500, ...noStore });',
    "route storage unavailable response",
  );
  await save(files.route, source);
}

async function patchMachine() {
  let source = await load(files.machine);
  const helpers = `\nfunction interactionOwner(game: any): 0 | 1 | null {\n  const direct = Number(game?.pendingDecision?.owner ?? game?.pendingDecision?.context?.decisionOwner);\n  if (direct === 0 || direct === 1) return direct;\n  const reposition = game?.pendingReposition;\n  const active = Number(reposition?.activeOwner);\n  if (active === 0 || active === 1) return active;\n  const confirmed = new Set(Array.isArray(reposition?.confirmed) ? reposition.confirmed : []);\n  const waiting = (Array.isArray(reposition?.owners) ? reposition.owners : []).find((owner: unknown) => (owner === 0 || owner === 1) && !confirmed.has(owner));\n  return waiting === 0 || waiting === 1 ? waiting : null;\n}\n\nfunction interactionDeadline(game: any): number | null {\n  const value = game?.pendingDecision?.deadline ?? game?.pendingReposition?.deadline;\n  return Number.isFinite(Number(value)) ? Number(value) : null;\n}\n`;
  source = insertAfter(source, '\nfunction finishDisconnectedMatch(room: Room, loser: 0 | 1) {', helpers, "machine interaction helpers");

  source = requireReplace(
    source,
    '  if (room.game.combatAction?.stage === "choosing" && !Number.isFinite(Number(room.game.combatAction.deadline))) {\n    room.game.combatAction.deadline = now + room.settings.responseSeconds * 1000;\n    if (room.game.priority) room.game.priority.deadline = room.game.combatAction.deadline;\n    seededDeadline = true;\n  }',
    '  if (room.game.combatAction?.stage === "choosing" && !Number.isFinite(Number(room.game.combatAction.deadline))) {\n    room.game.combatAction.deadline = now + room.settings.responseSeconds * 1000;\n    if (room.game.priority) room.game.priority.deadline = room.game.combatAction.deadline;\n    seededDeadline = true;\n  }\n  if (room.game.pendingDecision && !Number.isFinite(Number(room.game.pendingDecision.deadline))) {\n    room.game.pendingDecision.deadline = now + room.settings.turnSeconds * 1000;\n    seededDeadline = true;\n  }\n  if (room.game.pendingReposition && !Number.isFinite(Number(room.game.pendingReposition.deadline))) {\n    room.game.pendingReposition.deadline = now + room.settings.turnSeconds * 1000;\n    seededDeadline = true;\n  }',
    "machine seed decision deadlines",
  );

  source = requireReplace(
    source,
    '  /* Interactive target/effect decisions intentionally pause the action clock.\n     They are never allowed to fall through to a phase timeout underneath the\n     decision that owns input. */\n  if (room.game.pendingDecision || room.game.pendingReposition) return seededDeadline;',
    '  /* Interactive choices pause the action clock but have their own generous\n     inactivity deadline. Expiry forfeits the chooser instead of inventing a\n     target/card selection, so card semantics remain untouched and the room can\n     never deadlock forever. */\n  if (room.game.pendingDecision || room.game.pendingReposition) {\n    const owner = interactionOwner(room.game);\n    const due = interactionDeadline(room.game);\n    if (owner === null || due === null || due > now) return seededDeadline;\n    finishDisconnectedMatch(room, owner);\n    room.game.events = (room.game.events ?? 0) + 1;\n    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo para concluir a decisão terminou. O jogador responsável perdeu a partida por inatividade.", tone: "danger" }, ...(room.game.log ?? [])];\n    logOnlineDiagnostic(room, "decision-timeout-forfeit", { role: owner === 0 ? "host" : "guest" });\n    return true;\n  }',
    "machine decision timeout forfeit",
  );
  await save(files.machine, source);
}

async function patchClock() {
  let source = await load(files.clock);
  source = requireReplace(
    source,
    'const choosingDecision = (game) => !!game?.pendingDecision || !!game?.pendingReposition;\nconst setPriorityDeadline',
    'const choosingDecision = (game) => !!game?.pendingDecision || !!game?.pendingReposition;\nconst interactionKey = (game) => game?.pendingDecision\n  ? `decision:${game.pendingDecision.owner ?? game.pendingDecision.context?.decisionOwner ?? "?"}:${game.pendingDecision.kind ?? "?"}:${game.pendingDecision.context?.sourceId ?? game.pendingDecision.sourceName ?? ""}`\n  : game?.pendingReposition\n    ? `reposition:${game.pendingReposition.activeOwner ?? "?"}:${game.pendingReposition.sourceId ?? ""}`\n    : "";\nconst ensureInteractionDeadline = (before, after, settings, now) => {\n  const target = after?.pendingDecision || after?.pendingReposition;\n  if (!target) return;\n  const previous = before?.pendingDecision || before?.pendingReposition;\n  const sameInteraction = interactionKey(before) && interactionKey(before) === interactionKey(after);\n  if (sameInteraction && Number.isFinite(Number(previous?.deadline))) target.deadline = Number(previous.deadline);\n  else if (!Number.isFinite(Number(target.deadline))) target.deadline = now + settings.turnSeconds * 1000;\n};\nconst setPriorityDeadline',
    "clock interaction deadline helpers",
  );
  source = requireReplace(
    source,
    '    if (after.pendingResponse) delete after.pendingResponse.deadline;\n    if (after.combatAction) delete after.combatAction.deadline;',
    '    if (after.pendingResponse) delete after.pendingResponse.deadline;\n    if (after.combatAction) delete after.combatAction.deadline;\n    if (after.pendingDecision) delete after.pendingDecision.deadline;\n    if (after.pendingReposition) delete after.pendingReposition.deadline;',
    "clock winner cleanup",
  );
  source = requireReplace(
    source,
    '  const blockerChoice = choosingBlocker(after);\n  const decisionChoice = choosingDecision(after);\n  if (after.combatAction && !blockerChoice) delete after.combatAction.deadline;',
    '  const blockerChoice = choosingBlocker(after);\n  const decisionChoice = choosingDecision(after);\n  if (decisionChoice) ensureInteractionDeadline(before, after, settings, now);\n  if (after.combatAction && !blockerChoice) delete after.combatAction.deadline;',
    "clock ensure choice deadline",
  );
  await save(files.clock, source);
}

async function patchPage() {
  let source = await load(files.page);

  source = requireReplace(
    source,
    /const syncOnlineGame=\(next:Game\)=>\{[\s\S]*?\n\};\n\nconst stopPolling/,
    `const syncOnlineGame=(_next:Game)=>{\n if(mode!=="online"||!roomId||!roomToken)return;\n /* Legacy handlers are never allowed to upload a Game snapshot. If one is\n    reached, immediately reconcile from the authoritative room instead. */\n void fetch(\`/api/rooms/\${roomId}?token=\${encodeURIComponent(roomToken)}\`,{cache:"no-store"}).then(async res=>{if(!res.ok)return;const data=await res.json();if(data?.revision!==undefined)applyRoomSnapshot(data)}).catch(()=>setRoomError("Reconectando ao estado autoritativo da sala…"));\n};\n\nconst stopPolling`,
    "page legacy sync reconciliation",
  );

  source = requireReplace(
    source,
    /const selectHeroInRoom = async \(heroId:string\)=>\{[\s\S]*?\n\};\n\nconst applyRoomSnapshot/,
    `const selectHeroInRoom=async(heroId:string)=>{await roomAction("select",{heroId,locked:true})};\n\nconst applyRoomSnapshot`,
    "page select uses roomAction",
  );

  source = requireReplace(
    source,
    /const roomAction=\(action:string,extra:Record<string,unknown>=\{\}\)=>\{[\s\S]*?\n\};\nconst chooseStarter/,
    `const revisionGuardedRoomActions=new Set(["select","settings","choose_start","mulligan"]);\nconst setupActionAlreadyApplied=(action:string,data:any,extra:Record<string,unknown>)=>{const self=isHost?data?.host:data?.guest;if(action==="select")return !!self?.deckLocked&&self?.heroId===extra.heroId;if(action==="mulligan")return !!self?.mulliganDone;if(action==="choose_start")return data?.status==="mulligan"||data?.status==="started";if(action==="settings")return JSON.stringify(data?.settings??null)===JSON.stringify(extra.settings??null);return false};\nconst roomAction=(action:string,extra:Record<string,unknown>={})=>{\n if(!roomId||!roomToken)return Promise.resolve(null);\n const execute=async(retry=true):Promise<any>=>{\n  const guarded=action==="command"||revisionGuardedRoomActions.has(action);\n  const payload={action,token:roomToken,...extra,...(guarded?{baseRevision:roomRevisionRef.current}:{})};\n  const res=await fetch(\`/api/rooms/\${roomId}\`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});\n  const data=await res.json();\n  if(res.status===409&&data?.error==="stale revision"){\n   if(data?.revision!==undefined){if(data?.game)applyRoomSnapshot(data);else{setRoomInfo(data);roomRevisionRef.current=data.revision??roomRevisionRef.current}}\n   if(setupActionAlreadyApplied(action,data,extra)){setRoomError("");return data}\n   if(retry&&(action==="command"||revisionGuardedRoomActions.has(action)))return execute(false)\n  }\n  if(!res.ok){if(data?.game)applyRoomSnapshot(data);setRoomError(data?.error||"A sala recusou a ação.");return null}\n  setRoomError("");applyRoomSnapshot(data);return data;\n };\n const task=syncQueueRef.current.then(()=>execute()).catch(()=>{setRoomError("Conexão instável. A ação será reconciliada com a sala.");return null});\n syncQueueRef.current=task.then(()=>undefined,()=>undefined);\n return task;\n};\nconst chooseStarter`,
    "page setup stale retry",
  );

  source = requireReplace(
    source,
    'const update=(fn:(g:Game)=>void)=>setGame(',
    'const update=(fn:(g:Game)=>void)=>{if(mode==="online"){syncOnlineGame(currentGameRef.current as Game);setRoomError("A ação online precisa ser confirmada pelo servidor.");return}setGame(',
    "page block local online mutation start",
  );
  source = requireReplace(
    source,
    'queueMicrotask(()=>syncOnlineGame(g));return g});\n const setSharedCombat=',
    'queueMicrotask(()=>syncOnlineGame(g));return g})};\n const setSharedCombat=',
    "page block local online mutation end",
  );

  source = requireReplace(
    source,
    ' const setSharedResponse=(response:PendingResponse|null,sharedAction:CombatAction|null=combatAction)=>{\n  const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;\n  setResponseWindow(timed);\n  if(mode==="online"){update(g=>{g.pendingResponse=timed?{...timed,passes:timed.passes??0}:null;g.combatAction=sharedAction});return}',
    ' const setSharedResponse=(response:PendingResponse|null,sharedAction:CombatAction|null=combatAction)=>{\n  if(mode==="online")return;\n  const timed=response?{...response,deadline:response.deadline??Date.now()+(roomInfo?.settings?.responseSeconds??30)*1000}:null;\n  setResponseWindow(timed);',
    "page no fabricated online priority",
  );

  source = requireReplace(
    source,
    /\n useEffect\(\(\)=>\{if\(!isHost\|\|!roomId\|\|!roomToken\|\|roomInfo\?\.status!=="mulligan"[\s\S]*?roomAction\("initialize",\{game:initial\}\)\},\[[^\]]*\]\);\n/,
    '\n /* Online match initialization is server-owned in choose_start. */\n',
    "page remove legacy initialize",
  );

  await save(files.page, source);
}

async function writeRegressionTest() {
  const test = `import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";\nimport { reconcileOnlineClocks } from "../app/api/rooms/online-clock.mjs";\n\nconst read = (path) => readFile(new URL(path, import.meta.url), "utf8");\n\ntest("active online rooms pin writes to transactional Supabase authority", async () => {\n  const [store, route] = await Promise.all([read("../app/api/rooms/store.ts"), read("../app/api/rooms/[id]/route.ts")]);\n  assert.match(store, /requiresTransactionalAuthority/);\n  assert.match(store, /return writeSupabaseAuthority\(room\)/);\n  assert.match(store, /transactional multiplayer storage required/);\n  assert.match(route, /hasTransactionalRoomStore/);\n  assert.match(route, /authoritative multiplayer storage unavailable/);\n});\n\ntest("setup actions are revision guarded and client retries only stale setup races", async () => {\n  const [route, page] = await Promise.all([read("../app/api/rooms/[id]/route.ts"), read("../app/page.tsx")]);\n  assert.match(route, /REVISION_GUARDED_ACTIONS/);\n  assert.match(route, /Number\(body\.baseRevision\) !== room\.revision/);\n  assert.match(page, /revisionGuardedRoomActions/);\n  assert.match(page, /setupActionAlreadyApplied/);\n  assert.match(page, /data\?\.error==="stale revision"/);\n});\n\ntest("online client cannot mutate Game through the legacy update/sync path", async () => {\n  const page = await read("../app/page.tsx");\n  assert.match(page, /const update=.*mode==="online"[\\s\\S]*?syncOnlineGame/);\n  assert.match(page, /const syncOnlineGame=.*cache:"no-store"/s);\n  assert.doesNotMatch(page.match(/const syncOnlineGame=[\\s\\S]*?const stopPolling/)?.[0] ?? "", /action:\\?"sync\\?"/);\n  assert.match(page, /if\(mode==="online"\)return;\\n  const timed=response/);\n  assert.doesNotMatch(page, /roomAction\("initialize",\{game:initial\}\)/);\n});\n\ntest("interactive decisions receive a deadline and preserve it across snapshots", () => {\n  const settings = { turnSeconds: 120, responseSeconds: 20 };\n  const now = 10_000;\n  const before = { active: 0, winner: null, turnDeadline: now + 50_000, priority: {} };\n  const after = { active: 0, winner: null, pendingDecision: { kind: "targets", owner: 0, context: { sourceId: "x" } }, priority: {} };\n  reconcileOnlineClocks(before, after, settings, now);\n  assert.equal(after.pendingDecision.deadline, now + 120_000);\n  assert.equal(after.turnDeadline, null);\n  const refreshed = structuredClone(after);\n  const next = structuredClone(after);\n  reconcileOnlineClocks(refreshed, next, settings, now + 20_000);\n  assert.equal(next.pendingDecision.deadline, now + 120_000);\n});\n\ntest("decision timeout forfeits instead of inventing a card choice", async () => {\n  const machine = await read("../app/api/rooms/machine.ts");\n  assert.match(machine, /decision-timeout-forfeit/);\n  assert.match(machine, /perdeu a partida por inatividade/);\n  assert.match(machine, /interactionDeadline/);\n  assert.doesNotMatch(machine, /auto.*resolveDecision/i);\n});\n`;
  await save(files.test, test);
}

await patchStore();
await patchRoute();
await patchMachine();
await patchClock();
await patchPage();
await writeRegressionTest();
console.log("Online risk hardening patches applied.");
