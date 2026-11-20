// Settings → Diagnostics: live status of every moving part (League client, Live Client API, window
// mode, hotkeys, HUD layer, augment OCR, stats sources, storage), the backend's event log, a
// redacted "Copy diagnostics" report, and augment-detection calibration (test scan with a
// screenshot preview, scan region + badge offset with a live preview on the in-game layer).

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BUILD, DEFAULT_SETTINGS, actions, getState, useApp, type Settings } from "../app/store";
import {
  getAppInfo,
  getDiagnostics,
  getHudPreview,
  isTauri,
  leagueWindowMode,
  on,
  openDataDir,
  setHudPreview,
  testAugmentScan,
  type AppInfo,
  type Diagnostics,
  type LeagueWindowMode,
  type ScanDebugPayload,
} from "../bridge";
import { ago, buildReport, providerStatus, windowModeLevel, type Level, type StatusRow } from "../app/diagnostics";
import { AUGMENTS } from "../engine/augments";
import { matchAugments, type OcrMatch } from "../engine/ocrMatch";
import { Card, Empty, Toggle } from "../ui/controls";
import { Icon } from "../ui/icons";
import { toast } from "../ui/Toasts";
import "./diagnostics.css";

const POLL_MS = 2000;

function useDiagnostics() {
  const [diag, setDiag] = useState<Diagnostics | null | undefined>(undefined);
  const [mode, setMode] = useState<LeagueWindowMode | null>(null);
  const [info, setInfo] = useState<AppInfo | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      getDiagnostics()
        .then((d) => alive && setDiag(d))
        .catch(() => alive && setDiag(null));
    void load();
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [tick]);
  useEffect(() => {
    let alive = true;
    leagueWindowMode()
      .then((m) => alive && setMode(m))
      .catch(() => alive && setMode({ mode: null }));
    getAppInfo()
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [tick]);
  return { diag, mode, info, refresh: () => setTick((t) => t + 1) };
}

/** Riot IDs of the players in the current game (stripped from the copied report). */
function playerNames(): string[] {
  const s = getState();
  const names = new Set<string>();
  const players = s.live ? [s.live.me, ...s.live.allies, ...s.live.enemies] : [];
  for (const p of players) {
    if (!p.riotId) continue;
    names.add(p.riotId);
    names.add(p.riotId.split("#")[0]);
  }
  for (const k of Object.keys(s.scout.profiles)) {
    names.add(k);
    names.add(k.split("#")[0]);
  }
  return [...names].filter((n) => n.length >= 2);
}

function Dot({ level }: { level: Level }) {
  return <span className={`diag-dot diag-${level}`} aria-label={level} />;
}

const WINDOW_LABEL: Record<string, string> = { borderless: "Borderless", windowed: "Windowed", fullscreen: "Fullscreen", unknown: "Unknown" };

