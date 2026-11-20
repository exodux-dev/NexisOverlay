// Screenshots of the champion tier list + champ select helper with REAL parsed tier data.
//   node scripts/screenshot-tiers.mjs <parsed.json> <ddragonDir> [outDir]
// parsed.json: { version, mayhem: ChampionTierRow[], aram: [...], sr: [...] } (from parseTierList on
// saved hexmayhem.com/champions, op.gg/lol/modes/aram and op.gg/lol/champions pages).
// ddragonDir: champion.json, item.json, runesReforged.json, summoner.json, version.txt of a DDragon patch.
// Starts Vite on :1424, writes a temporary dev entry under scripts/, removes both when done.
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  const req = createRequire(join(execSync("npm root -g").toString().trim(), "noop.js"));
  ({ chromium } = req("playwright"));
}

const [parsedPath, ddDir, outArg] = process.argv.slice(2);
if (!parsedPath || !ddDir) {
  console.error("usage: node scripts/screenshot-tiers.mjs <parsed.json> <ddragonDir> [outDir]");
  process.exit(1);
}
const out = outArg ?? "screenshots";
mkdirSync(out, { recursive: true });
const ROOT = resolve(import.meta.dirname, "..");
const ENTRY_HTML = join(ROOT, "scripts", "tiers-dev.html");
const ENTRY_TSX = join(ROOT, "scripts", "tiers-dev.tsx");
const PORT = 1424;

