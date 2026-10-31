import { describe, expect, it } from "vitest";
import type { RoomConfig } from "../config/rooms";
import {
  buildRooms,
  emptyEntry,
  OTHER_ROOM_ID,
  summarize,
  toBrightness,
  toPercent,
  type LightEntry,
} from "./selectors";

const cfg: RoomConfig[] = [
  {
    id: "living",
    name: "リビング",
    icon: "sofa",
    lights: [
      { name: "living1", label: "天井ライト" },
      { name: "living2", label: "フロア" },
    ],
  },
  { id: "desk", name: "デスク", icon: "desk", lights: [{ name: "desk", label: "デスクライト" }] },
];

const on: LightEntry = { ...emptyEntry, state: "ON", brightness: 254, updatedAt: "t" };
const off: LightEntry = { ...emptyEntry, state: "OFF", brightness: null, updatedAt: "t" };

describe("buildRooms", () => {
  it("設定の順に部屋を並べ、各部屋は設定の順に電球を並べる", () => {
    const rooms = buildRooms(cfg, ["desk", "living1"], { living1: on, desk: off });
    expect(rooms.map((r) => r.id)).toEqual(["living", "desk"]);
    expect(rooms[0]).toMatchObject({ name: "リビング", icon: "sofa" });
    expect(rooms[0].lights).toEqual([{ name: "living1", label: "天井ライト", entry: on }]);
    expect(rooms[1].lights).toEqual([{ name: "desk", label: "デスクライト", entry: off }]);
  });

  it("設定にあって API に無い名前は出さない", () => {
    const rooms = buildRooms(cfg, ["living1", "desk"], { living1: on, desk: off });
    expect(rooms[0].lights.map((l) => l.name)).toEqual(["living1"]);
  });

  it("設定に無い名前は末尾の「その他」に API 名のまま", () => {
    const rooms = buildRooms(cfg, ["garage", "living1", "desk"], { living1: on, desk: off, garage: off });
    expect(rooms.map((r) => r.id)).toEqual(["living", "desk", OTHER_ROOM_ID]);
    expect(rooms[2]).toEqual({
      id: OTHER_ROOM_ID,
      name: "その他",
      icon: "box",
      lights: [{ name: "garage", label: "garage", entry: off }],
    });
  });

  it("その他に該当が無ければ部屋を作らない", () => {
    const rooms = buildRooms(cfg, ["living1", "desk"], { living1: on, desk: off });
    expect(rooms.some((r) => r.id === OTHER_ROOM_ID)).toBe(false);
  });

  it("電球が 1 つも無い部屋は出さない", () => {
    const rooms = buildRooms(cfg, ["desk"], { desk: off });
    expect(rooms.map((r) => r.id)).toEqual(["desk"]);
  });

  it("names が空なら空配列", () => {
    expect(buildRooms(cfg, [], {})).toEqual([]);
  });

  it("lights に無い名前は emptyEntry を使う", () => {
    const rooms = buildRooms(cfg, ["living1"], {});
    expect(rooms[0].lights[0].entry).toEqual(emptyEntry);
  });
});

describe("summarize", () => {
  it("点灯数と総数と anyOn", () => {
    expect(summarize(["living1", "desk"], { living1: on, desk: off })).toEqual({ on: 1, total: 2, anyOn: true });
  });

  it("names が空なら { on: 0, total: 0, anyOn: false }", () => {
    expect(summarize([], {})).toEqual({ on: 0, total: 0, anyOn: false });
  });

  it("state が null の電球は点灯に数えない", () => {
    expect(summarize(["living1", "desk"], { living1: emptyEntry, desk: off })).toEqual({ on: 0, total: 2, anyOn: false });
  });
});

describe("toPercent / toBrightness", () => {
  it.each([
    [0, 0],
    [1, 0],
    [127, 50],
    [254, 100],
  ])("toPercent(%i) = %i", (b, p) => {
    expect(toPercent(b)).toBe(p);
  });

  it.each([
    [0, 0],
    [50, 127],
    [100, 254],
  ])("toBrightness(%i) = %i", (p, b) => {
    expect(toBrightness(p)).toBe(b);
  });

  it("範囲外は 0〜254 に丸める", () => {
    expect(toBrightness(150)).toBe(254);
    expect(toBrightness(-5)).toBe(0);
  });

  it("整数を返す", () => {
    expect(Number.isInteger(toBrightness(33))).toBe(true);
    expect(Number.isInteger(toPercent(33))).toBe(true);
  });
});
