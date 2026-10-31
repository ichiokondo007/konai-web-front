# konai-web-front 設計書

作成日: 2026-11-01
前提: `プロジェクト概要書.md`(項目 1〜9 すべて決定)

## 0. 目的と範囲

Home lab「konai」のフロントエンド。API サーバ `../konai-web`(Express、Raspberry Pi 5 上の Docker)と連携し、スマート電球をタッチパネル風のカード UI で操作する Web アプリ。

- ゴール: スマホのブラウザからカードをタップして `living1` と `desk` を点灯・消灯・明るさ変更できる
- 利用者: 自分と家族。家庭内の iPad、スマホ、PC のブラウザから使う。説明なしで操作が分かること
- 対象外: 認証、外部公開、画面からの電球追加・ペアリング、電球以外のデバイス、調色

技術: Vite + React + TypeScript(SPA)、Tailwind CSS のみ(Tailwind Plus は使わない)、DB なし、追加の状態管理 / ルーティングライブラリなし。Raspberry Pi 5 上で Docker(nginx)として配信。

### API の前提(`../konai-web/docs/api/openapi.yaml` 1.1.0)

| エンドポイント | 用途 | 備考 |
|---|---|---|
| `GET /lights` | 登録済み電球名の一覧 | `{ lights: ["living1", "desk"] }`。電球への通信はしない |
| `GET /lights/{name}` | 電球の現在状態 | 電球へ問い合わせる。最大 5 秒待つ |
| `PUT /lights/{name}/state` | オン / オフと明るさの変更 | body は `{ state?: "ON" \| "OFF", brightness?: 0..254 }` のいずれか必須。応答は変更後の状態 |
| `GET /health` | API の生存確認 | `{ status: "ok" \| "degraded", mqtt: "connected" \| "disconnected" }` |

状態の形: `{ name, state: "ON" | "OFF", brightness?: 0..254, updatedAt }`。エラーは `{ error: { code, message } }` で、`code` は `INVALID_REQUEST` / `LIGHT_NOT_FOUND` / `NOT_FOUND` / `MQTT_UNAVAILABLE` / `DEVICE_TIMEOUT` / `INTERNAL_ERROR`。

API 側の README が定めるクライアントの約束で、本設計が従うもの。

- API は CORS に対応していない。同一オリジンで配信する
- 連打しない。同じ電球への要求が近接すると応答が自分の指示を反映しないことがあるので、入力を間引き、落ち着いてから `GET` で取り直す
- `brightness` だけ送ると消灯中でも点灯する。`brightness: 0` は消灯扱い。`state: ON` だけ送ると記憶している明るさで点灯する
- リトライは 503 / 504 のみ。400 / 404 はリトライしない
- クライアント側のタイムアウトは 7〜10 秒
- 状態の真実は電球側。表示は `PUT` の応答か `GET` の結果を使い、推測しない

## 1. 画面構成

画面は 1 つだけ。ルーティングは持たない。上から次の順に並ぶ。

### ヘッダー
アプリ名「konai」。右端に接続状態の表示。正常時は何も出さず、API に届かないときだけ赤い点とメッセージ(文言は 3 章)。メニュー(⋮)は置かない。

### すべての照明
横長の 1 枚カード。左に「すべての照明」と点灯数(例「1 / 2 点灯」)、右にトグル。

- 1 つでも点灯していればトグルはオン表示
- タップすると、点灯中が 1 つでもあれば全消灯、すべて消灯なら全点灯。明るさは指定しない(各電球が記憶している明るさで点く)

### 部屋パネル
設定ファイル(2 章)の順に並ぶ。各パネルは部屋名(アイコン付き)と、その部屋の電球カードの 2 列グリッド。設定に無い電球が API から返ってきた場合は、末尾に「その他」パネルが自動で現れる。

### 電球カード
アイコン、表示名、状態行、右上に「⋯」ボタン。

