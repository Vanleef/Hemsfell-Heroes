from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "app/api/rooms/machine.ts",
    'import { shouldAutoPass } from "../../rules-engine/priority.mjs";\n',
    'import { shouldAutoPass } from "../../rules-engine/priority.mjs";\nimport { logOnlineDiagnostic } from "./online-diagnostics.mjs";\n',
)

# Timeout diagnostics are server-only and intentionally contain no card/target data.
replace_once(
    "app/api/rooms/machine.ts",
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de reconexão terminou. A partida foi encerrada.", tone: "danger" }, ...(room.game.log ?? [])];\n    return true;',
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de reconexão terminou. A partida foi encerrada.", tone: "danger" }, ...(room.game.log ?? [])];\n    logOnlineDiagnostic(room, "reconnect-expired", { role: disconnected.role });\n    return true;',
)
replace_once(
    "app/api/rooms/machine.ts",
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de resposta terminou; a prioridade foi passada automaticamente.", tone: "response" }, ...(room.game.log ?? [])];\n    return true;',
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo de resposta terminou; a prioridade foi passada automaticamente.", tone: "response" }, ...(room.game.log ?? [])];\n    logOnlineDiagnostic(room, "response-timeout", { role: owner === 0 ? "host" : "guest", commandType: "passPriority", auto: true });\n    return true;',
)
replace_once(
    "app/api/rooms/machine.ts",
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo para declarar bloqueadores terminou; os ataques seguirão sem novos bloqueios.", tone: "combat" }, ...(room.game.log ?? [])];\n    return true;',
    '    room.game.log = [{ id: crypto.randomUUID(), text: "O tempo para declarar bloqueadores terminou; os ataques seguirão sem novos bloqueios.", tone: "combat" }, ...(room.game.log ?? [])];\n    logOnlineDiagnostic(room, "blocker-timeout", { role: owner === 0 ? "host" : "guest", commandType: "declareBlockers", auto: true });\n    return true;',
)
replace_once(
    "app/api/rooms/machine.ts",
    '        room.game.log = [{ id: crypto.randomUUID(), text: "O tempo da etapa terminou; foi solicitada a passagem pelo fluxo normal de prioridade.", tone: "phase" }, ...(room.game.log ?? [])];\n        return true;',
    '        room.game.log = [{ id: crypto.randomUUID(), text: "O tempo da etapa terminou; foi solicitada a passagem pelo fluxo normal de prioridade.", tone: "phase" }, ...(room.game.log ?? [])];\n        logOnlineDiagnostic(room, "turn-timeout", { role: owner === 0 ? "host" : "guest", commandType: "advancePhase", auto: true });\n        return true;',
)

