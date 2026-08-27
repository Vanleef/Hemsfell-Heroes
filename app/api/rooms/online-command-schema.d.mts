export type OnlineClientCommand = { type: string; [key: string]: any };
export type OnlineCommandParseResult =
  | { ok: true; command: OnlineClientCommand }
  | { ok: false; code: "INVALID_RULES_COMMAND" | "UNSUPPORTED_RULES_COMMAND"; error: string };
export const ONLINE_CLIENT_COMMAND_TYPES: readonly string[];
export const STRIPPED_AUTHORITY_FIELDS: readonly string[];
export function parseOnlineCommand(input: unknown): OnlineCommandParseResult;
