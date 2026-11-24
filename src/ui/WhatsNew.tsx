// "What's new" after an update: the changelog entries since the last one you saw. New installs
// skip it (they get the welcome tour) and just remember the current entry.
import { useEffect, useState } from "react";
import { loadStore, saveStore } from "../bridge";
import { CHANGELOG, entriesSince, type ChangelogEntry } from "../data/changelog";

const STORE = "whatsnew.json";

export function WhatsNew() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const latest = CHANGELOG[0]?.id;

  useEffect(() => {
    if (!latest) return;
    let alive = true;
    void (async () => {
      const seen = await loadStore<{ seen?: string }>(STORE);
      if (!alive) return;
      if (!seen) {
        // First run with this feature: only existing users (tour already done) see the news.
        const tour = await loadStore<{ done?: boolean }>("onboarding.json");
        if (!tour?.done) return void saveStore(STORE, { seen: latest });
        return setEntries(CHANGELOG.slice(0, 2));
      }
      if (seen.seen !== latest) setEntries(entriesSince(seen.seen));
    })();
    return () => {
      alive = false;
    };
  }, [latest]);

  if (!entries.length) return null;
  const close = () => {
    setEntries([]);
    void saveStore(STORE, { seen: latest });
  };
  return (
    <div className="ob-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="ob-dialog wn-dialog" role="dialog" aria-modal="true" aria-labelledby="wn-title" onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2 className="wn-title" id="wn-title">
          What's new in Nexis
        </h2>
        <div className="wn-body">
          {entries.map((e) => (
            <section key={e.id} className="wn-entry">
              <h3>{e.title}</h3>
              <ul>
                {e.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="wn-foot">
          <button type="button" className="btn btn-primary btn-sm" onClick={close} autoFocus>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