function useRows(diag: Diagnostics | null | undefined, mode: LeagueWindowMode | null, info: AppInfo | null | undefined): StatusRow[] {
  const clientInfo = useApp((s) => s.clientInfo);
  const live = useApp((s) => s.live);
  const hotkeyErrors = useApp((s) => s.hotkeyErrors);
  const cards = useApp((s) => s.cards);
  const scan = useApp((s) => s.scan);
  const autoDetect = useApp((s) => s.settings.autoDetectAugments);
  const desktopOnly = "desktop app only";
  const rows: StatusRow[] = [];
  const now = Date.now();

  // League client
  if (!diag) rows.push({ id: "lcu", label: "League client", level: "off", value: desktopOnly });
  else {
    const parts = [diag.lcu.connected ? "Connected" : "Not found"];
    if (clientInfo?.phase) parts.push(`phase ${clientInfo.phase}`);
    if (clientInfo?.region || clientInfo?.platformId) parts.push(`region ${clientInfo.region ?? clientInfo.platformId}`);
    rows.push({
      id: "lcu",
      label: "League client",
      level: diag.lcu.connected ? "ok" : "warn",
      value: parts.join(" · "),
      hint: diag.lcu.connected ? undefined : "Start League. If it's running and still not found, set the League folder in General.",
    });
  }

  // Live Client API
  if (!diag) rows.push({ id: "live", label: "Live game API", level: "off", value: desktopOnly });
  else {
    const l = diag.live;
    const last = `last data ${ago(l.lastOk, now)}`;
    if (l.inGame) rows.push({ id: "live", label: "Live game API", level: live ? "ok" : "warn", value: `In game · ${last}`, hint: live ? undefined : "Data arrives but the app hasn't parsed a game yet." });
    else if (l.reachable)
      rows.push({ id: "live", label: "Live game API", level: l.lastError ? "warn" : "ok", value: `Answering (loading screen / not spawned)${l.lastError ? ` · ${l.lastError}` : ""} · ${last}` });
    else rows.push({ id: "live", label: "Live game API", level: "off", value: `No game running · ${last}${l.lastError ? ` · ${l.lastError}` : ""}` });
  }

  // Window mode
  const m = mode?.mode ?? null;
  rows.push({
    id: "window",
    label: "Game window mode",
    level: windowModeLevel(m),
    value: m ? `${WINDOW_LABEL[m] ?? m}${mode?.source ? ` (from ${mode.source})` : ""}` : isTauri ? "Unknown (League not found)" : desktopOnly,
    hint: m === "fullscreen" ? "Overlays can't draw over Fullscreen. In League: Settings → Video → Window Mode → Borderless." : undefined,
  });

  // Hotkeys
  if (!diag) rows.push({ id: "hotkeys", label: "Hotkeys", level: hotkeyErrors.length ? "warn" : "off", value: hotkeyErrors.length ? hotkeyErrors.join("; ") : desktopOnly });
  else {
    const failed = diag.hotkeys.filter((h) => !h.registered);
    const unreachable = failed.filter((h) => !h.polled);
    const level: Level = unreachable.length ? "bad" : failed.length ? "warn" : diag.hotkeys.length ? "ok" : "off";
    const value = !diag.hotkeys.length
      ? "None set"
      : failed.length
        ? `${diag.hotkeys.length - failed.length}/${diag.hotkeys.length} registered · ${failed.map((h) => `${h.combo} ${h.polled ? "(key poller only)" : "(not working)"}`).join(", ")}`
        : `All ${diag.hotkeys.length} registered${diag.pollerFallback ? " + key poller (works while League is focused)" : ""}`;
    rows.push({
      id: "hotkeys",
      label: "Hotkeys",
      level,
      value,
      hint: failed.length ? "Another app owns that combo. It may still work in game via the poller; pick another combo in Hotkeys to be sure." : undefined,
    });
  }

  // HUD layer
  if (!diag) rows.push({ id: "hud", label: "In-game HUD layer", level: "off", value: desktopOnly });
  else {
    const h = diag.hud;
    const stuck = !h.editing && !h.clickThrough;
    rows.push({
      id: "hud",
      label: "In-game HUD layer",
      level: stuck ? "bad" : h.editing || h.preview ? "warn" : "ok",
      value: [h.visible ? "Visible" : "Hidden", h.editing ? "edit mode (takes the mouse)" : "click-through", h.enabled ? "HUD on" : "HUD off", h.preview ? "calibration preview on" : ""].filter(Boolean).join(" · "),
      hint: h.visible ? undefined : "Shown automatically in game (or while editing / previewing).",
    });
  }

  // Augment auto-detect
  const matched = (cards.length ? cards : (scan.matches ?? [])).map((c) => c.augment.name);
  if (!diag) rows.push({ id: "ocr", label: "Augment auto-detect", level: "off", value: desktopOnly });
  else {
    const a = diag.augment;
    const sc = diag.scan;
    const waiting = !a.autoDetect ? "off in settings" : !a.inGame ? "waiting for a game" : !a.modeHasAugments ? "paused: this mode has no augments" : !a.gameInFront ? "paused: League isn't in front" : "scanning every ~1.2 s";
    const last = sc.lastAt ? `last scan ${ago(sc.lastAt, now)} · ${sc.lines} lines · ${sc.millis} ms` : "no scan yet";
    const errNewer = sc.lastError && (sc.lastErrorAt ?? 0) >= (sc.lastAt ?? 0);
    rows.push({
      id: "ocr",
      label: "Augment auto-detect",
      level: !a.ocrAvailable ? "bad" : errNewer ? "bad" : !autoDetect ? "off" : "ok",
      value: `${waiting} · ${last}${matched.length ? ` · matched: ${matched.join(", ")}` : ""}${errNewer ? ` · error: ${sc.lastError}` : ""}`,
      hint: !a.ocrAvailable ? "Screen OCR uses Windows' built-in engine (Windows only)." : errNewer ? "Use Test augment detection below to see what the scan reads." : undefined,
    });
  }

  // Storage
  if (info === null || !diag) rows.push({ id: "data", label: "Data folder", level: "off", value: "browser local storage (dev)" });
  else if (info) {
    rows.push({
      id: "data",
      label: "Data folder",
      level: !diag.storage.writable ? "bad" : info.portable ? "ok" : "warn",
      value: `${info.dataDir} · ${diag.storage.writable ? "writable" : "NOT writable"} · ${info.portable ? "portable" : "fallback (user profile)"}`,
      hint: !diag.storage.writable ? "Nexis can't save settings. Move the Nexis folder somewhere you can write to." : info.portable ? undefined : "The folder next to the exe isn't writable, so data went to your user profile.",
    });
  }

  rows.push({
    id: "version",
    label: "App version",
    level: "ok",
    value: `${info?.version ? `v${info.version}` : "dev"} · build ${BUILD.sha.slice(0, 7)}${BUILD.date ? ` · ${BUILD.date.slice(0, 10)}` : ""}${diag ? ` · ${diag.platform}` : ""}`,
  });
  return rows;
}