writeFileSync(
  ENTRY_HTML,
  `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Tiers dev</title></head>
<body><div id="root"></div><script type="module" src="/scripts/tiers-dev.tsx"></script></body></html>`,
);
writeFileSync(
  ENTRY_TSX,
  `// TEMPORARY dev entry written by scripts/screenshot-tiers.mjs — deleted after the run.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "../src/ui/theme.css";
import { DEFAULT_SETTINGS, applyTheme } from "../src/app/store";
import { assembleStaticData } from "../src/engine/staticData";
import type { ChampionTierRow, TierMode, TierPosition } from "../src/engine/sources/tierlists";
import type { StaticData } from "../src/engine/types";
import { TierListView } from "../src/views/TierList";
import { ChampSelectHelper } from "../src/views/ChampSelectHelper";
import { GameIcon } from "../src/ui/GameIcon";

const j = (f: string) => fetch("/__tiers/" + f).then((r) => r.json());
const params = new URLSearchParams(location.search);
const scene = params.get("scene") ?? "mayhem";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="topbar" style={{ height: 56, flex: "none", position: "relative" }} />
      <div className="body">
        <nav className="nav" />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function TierScene({ data, rows, mode, status }: { data: StaticData; rows: ChampionTierRow[] | undefined; mode: TierMode; status: "loading" | "ok" | "error" }) {
  const [position, setPosition] = useState<TierPosition>((params.get("pos") as TierPosition) ?? "mid");
  return (
    <TierListView
      mode={mode}
      rows={rows}
      status={status}
      position={position}
      onPosition={setPosition}
      onPick={(id) => console.log("pick", id)}
      onRefresh={() => console.log("refresh")}
      patch={mode === "mayhem" ? "16.22" : "16.23"}
      highlight={params.get("hl") ? [params.get("hl")!] : []}
      data={data}
      error="op.gg answered 503 Service Unavailable."
    />
  );
}

function CsScene({ data, all }: { data: StaticData; all: Record<string, ChampionTierRow[]> }) {
  const c = (id: string) => data.championsById.get(id)!;
  const mode = (params.get("mode") ?? "mayhem") as TierMode;
  const setups: Record<string, { me?: string; team: string[]; bench: string[]; pos?: string }> = {
    mayhem: { me: "Garen", team: ["Garen", "Nami", "Jinx", "Malphite", "Ahri"], bench: ["Yasuo", "Lux", "Sion", "Zed", "Veigar"] },
    aram: { me: "Ezreal", team: ["Ezreal", "Velkoz", "Leona", "Darius", "Sona"], bench: ["Aatrox", "Teemo", "Viktor"] },
    sr: { me: "Garen", team: ["Garen", "LeeSin", "Ahri", "Jinx", "Thresh"], bench: [], pos: "top" },
    keep: { me: "Yasuo", team: ["Yasuo", "Nami", "Jinx", "Malphite", "Ahri"], bench: ["Lux", "Sion", "Zed"] },
  };
  const s = setups[params.get("setup") ?? mode];
  const team = s.team.map(c);
  const bench = s.bench.map(c);
  const me = s.me ? c(s.me) : undefined;
  return (
    <div className="view">
      <div className="cs-panel">
        <div className="cs-group">
          <div className="eyebrow">Your team</div>
          <div className="cs-row">
            {team.map((x) => (
              <div key={x.id} className={"cs-champ " + (x.id === me?.id ? "cs-me" : "")}>
                <GameIcon src={x.icon} name={x.name} size={44} round />
                <span>{x.id === me?.id ? "You" : x.name}</span>
              </div>
            ))}
          </div>
        </div>
        {bench.length > 0 && (
          <div className="cs-group">
            <div className="eyebrow">Bench</div>
            <div className="cs-row">
              {bench.map((x) => (
                <GameIcon key={x.id} src={x.icon} name={x.name} size={34} round className="cs-bench" />
              ))}
            </div>
          </div>
        )}
      </div>
      <ChampSelectHelper
        mode={mode}
        me={me}
        team={team}
        bench={bench}
        rows={params.get("loading") ? undefined : all[mode]}
        myPosition={s.pos}
        data={data}
      />
    </div>
  );
}

async function main() {
  document.documentElement.classList.add("nx-main", "nx-browser");
  applyTheme(DEFAULT_SETTINGS);
  const [version, champs, items, runes, spells, parsed] = await Promise.all([
    fetch("/__tiers/dd/version.txt").then((r) => r.text()),
    j("dd/champion.json"),
    j("dd/item.json"),
    j("dd/runesReforged.json"),
    j("dd/summoner.json"),
    j("parsed.json"),
  ]);
  const data = assembleStaticData(version.trim(), champs.data, items.data, runes, spells.data);
  // Other files may hot-reload while shooting; reuse the root instead of creating a second one.
  const w = window as unknown as { __root?: ReturnType<typeof createRoot> };
  const root = (w.__root ??= createRoot(document.getElementById("root")!));
  const [kind, mode] = scene.split(":") as [string, TierMode];
  root.render(
    <Shell>
      {kind === "cs" ? (
        <CsScene data={data} all={parsed} />
      ) : (
        <TierScene
          data={data}
          mode={mode ?? "mayhem"}
          rows={kind === "loading" || kind === "error" ? undefined : parsed[mode ?? "mayhem"]}
          status={kind === "loading" ? "loading" : kind === "error" ? "error" : "ok"}
        />
      )}
    </Shell>,
  );
  (window as unknown as { __ready: boolean }).__ready = true;
}
void main();
`,
);

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: true });
const cleanup = () => {
  try {
    process.kill(-vite.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  rmSync(ENTRY_HTML, { force: true });
  rmSync(ENTRY_TSX, { force: true });
};
process.on("SIGINT", () => (cleanup(), process.exit(130)));

try {
  await new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error("vite did not start")), 30000);
    const on = (b) => {
      if (/Local:|ready in/i.test(b.toString())) (clearTimeout(t), ok());
    };
    vite.stdout.on("data", on);
    vite.stderr.on("data", (b) => process.stderr.write(b));
    vite.on("exit", (c) => fail(new Error(`vite exited ${c}`)));
  });

  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy, bypass: "localhost,127.0.0.1" } } : {});
  const files = { "parsed.json": resolve(parsedPath) };
  for (const f of ["champion.json", "item.json", "runesReforged.json", "summoner.json", "version.txt"]) files[`dd/${f}`] = join(resolve(ddDir), f);

  const shoot = async (name, query, opts = {}) => {
    try {
      await shootOnce(name, query, opts);
    } catch (e) {
      console.error("retrying", name, e.message.split("\n")[0]);
      await shootOnce(name, query, opts);
    }
  };
  const shootOnce = async (name, query, { width = 1180, height = 760, before, full = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
    await ctx.route(`http://localhost:${PORT}/__tiers/**`, (r) => {
      const key = new URL(r.request().url()).pathname.replace("/__tiers/", "");
      r.fulfill({ status: 200, body: readFileSync(files[key]), contentType: key.endsWith(".json") ? "application/json" : "text/plain" });
    });
    try {
      await capture(ctx, name, query, before, full);
    } finally {
      await ctx.close();
    }
  };
  const capture = async (ctx, name, query, before, full) => {
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror", e.message));
    page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
    await page.goto(`http://localhost:${PORT}/scripts/tiers-dev.html?${query}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    await page.waitForLoadState("networkidle");
    if (before) await before(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `tiers-${name}.png`), fullPage: full });
    console.log("wrote", join(out, `tiers-${name}.png`));
  };
  const table = (page) => page.getByRole("radio", { name: "Table" }).click();

  await shoot("mayhem", "scene=tier:mayhem&hl=Garen");
  await shoot("mayhem-hover", "scene=tier:mayhem", { before: (p) => p.locator(".tl-champ").nth(2).hover() });
  await shoot("aram", "scene=tier:aram");
  await shoot("aram-table", "scene=tier:aram", { before: table });
  await shoot("sr-top", "scene=tier:sr&pos=top");
  await shoot("sr-adc-table", "scene=tier:sr&pos=adc", {
    before: async (p) => {
      await table(p);
      await p.getByRole("button", { name: /Ban/ }).click();
    },
  });
  await shoot("sr-search", "scene=tier:sr&pos=jungle", { before: (p) => p.getByLabel("Search champions").fill("le") });
  await shoot("loading", "scene=loading:aram");
  await shoot("error", "scene=error:sr");
  await shoot("mayhem-900", "scene=tier:mayhem", { width: 900, height: 600 });
  await shoot("sr-table-900", "scene=tier:sr&pos=support", { width: 900, height: 600, before: table });
  await shoot("cs-mayhem", "scene=cs&mode=mayhem");
  await shoot("cs-aram", "scene=cs&mode=aram");
  await shoot("cs-keep", "scene=cs&mode=mayhem&setup=keep");
  await shoot("cs-sr", "scene=cs&mode=sr");
  await shoot("cs-loading", "scene=cs&mode=aram&loading=1");
  await shoot("cs-mayhem-900", "scene=cs&mode=mayhem", { width: 900, height: 600 });
  await shoot("cs-sr-900", "scene=cs&mode=sr", { width: 900, height: 600 });
  await browser.close();
} finally {
  cleanup();
}
