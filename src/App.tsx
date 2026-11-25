import { Suspense, lazy, useEffect, useState, type ComponentType } from "react";
import { useDiscordStatus } from "./app/discordStatus";
import { setLanguage } from "./i18n";
import { actions, getState, useApp, useDerived, useLeagueAutoImport, useMigrateBuildChoice, type Derived, type Tab } from "./app/store";
import { opggPosition } from "./engine/sources/opgg";
import * as bridge from "./bridge";
import { ChampSelectMini } from "./views/ChampSelectMini";
import { CommandPalette } from "./ui/CommandPalette";
import { PostGameSummary } from "./views/PostGame";
import { TierListView } from "./views/TierList";
import { Spinner } from "./ui/controls";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Icon } from "./ui/icons";
import { Nav } from "./ui/Nav";
import { Onboarding } from "./ui/Onboarding";
import { WhatsNew } from "./ui/WhatsNew";
import { TitleTips } from "./ui/TitleTips";
import { Toasts } from "./ui/Toasts";
import { Logo, TopBar } from "./ui/TopBar";
import { ResizeGrips, useEscToHide } from "./ui/WindowControls";
import { AugmentsView } from "./views/Augments";
import { BuildView } from "./views/Build";
import { EnemiesView } from "./views/Enemies";
import { HistoryView } from "./views/History";
import { HomeView } from "./views/Home";
import { SettingsView } from "./views/Settings";

// The Guide view is developed separately; glob-import it so the app still builds if it's absent.
const guideModules = import.meta.glob<{ default: ComponentType }>("./views/Guide.tsx");
const guideLoader = guideModules["./views/Guide.tsx"];
const Guide = guideLoader ? lazy(guideLoader) : null;

function GuideView() {
  if (!Guide) return <div className="view dim">The guide isn't available in this build.</div>;
  return (
    <Suspense
      fallback={
        <div className="view">
          <Spinner />
        </div>
      }
    >
      <Guide />
    </Suspense>
  );
}

function TiersTab({ d }: { d: Derived }) {
  const mode = d.gameMode;
  const tl = useApp((s) => s.tierLists[mode]);
  const pos = useApp((s) => s.tierPosition ?? opggPosition(s.lastPosition) ?? "mid");
  useEffect(() => {
    void actions.loadTierList(mode);
  }, [mode]);
  return (
    <TierListView
      mode={mode}
      rows={tl?.rows}
      status={tl?.status ?? "loading"}
      error={tl?.error}
      patch={tl?.patch}
      position={pos}
      onPosition={actions.setTierPosition}
      onPick={(id) => {
        actions.setExploreChampion(id);
        actions.setTab("build");
      }}
      onRefresh={() => void actions.loadTierList(mode, true)}
      highlight={d.baseChampion ? [d.baseChampion.id] : []}
    />
  );
}

function View({ tab, d }: { tab: Tab; d: Derived }) {
  switch (tab) {
    case "home":
      return <HomeView d={d} />;
    case "build":
      return <BuildView d={d} />;
    case "augments":
      return <AugmentsView d={d} />;
    case "guide":
      return <GuideView />;
    case "tiers":
      return <TiersTab d={d} />;
    case "enemies":
      return <EnemiesView d={d} />;
    case "history":
      return <HistoryView />;
    case "settings":
      return <SettingsView />;
  }
}

function Loading() {
  const msg = useApp((s) => s.loadingMsg);
  return (
    <div className="center-state">
      <div className="loader">
        <span className="loader-ring" />
        <Logo />
      </div>
      <p className="center-msg">{msg}</p>
    </div>
  );
}

function Failure() {
  const error = useApp((s) => s.error);
  return (
    <div className="center-state">
      <div className="error-card">
        <span className="error-icon">
          <Icon name="warning" size={22} />
        </span>
        <h2>Something went wrong</h2>
        <p>{error ?? "Unknown error."}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    </div>
  );
}

/** Home is for when nothing is running: once champ select, a live game or the demo starts, show the build. */
function useLeaveHomeForGame(ready: boolean, mode: Derived["mode"]) {
  useEffect(() => {
    if (ready && mode !== "explore" && getState().tab === "home") actions.setTab("build");
  }, [ready, mode]);
}

/** The window is showing the compact champ-select view (backend `mini-mode` events). */
function useMiniMode(): boolean {
  const [mini, setMini] = useState(false);
  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    void bridge.on<boolean>("mini-mode", (v) => setMini(!!v)).then((u) => {
      if (alive) off = u;
      else u();
    });
    void bridge.getMiniMode().then((v) => alive && setMini(v));
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return mini;
}

export default function App() {
  const status = useApp((s) => s.status);
  const tab = useApp((s) => s.tab);
  const derived = useDerived();
  useLeagueAutoImport(derived);
  useMigrateBuildChoice(derived);
  useEscToHide();
  useDiscordStatus(derived);
  // Main window on top of other windows only when asked (Settings → General); off by default.
  // The compact champ-select window always stays on top: it sits beside the League client and is
  // only useful while visible (it would otherwise open behind the client).
  const onTop = useApp((s) => s.settings.alwaysOnTop);
  const miniOn = useMiniMode();
  useEffect(() => {
    if (status === "ready") void bridge.setAlwaysOnTop(onTop || miniOn).catch(() => {});
  }, [onTop, miniOn, status]);
  useLeaveHomeForGame(status === "ready", derived.mode);

  const ready = status === "ready";
  const postGame = useApp((s) => s.postGame);
  // Language: set before rendering; the keys below remount the UI when it changes.
  const lang = useApp((s) => s.settings.language);
  setLanguage(lang);
  const mini = miniOn;
  if (mini)
    return (
      <div className="shell shell-mini">
        <ChampSelectMini d={ready ? derived : null} />
      </div>
    );
  return (
    <div className="shell">
      <TopBar key={`top-${lang}`} derived={ready ? derived : null} />
      {status === "loading" && <Loading />}
      {status === "error" && <Failure />}
      {ready && (
        <div className="body" key={`body-${lang}`}>
          <Nav />
          <main className="content" key={tab}>
            <ErrorBoundary label={tab}>
              <View tab={tab} d={derived} />
            </ErrorBoundary>
          </main>
        </div>
      )}
      {ready && <Onboarding />}
      {ready && <WhatsNew />}
      <TitleTips />
      {ready && postGame && (
        <PostGameSummary
          record={postGame}
          onClose={actions.dismissPostGame}
          onOpenHistory={() => {
            actions.dismissPostGame();
            actions.setTab("history");
          }}
        />
      )}
      <Toasts />
      {ready && <CommandPalette />}
      <ResizeGrips />
    </div>
  );
}
