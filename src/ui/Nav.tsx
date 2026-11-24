import { displayPatch } from "./format";
import { actions, useApp, type Tab } from "../app/store";
import { Icon, type IconName } from "./icons";

const TABS: Array<{ tab: Tab; label: string; icon: IconName }> = [
  { tab: "home", label: "Home", icon: "home" },
  { tab: "build", label: "Build", icon: "build" },
  { tab: "augments", label: "Augments", icon: "augments" },
  { tab: "guide", label: "Guide", icon: "book" },
  { tab: "tiers", label: "Tiers", icon: "tiers" },
  { tab: "enemies", label: "Players", icon: "enemies" },
  { tab: "history", label: "History", icon: "history" },
];

function NavButton({ tab, label, icon, active, badge }: { tab: Tab; label: string; icon: IconName; active: boolean; badge?: number }) {
  return (
    <button
      type="button"
      className={`nav-btn ${active ? "active" : ""}`}
      onClick={() => actions.setTab(tab)}
      aria-current={active ? "page" : undefined}
      data-tab={tab}
    >
      <span className="nav-icon">
        <Icon name={icon} size={20} />
        {badge ? <span className="nav-badge">{badge}</span> : null}
      </span>
      <span className="nav-label">{label}</span>
    </button>
  );
}

/** Small "Demo" switch above Settings: a sample game to try the overlay. Hidden during a real game
 *  or champ select (the demo also switches itself off when one is detected). */
function DemoToggle() {
  const demo = useApp((s) => s.demo);
  const busy = useApp((s) => !!s.live || !!s.champSelect);
  if (busy) return null;
  return (
    <button
      type="button"
      className={`nav-demo ${demo ? "is-on" : ""}`}
      aria-pressed={demo}
      onClick={() => actions.setDemo(!demo)}
      title={demo ? "Turn off the demo game" : "Try the overlay with a sample in-game state"}
    >
      <span className="nav-demo-dot" />
      Demo
    </button>
  );
}

export function Nav() {
  const tab = useApp((s) => s.tab);
  const offered = useApp((s) => s.offered.length);
  const version = useApp((s) => s.data?.version);
  return (
    <nav className="nav" aria-label="Sections">
      {TABS.map((t) => (
        <NavButton key={t.tab} {...t} active={tab === t.tab} badge={t.tab === "augments" && tab !== "augments" ? offered : undefined} />
      ))}
      <div className="nav-spacer" />
      <DemoToggle />
      <NavButton tab="settings" label="Settings" icon="settings" active={tab === "settings"} />
      {version && <div className="nav-version" title={`Game data ${version}`}>Patch {displayPatch(version)}</div>}
    </nav>
  );
}
