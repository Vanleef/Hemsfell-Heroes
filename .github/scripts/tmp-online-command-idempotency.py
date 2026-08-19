from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app/api/rooms/machine.ts",
    "  disconnectedAt?: number | null;\n};",
    "  disconnectedAt?: number | null;\n  recentCommandIds?: string[];\n};",
)
replace_once(
    "app/api/rooms/machine.ts",
    '  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0, disconnectedAt: null };',
    '  return { heroId: null, token, accepted, deckLocked: false, mulliganDone: false, mulliganCount: 0, disconnectedAt: null, recentCommandIds: [] };',
)
replace_once(
    "app/api/rooms/machine.ts",
    '''export function applyRulesCommand(room: Room, role: RoomRole, rawCommand: Record<string, unknown>, baseRevision: unknown) {\n  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };\n  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };\n  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };''',
    '''export function applyRulesCommand(room: Room, role: RoomRole, rawCommand: Record<string, unknown>, baseRevision: unknown, commandId: unknown = undefined) {\n  const currentParticipant = room[role];\n  const normalizedCommandId = typeof commandId === "string" ? commandId.trim() : "";\n  if (commandId != null && (!normalizedCommandId || normalizedCommandId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(normalizedCommandId))) return { ok: false, status: 400, error: "invalid command id" };\n  /* A network retry may arrive with the pre-command revision after the first\n     request already committed. Recognize the logical command before checking\n     baseRevision so it can never resolve twice. */\n  if (normalizedCommandId && currentParticipant?.recentCommandIds?.includes(normalizedCommandId)) return { ok: true, status: 200, error: "", duplicate: true };\n  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };\n  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };\n  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };''',
)
replace_once(
    "app/api/rooms/machine.ts",
    '''    room.revision++;\n    return { ok: true, status: 200, error: "", trace: result.trace };''',
    '''    room.revision++;\n    if (normalizedCommandId && currentParticipant) {\n      const recent = currentParticipant.recentCommandIds || [];\n      currentParticipant.recentCommandIds = [...recent.filter((value) => value !== normalizedCommandId), normalizedCommandId].slice(-32);\n    }\n    return { ok: true, status: 200, error: "", trace: result.trace, duplicate: false };''',
)

replace_once(
    "app/api/rooms/[id]/route.ts",
    "const resolution = applyRulesCommand(room, role, body.command, body.baseRevision);",
    "const resolution = applyRulesCommand(room, role, body.command, body.baseRevision, body.commandId);",
)

replace_once(
    "app/online-match-runtime.tsx",
    '''    try {\n      let baseRevision = roomRef.current?.revision;''',
    '''    try {\n      const commandId = crypto.randomUUID();\n      let baseRevision = roomRef.current?.revision;''',
)
replace_once(
    "app/online-match-runtime.tsx",
    '''          body: JSON.stringify({ action: "command", token: currentSession.token, command: payload, baseRevision }),''',
    '''          body: JSON.stringify({ action: "command", token: currentSession.token, command: payload, baseRevision, commandId }),''',
)

replace_once(
    "app/page.tsx",
    '''const runRulesCommand=async(command:Record<string,unknown>,owner:0|1=0):Promise<boolean>=>{try{if(mode==="online"){const result=await roomAction("command",{command,baseRevision:roomRevisionRef.current});return !!result}''',
    '''const runRulesCommand=async(command:Record<string,unknown>,owner:0|1=0):Promise<boolean>=>{try{if(mode==="online"){const commandId=crypto.randomUUID();const result=await roomAction("command",{command,commandId,baseRevision:roomRevisionRef.current});return !!result}''',
)

replace_once(
    "docs/online-priority-implementation.md",
    "- Legacy `sync` is rejected during `declare-attackers` and `declare-blockers`, preventing either player from bypassing the grouped authoritative command path with an older full-state synchronization.\n",
    "- Legacy `sync` is rejected during `declare-attackers` and `declare-blockers`, preventing either player from bypassing the grouped authoritative command path with an older full-state synchronization.\n- Every modern Online command may carry a stable client command id; the server remembers the last 32 accepted ids per participant and acknowledges a retransmission before stale-revision validation, preventing a lost HTTP response or retry from applying the same action twice.\n",
)