replace_once(
    "app/api/rooms/machine.ts",
    '  if (commandId != null && (!normalizedCommandId || normalizedCommandId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(normalizedCommandId))) return { ok: false, status: 400, error: "invalid command id" };',
    '  if (commandId != null && (!normalizedCommandId || normalizedCommandId.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(normalizedCommandId))) { logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "invalid command id", baseRevision }); return { ok: false, status: 400, error: "invalid command id" }; }',
)
replace_once(
    "app/api/rooms/machine.ts",
    '  if (normalizedCommandId && currentParticipant?.recentCommandIds?.includes(normalizedCommandId)) return { ok: true, status: 200, error: "", duplicate: true };',
    '  if (normalizedCommandId && currentParticipant?.recentCommandIds?.includes(normalizedCommandId)) { logOnlineDiagnostic(room, "command-duplicate", { role, commandType: String(rawCommand.type || ""), baseRevision, duplicate: true }); return { ok: true, status: 200, error: "", duplicate: true }; }',
)
replace_once(
    "app/api/rooms/machine.ts",
    '  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };\n  if (Number(baseRevision) !== room.revision) return { ok: false, status: 409, error: "stale revision" };\n  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };',
    '  if (room.status !== "started" || !room.game) return { ok: false, status: 409, error: "room not started" };\n  if (Number(baseRevision) !== room.revision) { logOnlineDiagnostic(room, "command-stale", { role, commandType: String(rawCommand.type || ""), reason: "stale revision", baseRevision }); return { ok: false, status: 409, error: "stale revision" }; }\n  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };',
)
replace_once(
    "app/api/rooms/machine.ts",
    '  if (reconnectPause(room)) return { ok: false, status: 409, error: "match paused for reconnect" };\n  if (!AUTHORITATIVE_COMMANDS.has(String(rawCommand.type || ""))) return { ok: false, status: 400, error: "unsupported command" };',
    '  if (reconnectPause(room)) { logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "match paused for reconnect", baseRevision }); return { ok: false, status: 409, error: "match paused for reconnect" }; }\n  if (!AUTHORITATIVE_COMMANDS.has(String(rawCommand.type || ""))) { logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: "unsupported command", baseRevision }); return { ok: false, status: 400, error: "unsupported command" }; }',
)
replace_once(
    "app/api/rooms/machine.ts",
    '  } catch (error) {\n    const message = error instanceof Error ? error.message : "invalid command";\n    return { ok: false, status: 400, error: message };\n  }',
    '  } catch (error) {\n    const message = error instanceof Error ? error.message : "invalid command";\n    logOnlineDiagnostic(room, "command-rejected", { role, commandType: String(rawCommand.type || ""), reason: message, baseRevision });\n    return { ok: false, status: 400, error: message };\n  }',
)

# A recognized retry does not increment revision and therefore must not call the
# optimistic-concurrency write path again. Return the already-persisted room.
replace_once(
    "app/api/rooms/[id]/route.ts",
    '      if (!resolution.ok) return NextResponse.json({ error: resolution.error, ...roomView(room, true, role) }, { status: resolution.status });\n',
    '      if (!resolution.ok) return NextResponse.json({ error: resolution.error, ...roomView(room, true, role) }, { status: resolution.status });\n      if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore);\n',
)

# Lock the duplicate acknowledgement ordering in the source regression.
test_path = Path("tests/online-command-idempotency.test.mjs")
test_text = test_path.read_text(encoding="utf-8")
needle = '''test("room route forwards the stable command id to the authoritative machine", () => {\n  assert.match(route, /applyRulesCommand\\(room, role, body\\.command, body\\.baseRevision, body\\.commandId\\)/);\n});\n'''
addition = needle + '''\ntest("duplicate command acknowledgement returns the persisted room without another storage write", () => {\n  const duplicateIndex = route.indexOf("if (resolution.duplicate) return NextResponse.json(roomView(room, true, role), noStore)");\n  const writeIndex = route.indexOf("await writeRoom(room)", duplicateIndex);\n  assert.ok(duplicateIndex > 0 && writeIndex > duplicateIndex, "duplicate retry must return before the shared write path");\n});\n'''
if test_text.count(needle) != 1:
    raise SystemExit("tests/online-command-idempotency.test.mjs: route test anchor mismatch")
test_path.write_text(test_text.replace(needle, addition, 1), encoding="utf-8")

replace_once(
    "docs/online-priority-implementation.md",
    '- Every modern Online command may carry a stable client command id; the server remembers the last 32 accepted ids per participant and acknowledges a retransmission before stale-revision validation, preventing a lost HTTP response or retry from applying the same action twice.\n',
    '- Every modern Online command may carry a stable client command id; the server remembers the last 32 accepted ids per participant and acknowledges a retransmission before stale-revision validation, preventing a lost HTTP response or retry from applying the same action twice. Duplicate acknowledgements return the already-persisted room directly instead of attempting another optimistic-concurrency write.\n- Privacy-safe server diagnostics now log only timing metadata for stale/duplicate/rejected commands and automatic response, blocker, turn or reconnect timeouts. Raw commands, targets, card ids, hidden zones and participant tokens are never included.\n',
)