- 状態行: 「点灯 · 70%」または「消灯」。操作送信中は「送信中…」、エラー時は 3 章の文言
- 点灯中はアイコンの背景が暖色(アンバー系)
- カード本体のタップでオン / オフ。送信中はカードが薄くなり、タップを受け付けない
- 「⋯」で明るさシートを開く

### 明るさシート
画面下からスライドインするシート。背景は半透明の暗幕。

- 内容: 電球の表示名、✕ ボタン、大きなパーセント表示、スライダー(0〜100%)、下部にオン / オフのトグル
- スライダーは指(マウス)を離したとき、または 300ms 入力が止まったときに送信する。ドラッグ中は表示だけ追従し送信しない
- 背景のタップか ✕ で閉じる

### レスポンシブ

| 幅 | 部屋パネルの並び |
|---|---|
| 〜640px(スマホ) | 縦に積む |
| 640〜1024px(iPad 縦など) | 横に 2 枚 |
| 1024px〜(iPad 横、PC) | 横に 3 枚 |

各パネル内の電球グリッドは常に 2 列。全体は最大幅 1280px で中央寄せ。タップ対象(カード、トグル、⋯)は最小 44px 四方を確保する。

### テーマ
ライト基調(薄いグレー背景に白いカード)。`prefers-color-scheme: dark` のときは Tailwind の `dark:` でダーク配色(濃紺背景、点灯中カードだけ暖色が浮かぶ)に自動切替。手動切替は持たない。

## 2. データと状態

### 設定ファイル `src/config/rooms.ts`

部屋と電球のひも付け、表示名、アイコンを型付きの定数で持つ。

```ts
export interface LightConfig { name: string; label: string }
export interface RoomConfig  { id: string; name: string; icon: IconName; lights: LightConfig[] }

export const rooms: RoomConfig[] = [
  { id: "living", name: "リビング", icon: "sofa",
    lights: [{ name: "living1", label: "天井ライト" }] },
  { id: "desk",   name: "デスク",   icon: "desk",
    lights: [{ name: "desk",    label: "デスクライト" }] },
];
```

- 電球を増やすときは、API サーバ側の `LIGHTS` に加えたうえで、ここに 1 行足す
- API が返す名前のうち設定に無いものは「その他」パネルに API 名のまま表示する
- 設定にあって API に無い名前は表示しない(設定の書き間違いで幽霊カードを出さない)
- アイコンは数種類の SVG をコード内に持ち、`icon` の名前で選ぶ。外部アイコンライブラリは入れない

### アプリの状態(`useReducer` で 1 か所に集約)

```ts
interface LightEntry {
  state: "ON" | "OFF";
  brightness?: number;      // 0..254、API の生値
  updatedAt: string;
  pending: boolean;         // 操作送信中
  error?: ErrorCode;        // 直近の操作 / 取得の失敗
}
interface AppState {
  names: string[];                           // GET /lights の順
  lights: Record<string, LightEntry>;
  connection: "ok" | "unreachable" | "degraded";  // degraded = MQTT_UNAVAILABLE
  sheet: string | null;                      // 明るさシートを開いている電球名
}
```

### 派生値(状態から都度計算し、保存しない)

- 部屋パネル一覧: `rooms` × `names` から組み立て、「その他」を末尾に付ける
- すべての照明: 点灯数 / 総数、「1 つでも点灯」の真偽
- パーセント表示: `round(brightness / 254 * 100)`。送信時は `round(percent / 100 * 254)` で 0〜254 の整数に戻す。`brightness` が無い点灯中の電球は「点灯」だけ表示する

### 状態の更新ルール

- 取得(ポーリング、操作後の再取得)の結果で `lights[name]` を上書きする。画面側で状態を推測して書き換えない
- 例外は操作中の見た目だけ。タップ直後に `pending: true` にし、`PUT` の応答が返ったらその応答で上書きして `pending: false` に戻す
- `PUT` が成功しても、1 秒後に `GET /lights/{name}` で 1 回取り直す(近接した要求の応答が自分の指示を反映しないことがあるため)
- `error` は次の取得 / 操作が成功したら消す

