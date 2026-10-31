// 部屋と電球のひも付け。電球を増やすときは API サーバ側の LIGHTS に加えたうえで、ここに 1 行足す。
// API が返す名前のうちここに無いものは「その他」の部屋に API 名のまま表示される。

export type IconName = "sofa" | "desk" | "bulb" | "box";

export interface LightConfig {
  /** API の電球名(GET /lights が返す名前) */
  name: string;
  /** 画面に出す表示名 */
  label: string;
}

export interface RoomConfig {
  id: string;
  name: string;
  icon: IconName;
  lights: LightConfig[];
}

export const rooms: RoomConfig[] = [
  {
    id: "living",
    name: "リビング",
    icon: "sofa",
    lights: [{ name: "living1", label: "天井ライト" }],
  },
  {
    id: "desk",
    name: "デスク",
    icon: "desk",
    lights: [{ name: "desk", label: "デスクライト" }],
  },
];