export function DiagnosticsSection() {
  const { diag, mode, info, refresh } = useDiagnostics();
  const rows = useRows(diag, mode, info);
  const providers = useMemo(() => providerStatus(diag?.fetch ?? {}), [diag]);
  const webStatus = useApp((s) => s.web.status);
  const webError = useApp((s) => s.web.error);

  const copy = async () => {
    const s = getState();
    const extra = [
      `Mode setting: ${s.settings.mode} (last ${s.settings.lastMode}) · queue ${s.clientInfo?.queueId ?? "–"} · gameMode ${s.clientInfo?.gameMode ?? s.live?.gameMode ?? "–"}`,
      `Scan region: x ${s.settings.scanRegion.x} y ${s.settings.scanRegion.y} w ${s.settings.scanRegion.w} h ${s.settings.scanRegion.h} · badge offset ${s.settings.badgeOffset}`,
      `Hotkeys: ${diag?.hotkeys.map((h) => `${h.action}=${h.combo}${h.registered ? "" : ` [${h.error ?? "not registered"}${h.polled ? ", polled" : ""}]`}`).join(" | ") ?? "–"}`,
      `Web stats: ${s.settings.webStats ? webStatus : "off"}${webError ? ` (${webError})` : ""} · game data ${s.data?.version ?? "–"}`,
      `Window: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio} · screen ${screen.width}x${screen.height}`,
      `Log file: ${diag?.logFile ?? "–"}`,
    ];
    const text = buildReport({
      version: info?.version ?? "dev",
      sha: BUILD.sha,
      platform: diag?.platform ?? navigator.userAgent,
      rows,
      providers,
      log: diag?.log ?? [],
      extra,
      names: playerNames(),
    });
    try {
      await navigator.clipboard.writeText(text);
      toast("Diagnostics copied", "good", { id: "diag", detail: "No names or Riot IDs included. Paste it into your bug report." });
    } catch {
      toast("Couldn't copy to the clipboard", "bad", { id: "diag" });
    }
  };

  return (
    <>
      <Card
        title="Status"
        icon="info"
        className="span-2 diag-card"
        extra={
          <div className="diag-actions">
            <button type="button" className="btn btn-sm" onClick={copy}>
              <Icon name="check" size={13} />
              Copy diagnostics
            </button>
            {isTauri && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void openDataDir().catch((e) => toast(`Couldn't open the folder: ${e}`, "bad"))}>
                <Icon name="folder" size={13} />
                Open data folder
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
              <Icon name="refresh" size={13} />
            </button>
          </div>
        }
      >
        {!isTauri && !diag && <p className="dim small no-margin">Running in a browser: backend checks are only available in the desktop app.</p>}
        <ul className="diag-rows">
          {rows.map((r) => (
            <li key={r.id} className="diag-row" data-diag={r.id}>
              <Dot level={r.level} />
              <span className="diag-label">{r.label}</span>
              <span className="diag-value">
                {r.value}
                {r.hint && <span className="diag-hint">{r.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Stats sources" icon="tiers" className="diag-card">
        <ul className="diag-rows diag-rows-compact">
          {providers.map((p) => (
            <li key={p.id} className="diag-row">
              <Dot level={p.level} />
              <span className="diag-label">{p.label}</span>
              <span className="diag-value">{p.value}</span>
            </li>
          ))}
        </ul>
      </Card>
      <LogCard diag={diag} />
      <CalibrationCard />
    </>
  );
}

function LogCard({ diag }: { diag: Diagnostics | null | undefined }) {
  const entries = [...(diag?.log ?? [])].reverse();
  return (
    <Card title="Event log" icon="history" className="diag-card" extra={<span className="dim small">{diag ? `${diag.log.length} / 200` : ""}</span>}>
      {entries.length ? (
        <ol className="diag-log mono">
          {entries.map((e, i) => (
            <li key={`${e.t}-${i}`} className={`diag-log-${e.level}`}>
              <time>{new Date(e.t).toLocaleTimeString()}</time>
              <span className="diag-log-area">{e.area}</span>
              <span className="diag-log-msg">{e.msg}</span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty compact icon="history" title={diag ? "Nothing logged yet" : "Desktop app only"}>
          {diag ? "Connection changes, fetch errors and scans show up here as they happen." : "The event log is recorded by the desktop app, not the browser preview."}
        </Empty>
      )}
      {diag?.logFile && <p className="dim small no-margin">Also saved to {diag.logFile} (512 KB, rotated).</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ augment calibration

const pct = (v: number) => `${Math.round(v * 100)}%`;

function MiniSlider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-top">
        <span className="field-label">{label}</span>
        <span className="slider-val tnum">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </label>
  );
}

/** Local value committed shortly after the user stops dragging (each save re-registers hotkeys). */
function useCommitted<T>(value: T, commit: (v: T) => void, ms = 200): [T, (v: T) => void] {
  const [local, setLocal] = useState(value);
  const timer = useRef<number | undefined>(undefined);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => setLocal(value), [value]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [
    local,
    (v: T) => {
      setLocal(v);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => commitRef.current(v), ms);
    },
  ];
}

interface TestResult {
  payload: ScanDebugPayload;
  region: Settings["scanRegion"];
  matches: OcrMatch[];
  /** Best augment match per OCR line (same order as the lines), if any. */
  lineHits: Array<string | undefined>;
  at: number;
}

function CalibrationCard() {
  const settings = useApp((s) => s.settings);
  const [region, setRegion] = useCommitted(settings.scanRegion, (scanRegion) => void actions.updateSettings({ scanRegion }));
  const [offset, setOffset] = useCommitted(settings.badgeOffset, (badgeOffset) => void actions.updateSettings({ badgeOffset }));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [preview, setPreview] = useState(false);

  // Mirror the HUD preview state; always switch it off when leaving this section.
  useEffect(() => {
    let alive = true;
    let off: (() => void) | undefined;
    void getHudPreview().then((v) => alive && setPreview(v));
    void on<boolean>("hud-preview", (v) => setPreview(!!v)).then((u) => (alive ? (off = u) : u()));
    return () => {
      alive = false;
      off?.();
      void setHudPreview(false);
    };
  }, []);

  const setR = (k: keyof Settings["scanRegion"], v: number) => {
    const next = { ...region, [k]: v };
    next.w = Math.min(next.w, 1 - next.x);
    next.h = Math.min(next.h, 1 - next.y);
    setRegion(next);
  };

  const test = async () => {
    setBusy(true);
    const used = getState().settings.scanRegion;
    try {
      const payload = await testAugmentScan();
      const lines = payload.ok && payload.scan ? payload.scan.lines : [];
      const matches = matchAugments(lines, AUGMENTS);
      const lineHits = lines.map((l) => matchAugments([l], AUGMENTS)[0]?.augment.name);
      setResult({ payload, region: used, matches, lineHits, at: Date.now() });
    } catch (e) {
      setResult({ payload: { ok: false, error: String(e) }, region: used, matches: [], lineHits: [], at: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  const scan = result?.payload.scan;
  const lineHit = (i: number) => result?.lineHits[i];
  const shown = result?.region ?? region;

  return (
    <Card title="Augment detection calibration" icon="scan" className="span-2 diag-card diag-calib">
      <p className="dim small no-margin">
        Open an augment choice in game (or a screenshot of one, full screen), then run a test. Nexis captures your screen once, shows what it read, and keeps
        nothing. Adjust the region until the augment names sit inside the box.
      </p>
      <div className="diag-calib-grid">
        <div className="diag-calib-view">
          <div className="diag-shot" style={scan?.screen ? { aspectRatio: `${scan.screen[0]} / ${scan.screen[1]}` } : undefined}>
            {scan?.preview ? <img src={scan.preview} alt="Captured screen (downscaled)" /> : <div className="diag-shot-empty">{busy ? "Capturing…" : "No capture yet"}</div>}
            <div className="diag-shot-region" style={{ left: pct(shown.x), top: pct(shown.y), width: pct(shown.w), height: pct(shown.h) }}>
              {scan?.lines.map((l, i) => (
                <span
                  key={i}
                  className={`diag-ocr-box ${lineHit(i) ? "hit" : ""}`}
                  title={lineHit(i) ? `${l.text} → ${lineHit(i)}` : l.text}
                  style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%` }}
                />
              ))}
            </div>
            {result && (
              <div className="diag-shot-current" style={{ left: pct(region.x), top: pct(region.y), width: pct(region.w), height: pct(region.h) }} title="Region after your changes" />
            )}
          </div>
          <div className="diag-calib-buttons">
            <button type="button" className="btn btn-sm" onClick={test} disabled={busy}>
              <Icon name="scan" size={13} />
              {busy ? "Scanning…" : "Test augment detection"}
            </button>
            {result && <span className="dim small">{result.payload.ok && scan ? `${scan.lines.length} lines in ${scan.millis} ms · ${new Date(result.at).toLocaleTimeString()}` : ""}</span>}
          </div>
          {result && !result.payload.ok && (
            <div className="settings-notice" role="alert">
              <Icon name="warning" size={15} />
              <span>{result.payload.error}</span>
            </div>
          )}
          {result?.payload.ok && (
            <div className="diag-ocr">
              <div className="diag-matched">
                <span className="field-label">Matched augments</span>
                {result.matches.length ? (
                  result.matches.map((m) => (
                    <span key={m.augment.name} className="pill pill-teal">
                      {m.augment.name} · {Math.round(m.confidence * 100)}%
                    </span>
                  ))
                ) : (
                  <span className="dim small">None. {scan?.lines.length ? "Text was read but no augment name matched; check the region covers the card titles." : "No text read; the region may be off the cards."}</span>
                )}
              </div>
              {!!scan?.lines.length && (
                <ol className="diag-lines mono">
                  {scan.lines.map((l, i) => (
                    <li key={i} className={lineHit(i) ? "hit" : ""}>
                      {l.text}
                      {lineHit(i) && <span className="diag-line-hit"> → {lineHit(i)}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
        <div className="diag-calib-controls">
          <MiniSlider label="Region left" value={region.x} min={0} max={0.9} step={0.005} format={pct} onChange={(v) => setR("x", v)} />
          <MiniSlider label="Region top" value={region.y} min={0} max={0.9} step={0.005} format={pct} onChange={(v) => setR("y", v)} />
          <MiniSlider label="Region width" value={region.w} min={0.1} max={1} step={0.005} format={pct} onChange={(v) => setR("w", v)} />
          <MiniSlider label="Region height" value={region.h} min={0.1} max={1} step={0.005} format={pct} onChange={(v) => setR("h", v)} />
          <MiniSlider
            label="Badge vertical offset"
            value={offset}
            min={-0.1}
            max={0.1}
            step={0.0025}
            format={(v) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`}
            onChange={setOffset}
          />
          <Toggle
            checked={preview}
            onChange={(v) => {
              setPreview(v);
              void setHudPreview(v);
            }}
            label="Preview on the game screen"
            sub="Draws the region and sample badges on the in-game layer (click-through, turns off after 3 min)"
          />
          <div className="diag-calib-buttons">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void actions.updateSettings({ scanRegion: DEFAULT_SETTINGS.scanRegion, badgeOffset: DEFAULT_SETTINGS.badgeOffset })}
            >
              <Icon name="refresh" size={13} />
              Reset region & offset
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