### ファイル構成

```
src/
  config/rooms.ts            部屋と電球の設定
  config/icons.tsx           アイコン SVG
  api/lightsApi.ts           fetch の薄いラッパー(型付き、エラーを ErrorCode に変換、8 秒タイムアウト)
  state/lightsReducer.ts     状態と更新ルール(純粋関数)
  state/selectors.ts         派生値(部屋パネルの組み立て、全点灯判定、パーセント変換)
  state/useLights.ts         ポーリングと操作をまとめたフック。画面が使う唯一の入口
  components/Header.tsx
  components/AllLightsCard.tsx
  components/RoomPanel.tsx
  components/LightCard.tsx
  components/BrightnessSheet.tsx
  App.tsx
  main.tsx
```

`useLights` が「取得の層」の境界。将来 SSE(`GET /lights/events` のようなサーバプッシュ)に変えるときは、このフック内のポーリングを `EventSource` に差し替えるだけで、`lightsReducer`、`selectors`、`components` は変わらない。

## 3. API 連携とエラー処理

### 呼び出し先
フロントは常に相対パス `/api/...` を叩く。本番は nginx が `/api/` を剥がして `api:3000` へ転送し、開発時は Vite の proxy が同じことをする。API の URL をコードや本番の環境変数に持たない。

### ポーリング(`useLights` 内)

- 起動時に `GET /api/lights` で名前一覧を取り、続けて各電球の `GET /api/lights/{name}` を並列に呼ぶ
- 以後 10 秒ごとに各電球の状態を取り直す。名前一覧は起動時のみ(電球を足したらページを再読み込みする)
- ページが非表示(`document.hidden`)の間は止め、表示に戻った瞬間に 1 回取り直す
- 1 回のポーリングが終わる前に次を始めない(応答が遅いときに要求を積み上げない)
- `fetch` には 8 秒のタイムアウト(`AbortController`)

### 操作

| 操作 | 送る body |
|---|---|
| カードのタップ(消灯中) | `{ state: "ON" }` |
| カードのタップ(点灯中) | `{ state: "OFF" }` |
| シートのスライダー | `{ brightness: n }`(消灯中でも点灯する API の挙動をそのまま使う) |
| シートのトグル | `{ state: "ON" }` / `{ state: "OFF" }` |
| すべての照明 | 各電球に `{ state: "ON" }` または `{ state: "OFF" }` を並列に送る。一部が失敗してもほかは進め、失敗した電球のカードにだけエラーを出す |

- `pending` のカードはタップを受け付けない(連打防止)
- 成功したら応答の状態で上書きし、1 秒後に `GET` で取り直す

### エラーの見せ方(`error.code` で分岐)

| 状況 | 見せ方 |
|---|---|
| `DEVICE_TIMEOUT`(電球が応答しない) | そのカードの状態行に「応答なし」と赤字。カードは操作可能のまま。次のポーリングで回復すれば消える |
| `MQTT_UNAVAILABLE`(API がブローカー未接続) | `connection = "degraded"`。ヘッダーに「サーバが電球と通信できません」。全カードを薄くし操作を止める。`GET /api/health` が `ok` に戻るまで 10 秒ごとに確認 |
| ネットワーク断、タイムアウト、5xx | `connection = "unreachable"`。ヘッダーに「サーバに接続できません」。カードは最後に取得した状態を薄く表示。ポーリングは続け、成功したら `ok` に戻す |
| `LIGHT_NOT_FOUND` / `INVALID_REQUEST` | 設定ミスかバグなので再送しない。カードに「エラー」と出し、`console.error` に詳細 |

自動リトライは行わない(ポーリングが 10 秒後に取り直すことが実質のリトライ)。トースト通知は使わず、エラーはその場所(カードかヘッダー)に出す。

