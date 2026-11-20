// Sample in-game state for demo mode (and screenshots). Items are resolved by
// name against the loaded Data Dragon data so ids/icons always match the patch.

import { findChampion, findItem } from "../engine/staticData";
import type { GameSnapshot, PlayerItem, PlayerState, StaticData } from "../engine/types";

interface DemoPlayer {
  champ: string;
  level: number;
  items: string[];
  kda: [number, number, number];
}

const ME: DemoPlayer = { champ: "Ahri", level: 11, items: ["Luden's Echo", "Sorcerer's Shoes", "Fiendish Codex"], kda: [4, 2, 9] };

const ALLIES: DemoPlayer[] = [
  { champ: "Jinx", level: 11, items: ["Infinity Edge", "Berserker's Greaves"], kda: [6, 3, 5] },
  { champ: "Leona", level: 10, items: ["Locket of the Iron Solari", "Plated Steelcaps"], kda: [1, 4, 14] },
  { champ: "Darius", level: 12, items: ["Stridebreaker", "Plated Steelcaps"], kda: [5, 4, 6] },
  { champ: "Lux", level: 10, items: ["Luden's Echo", "Sorcerer's Shoes"], kda: [3, 3, 11] },
];

const ENEMIES: DemoPlayer[] = [
  { champ: "Soraka", level: 10, items: ["Moonstone Renewer", "Ionian Boots of Lucidity"], kda: [0, 3, 12] },
  { champ: "Aatrox", level: 12, items: ["Sundered Sky", "Plated Steelcaps"], kda: [5, 4, 4] },
  { champ: "Vladimir", level: 11, items: ["Riftmaker", "Sorcerer's Shoes"], kda: [4, 3, 5] },
  { champ: "Zed", level: 11, items: ["Youmuu's Ghostblade", "Edge of Night"], kda: [6, 5, 2] },
  { champ: "Malphite", level: 11, items: ["Sunfire Aegis", "Thornmail"], kda: [1, 4, 8] },
];

function items(data: StaticData, names: string[]): PlayerItem[] {
  return names.flatMap((n) => {
    const it = findItem(data, n);
    return it ? [{ id: it.id, name: it.name }] : [];
  });
}

function player(data: StaticData, p: DemoPlayer, team: "ORDER" | "CHAOS", isMe = false): PlayerState {
  const champion = findChampion(data, p.champ);
  return {
    championName: champion?.name ?? p.champ,
    champion,
    riotId: isMe ? "You#DEMO" : `${p.champ}#DEMO`,
    team,
    level: p.level,
    items: items(data, p.items),
    kills: p.kda[0],
    deaths: p.kda[1],
    assists: p.kda[2],
    isMe,
  };
}

export function demoGame(data: StaticData): GameSnapshot {
  return {
    source: "demo",
    gameMode: "KIWI",
    gameTime: 742,
    gold: 1850,
    me: player(data, ME, "ORDER", true),
    allies: ALLIES.map((p) => player(data, p, "ORDER")),
    enemies: ENEMIES.map((p) => player(data, p, "CHAOS")),
  };
}
