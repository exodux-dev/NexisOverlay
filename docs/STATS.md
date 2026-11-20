# Stats dataset (Riot API)

NexisOverlay can show win rates for items, builds, augments, runes and summoner
spells. The numbers come from a JSON file (`StatsDataset`, see
`src/engine/types.ts`) that you build yourself from the **official Riot Games
API** with `scripts/aggregate-stats.ts`. Nothing is scraped from third-party
sites.

## 1. Get a Riot API key

1. Sign in at <https://developer.riotgames.com> with your Riot account.
2. Copy the **Development API Key** from the dashboard (`RGAPI-...`).

Development (and personal) keys **expire every 24 hours**: regenerate the key
on the dashboard before each run, or update the GitHub secret. For an always-on
setup, apply for a Personal or Production key for the project.

Dev keys are limited to 20 requests/second and 100 requests/2 minutes. The
script stays under those limits and honours `429 Retry-After`, so a 300-match
run takes roughly 10 minutes (about twice that with `--timelines`).

## 2. Run the aggregator

```sh
export RIOT_API_KEY=RGAPI-xxxxxxxx
npm run stats:aggregate                       # 300 ARAM Mayhem matches on NA
npx tsx scripts/aggregate-stats.ts --region euw1 --matches 500 --timelines
npx tsx scripts/aggregate-stats.ts --queue 450 --out data/stats/aram.json   # classic ARAM
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--region` | `na1` | Platform: `na1 euw1 eun1 kr jp1 br1 la1 la2 oc1 tr1 ru me1 ph2 sg2 th2 tw2 vn2` |
| `--matches` | `300` | Matches to collect |
| `--queue` | `2400` | Queue id. `2400` = ARAM Mayhem, `450` = ARAM |
| `--out` | `data/stats/aram-mayhem.json` | Output file, written atomically |
| `--timelines` | off | Fetch timelines: purchase-ordered builds, starter items and skill orders (+1 request per match) |
| `--seed-riot-id` | none | Extra seed player, `"Name#TAG"` |
| `--boots-ids` | none | Extra boot item ids, comma-separated (e.g. tier-3 boots) |
| `--augment-names` | none | JSON `{"<id>": "<name>"}` merged over CommunityDragon names |
| `--no-ddragon` | off | Don't use Data Dragon to filter out components/consumables |

How it works: it starts from the region's Challenger ladder (plus the optional
seed player), lists each player's recent matches in the queue, and does a
breadth-first walk through their teammates and opponents until it has enough
matches. Raw match JSON is cached in `scripts/.cache/`, so re-runs only fetch
new games. Progress goes to stderr.

Notes on the data:

- `pickRate` is the share of matches the champion appeared in.
- Without `--timelines`, `builds` are an approximation: the first three
  completed, non-boot items in final inventory slot order. With timelines they
  follow purchase order. `starters` (items bought before 0:60) need timelines.
- `skillOrders` (timelines only) holds the 3 most common max orders of the
  basic abilities, e.g. `{ "order": "QEW", "games": 41, "wins": 23 }`. They
  come from `SKILL_LEVEL_UP` events with `levelUpType: "NORMAL"`; R and
  evolve level-ups are ignored. Abilities are ranked by when they reached 5
  points. If a game ended before an ability was maxed, they are ranked by
  points, then by when they first reached their final count.
- Augment names come from CommunityDragon's arena file. Any id it doesn't know
  is stored as `#<id>`. Pass `--augment-names` to fill the gaps.

## 3. Host the JSON

Any static HTTPS URL works. The easiest is to commit the file and use the raw
GitHub URL:

```
https://raw.githubusercontent.com/<owner>/<repo>/main/data/stats/aram-mayhem.json
```

`.github/workflows/stats.yml` automates this. It runs weekly and on demand
(Actions → "Aggregate ARAM Mayhem stats" → Run workflow, with optional
region, match count and queue). It commits the refreshed file as
`github-actions[bot]`. Add your key as the repository secret `RIOT_API_KEY`.
If the secret is missing, the workflow skips the run. Because dev keys expire
daily, update the secret right before a manual run, or use a Personal or
Production key for the weekly schedule.

## 4. Point the app at it

Open the overlay's **Settings → Stats source URL** and paste the hosted URL.

The dataset is only used in the mode its `queueId` belongs to (`2400` → ARAM
Mayhem, `450` → ARAM, `1700` → Arena, `400/420/430/440/490` → Summoner's Rift;
anything else counts as Mayhem). Other modes fall back to web stats and your
own match history for that mode.

## Riot API terms

Using the API means accepting the
[Riot Developer Terms and API policies](https://developer.riotgames.com/policies/general).
In short: never share or commit your API key, keep to the rate limits, don't
redistribute raw match data beyond what your product needs (the aggregated
JSON contains no player identities), and keep the notice that NexisOverlay
isn't endorsed by Riot Games.