## 4. 配信(Docker)

### このリポジトリに置くもの

- `Dockerfile`: 2 段構成。`node:22-slim` で `npm ci` と `npm run build` を行い、`dist/` を `nginx:alpine` にコピーする
- `nginx.conf`: 静的ファイルの配信と、`/api/` を `http://api:3000/` へ転送する設定。`index.html` は `Cache-Control: no-cache`、ハッシュ付きアセットは長期キャッシュ
- `vite.config.ts`: 開発時の proxy(`/api` → 環境変数 `VITE_DEV_API_URL`、既定 `http://localhost:3000`)。Pi 上の API に向けて開発するときは `.env.local` に Pi の URL を書く
- `public/manifest.webmanifest` とアイコン: ホーム画面に追加して全画面で開けるようにする。Service Worker やオフライン対応は入れない

### `../konai-web/compose.yaml` への追記

API 側リポジトリへの変更はこれだけ。

```yaml
  web:
    build: ../konai-web-front
    restart: unless-stopped
    logging: *default-logging
    depends_on:
      - api
    ports:
      - "8088:80"
```

同じ compose ネットワークに入るので、nginx からは `api` というホスト名で API に届く。家族は `http://<Pi の IP>:8088/` を開くだけ(実装時の判明事項: Pi の 80 番は k3s の Traefik が横取りするため、公開ポートは 8088 にした)。

### ビルドと起動
`../konai-web` で `docker compose up -d --build web`。フロントを直したら同じコマンドを再実行する。

## 5. テスト

ツールは Vitest と React Testing Library。ブラウザ実機の自動テストは入れない。最終確認はゴールどおり、スマホで実機の電球が変わることを目で見る。

### 単体テスト(純粋関数。最も厚く書く)

- `lightsReducer`: 取得結果での上書き、`pending` の付け外し、エラーの記録と回復、`connection` の遷移
- `selectors`: 部屋パネルの組み立て(順序、「その他」の自動追加、設定にあって API に無い名前の除外)、全点灯判定、パーセント変換の往復と端の値(0、1、254)
- `lightsApi`: `fetch` をモックし、正常応答の型変換、`error.code` の取り出し、タイムアウト

### コンポーネントテスト(`fetch` をモックで差し替え)

- カードのタップで `PUT` が正しい body で飛び、応答で表示が変わる。`pending` 中は再タップが無視される
- 「⋯」でシートが開き、スライダーを離すと `brightness` だけが送られる
- `DEVICE_TIMEOUT` でカードに「応答なし」、`MQTT_UNAVAILABLE` でヘッダーに通知が出て全カードが操作不可になる
- ポーリング: 偽タイマーで 10 秒進めると取得が走る、`document.hidden` 中は走らない

### 手動確認のチェックリスト(完了時に実施)

- [ ] スマホ、iPad、PC の 3 種で表示崩れがない
- [ ] ダークモードで配色が切り替わる
- [ ] カードのタップで実機の電球が点灯 / 消灯する
- [ ] シートのスライダーで実機の明るさが変わる
- [ ] 「すべての照明」で全点灯 / 全消灯できる
- [ ] 2 台の端末で開き、片方で操作した結果がもう片方に 10 秒以内に反映される
- [ ] API コンテナを止めるとヘッダーに通知が出て、再開すると自然に戻る

### コミットの条件
`npm test`、`npm run lint`、`npm run build` が通ること。

## 6. 将来の拡張との関係(本設計の範囲外)

- サーバプッシュ(SSE): API に `GET /lights/events` を足す。フロントは `useLights` のポーリング部分を差し替える
- 電球以外のデバイス: 部屋パネルの中にカード種別を増やす。`rooms.ts` の `lights` と並ぶ別配列として追加する想定
- ローカル LLM 連携: 本フロントとは独立に API を呼ぶ。フロントは影響を受けない
