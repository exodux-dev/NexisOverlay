// Build order card: "Share" copies a build code (champion + mode + role + style + picks),
// "Paste code" imports one from a friend. No server: the code holds everything.
import { useState } from "react";
import { actions, MODE_LABEL, type Derived } from "../app/store";
import { encodeBuild } from "../engine/shareCode";
import { toast } from "./Toasts";

export function ShareBuildButtons({ d }: { d: Derived }) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const c = d.baseChampion;
  if (!c) return null;

  const share = async () => {
    const code = encodeBuild({ champion: c.id, mode: d.gameMode, position: d.gameMode === "sr" ? d.position : undefined, style: d.variant?.id, choice: d.choice ?? {} });
    try {
      await navigator.clipboard.writeText(code);
      toast(`${c.name} build code copied`, "info", { id: "share-build", detail: "Send it to a friend: they paste it with “Paste code” on the Build tab." });
    } catch {
      // Clipboard blocked: show the code so it can be copied by hand.
      setText(code);
      setPasting(true);
    }
  };
  const doImport = () => {
    const r = actions.importBuildCode(text);
    if (!r.ok) return void toast(r.error, "warn", { id: "share-build" });
    toast(`Imported ${r.champion} build`, "info", { id: "share-build", detail: r.mode !== d.gameMode ? `Saved for ${MODE_LABEL[r.mode]} — it shows when you play that mode.` : "Your picks for this champion were updated." });
    setText("");
    setPasting(false);
  };

  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => void share()} title="Copy a code with this build's picks to share">
        Share
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPasting((v) => !v)} aria-expanded={pasting} title="Import a build code from a friend">
        Paste code
      </button>
      {pasting && (
        <form
          className="share-paste"
          onSubmit={(e) => {
            e.preventDefault();
            doImport();
          }}
        >
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="NX1-…" aria-label="Build code" spellCheck={false} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={!text.trim()}>
            Import
          </button>
        </form>
      )}
    </>
  );
}
