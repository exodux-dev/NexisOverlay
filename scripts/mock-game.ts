// Fake Riot Live Client Data API for developing/testing without launching League.
//
//   npx tsx scripts/mock-game.ts [--end-after 90] [--result Win|Lose]
//
// Serves https://127.0.0.1:2999/liveclientdata/allgamedata (self-signed cert, like the real
// client) with a demo ARAM Mayhem game whose clock and gold advance in real time.
// With --end-after, a GameEnd event is emitted (so match history recording can be tested)
// and the server stops answering 10 s later, like the real client after a game.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { demoAllGameData } from "../src/dev/fixture";

const { values } = parseArgs({
  options: {
    "end-after": { type: "string" },
    result: { type: "string", default: "Win" },
    port: { type: "string", default: "2999" },
  },
});

const dir = join(import.meta.dirname, ".cache");
mkdirSync(dir, { recursive: true });
const key = join(dir, "mock-key.pem");
const cert = join(dir, "mock-cert.pem");
if (!existsSync(key) || !existsSync(cert)) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "365", "-subj", "/CN=127.0.0.1"], { stdio: "ignore" });
}

const started = Date.now();
const endAfter = values["end-after"] ? Number(values["end-after"]) : undefined;
const base = demoAllGameData() as Record<string, any>;

const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  const elapsed = (Date.now() - started) / 1000;
  if (endAfter !== undefined && elapsed > endAfter + 10) {
    res.writeHead(404).end();
    return;
  }
  if (req.url?.startsWith("/liveclientdata/allgamedata")) {
    const body = structuredClone(base);
    body.gameData.gameTime = (base.gameData.gameTime ?? 0) + elapsed;
    body.activePlayer.currentGold = Math.round((base.activePlayer.currentGold ?? 0) + elapsed * 4.5);
    if (endAfter !== undefined && elapsed > endAfter) {
      body.events = { Events: [...(base.events?.Events ?? []), { EventID: 99, EventName: "GameEnd", EventTime: body.gameData.gameTime, Result: values.result }] };
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
    return;
  }
  res.writeHead(404).end();
});

server.listen(Number(values.port), "127.0.0.1", () => {
  console.log(`Mock Live Client API on https://127.0.0.1:${values.port}/liveclientdata/allgamedata`);
  if (endAfter !== undefined) console.log(`Game ends (${values.result}) after ${endAfter}s`);
});
