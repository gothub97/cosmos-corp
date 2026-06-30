/**
 * personalize - substitute player-profile tokens into authored copy.
 *
 * Sage's dialogue and the chapter courses can address the player directly by
 * dropping a token into the markdown source. The tokens are replaced at render
 * time (just before `renderMarkdown`), so the same content file works for every
 * player and stays a no-op until a token is actually used.
 *
 * Supported tokens:
 *   {firstName}  - the player's first name (falls back to "there")
 *   {lastName}   - the player's last name (falls back to "")
 *   {role}       - the player's chosen role (falls back to "new hire")
 *
 * Existing content has no `{...}` sequences, so applying this everywhere is safe.
 */

import type { PlayerProfile } from "../ipc/contract";

const FALLBACKS: Record<string, string> = {
  firstName: "there",
  lastName: "",
  role: "new hire",
};

export function personalize(text: string, profile?: PlayerProfile | null): string {
  return text.replace(/\{(firstName|lastName|role)\}/g, (_match, key: string) => {
    const value = profile?.[key as keyof PlayerProfile];
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || FALLBACKS[key] || "";
  });
}
