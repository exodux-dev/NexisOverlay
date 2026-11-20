// "Import to League" — opt-in: writes the recommended rune page + item set into the League
// *client* (never the game). Off by default; enabled in Settings → General → League client.

import { useEffect, useState } from "react";
import { actions, useApp } from "../app/store";
import { lcuStatus } from "../bridge";
import { Spinner } from "./controls";
import { Icon } from "./icons";
import { Tip } from "./Tip";
import "./import-league.css";

/** Whether the League client is reachable (polled every 10 s while mounted; cheap on the backend). */
export function useLeagueClientConnected(): boolean {
  const [connected, setConnected] = useState(false);
  const inChampSelect = useApp((s) => !!s.champSelect);
  const phase = useApp((s) => s.clientInfo?.phase);
  useEffect(() => {
    let alive = true;
    const check = () => {
      // Nothing to show while the overlay is closed: check again when it's shown.
      if (document.hidden) return;
      void lcuStatus()
        .then((st) => alive && setConnected(!!st?.connected))
        .catch(() => alive && setConnected(false));
    };
    check();
    const t = setInterval(check, 10_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [inChampSelect, phase]);
  return connected || inChampSelect;
}

export function ImportToLeagueButton() {
  const li = useApp((s) => s.settings.leagueImport);
  const connected = useLeagueClientConnected();
  const [busy, setBusy] = useState(false);
  const enabled = li.runes || li.itemSets;
  const what = [li.runes && "rune page", li.itemSets && "item set"].filter(Boolean).join(" + ");

  let tip: string;
  if (!connected) tip = "Open the League client to import. Nexis writes a rune page and an item set to the client — never to the game.";
  else if (!enabled) tip = "Off by default. Turn it on in Settings → General → League client.";
  else tip = `Writes the ${what} for this champion into the League client (replaces only pages / sets named "Nexis: …").`;

  const onClick = async () => {
    if (!enabled) {
      actions.setTab("settings");
      return;
    }
    setBusy(true);
    try {
      await actions.importToLeague();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tip content={tip}>
      <button
        type="button"
        className={`btn btn-sm import-league ${enabled && connected ? "import-league-ready" : ""}`}
        disabled={!connected || busy}
        aria-disabled={!connected || busy}
        onClick={() => void onClick()}
        data-testid="import-league"
      >
        {busy ? <Spinner size={13} /> : <Icon name="external" size={13} />}
        {busy ? "Importing…" : "Import to League"}
      </button>
    </Tip>
  );
}
