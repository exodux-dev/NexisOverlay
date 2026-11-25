// Discord status text from the app state (pure, tested) + the hook that sends it (main window).
import { useEffect, useRef } from "react";
import * as bridge from "../bridge";
import type { Derived } from "./store";
import { MODE_LABEL, useApp } from "./store";

export interface DiscordActivity {
  details?: string;
  state?: string;
  start?: number;
}

/** What to show on Discord, or null to clear it. */
export function discordActivity(d: Pick<Derived, "mode" | "game" | "gameMode" | "baseChampion">, now = Date.now()): DiscordActivity | null {
  const mode = MODE_LABEL[d.gameMode];
  if (d.mode === "live" && d.game) {
    const champ = d.baseChampion?.name ?? d.game.me.championName;
    return { details: `Playing ${champ}`, state: `${mode} · with Nexis`, start: Math.floor(now / 1000 - (d.game.gameTime ?? 0)) };
  }
  if (d.mode === "champselect") return { details: "In champ select", state: `${mode} · with Nexis` };
  return null;
}

/** Sends the status when it changes (at most every 15 s, Discord's rate limit is 5 per 20 s). */
export function useDiscordStatus(d: Derived) {
  const cfg = useApp((s) => s.settings.discord);
  const last = useRef<string>("");
  const timer = useRef<number | undefined>(undefined);
  const act = cfg.enabled && cfg.appId ? discordActivity(d) : null;
  // The start time drifts a second per poll: only the text decides whether to resend.
  const sig = cfg.enabled && cfg.appId ? `${cfg.appId}|${act ? `${act.details}|${act.state}` : "none"}` : "off";
  useEffect(() => {
    if (sig === last.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      last.current = sig;
      if (sig === "off") void bridge.discordDisconnect().catch(() => {});
      else void bridge.discordSetActivity(cfg.appId, act).catch(() => {});
    }, last.current ? 15_000 : 1_000);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
