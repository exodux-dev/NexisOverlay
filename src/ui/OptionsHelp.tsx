import { Tip } from "./Tip";
import { t as tx } from "../i18n";
import "./build-options.css";

/** Compact "?" explaining how the option lists are ranked (Recommended vs Most played). */
export function OptionsHelp({ top4, note }: { top4?: boolean; note?: string }) {
  const rate = top4 ? "top-4 rate" : "win rate";
  return (
    <Tip
      content={
        <div className="bo-help-tip">
          <p>
            <b>Recommended</b> — the highest {rate} among builds with at least 3% of games.
          </p>
          <p>
            <b>Most played</b> — the option picked in the most games.
          </p>
          {note && <p className="bo-help-note">{note}</p>}
          <p className="bo-help-note">{tx("Your pick is saved per champion and mode.")}</p>
        </div>
      }
    >
      <span className="bo-help" tabIndex={0} role="img" aria-label={`How options are ranked: Recommended is the highest ${rate} among builds with at least 3% of games; Most played is the option picked in the most games.`}>
        ?
      </span>
    </Tip>
  );
}
