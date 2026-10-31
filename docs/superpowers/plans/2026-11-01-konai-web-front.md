# konai-web-front Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマホ / iPad / PC のブラウザから、カード UI で `living1` と `desk` の点灯・消灯・明るさを操作できる SPA を作り、Raspberry Pi 5 上の Docker(nginx)で配信する。

**Architecture:** 1 画面の React SPA。`useLights` フックがポーリングと操作をまとめ、純粋な `lightsReducer` と `selectors` が状態と派生値を担い、コンポーネントは props だけで描画する。ブラウザは相対パス `/api/...` を叩き、nginx(本番)/ Vite proxy(開発)が `../konai-web` の API へ転送する。

**Tech Stack:** Vite 7 + React 19 + TypeScript 5、Tailwind CSS 4(`@tailwindcss/vite`)、Vitest 5 + jsdom + React Testing Library、nginx:alpine、Docker Compose(`../konai-web/compose.yaml`)。

**Spec:** `docs/superpowers/specs/2026-11-01-konai-web-front-design.md`

## Global Constraints

- 追加の状態管理 / ルーティング / アイコン / UI ライブラリは入れない(spec 0 章、2 章)。許可する依存は React、Tailwind、テスト用パッケージのみ
- フロントは API を常に相対パス `/api/...` で呼ぶ。API の URL をコードや本番の環境変数に持たない(spec 3 章)
- `fetch` のタイムアウトは 8000ms、ポーリング間隔は 10000ms、操作後の再取得は 1000ms 後、スライダーの送信間引きは 300ms(spec 1、3 章)
- `brightness` は API の生値 0〜254。表示は `round(b / 254 * 100)`、送信は `round(p / 100 * 254)`(spec 2 章)
- エラーはトーストを使わず、その場所(カードかヘッダー)に出す。自動リトライしない(spec 3 章)
- 画面の文言(spec 1、3 章): 「konai」「すべての照明」「N / M 点灯」「点灯 · 70%」「点灯」「消灯」「送信中…」「応答なし」「エラー」「サーバに接続できません」「サーバが電球と通信できません」「その他」
- レスポンシブ: 部屋パネルは `sm`(640px)で 2 列、`lg`(1024px)で 3 列、電球グリッドは常に 2 列、全体 `max-w-7xl`(1280px)中央寄せ。タップ対象は最小 44px(spec 1 章)
- ダークモードは Tailwind の `dark:` 変種(`prefers-color-scheme`)のみ。手動切替なし(spec 1 章)
- コミットの条件: `npm test`、`npm run lint`、`npm run build` がすべて通る(spec 5 章)
- コミットメッセージの末尾に `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` を付ける

## Review Focus

spec が直接は書いていないが、実際に使うと必ず当たる入力。各行のテストは、その行が指す Task に入れてある。

1. `GET /lights` が空配列を返す → 画面に「電球が登録されていません」と出し、「すべての照明」は「0 / 0 点灯」で無効(Task 3 の `buildRooms`、Task 8 の App テスト)
2. 点灯中なのに `brightness` が無い応答 → 状態行は「点灯」だけ、シートのパーセントは「--」、スライダーは 100 の位置(Task 6 の `statusText`、Task 7 のシート)
3. 範囲外のパーセント(負の値、100 超)を `toBrightness` に渡す → 0〜254 に丸めて 400 を出させない(Task 3)
4. ポーリング中にタブが表示に戻る、または操作直後の再取得とポーリングが重なる → 同時に 2 本のポーリングを走らせない(Task 5 の in-flight ガード)
5. スライダーで `input` を連続して出した直後に `change`(指を離す)が来る → 送信は 1 回だけ、デバウンスの残りタイマーは捨てる(Task 7)

---

## File Structure

```
konai-web-front/
  index.html                       title「konai」、theme-color、manifest リンク
  vite.config.ts                   React + Tailwind プラグイン、/api proxy、Vitest 設定
  tsconfig*.json                   Vite テンプレートのまま
  eslint.config.js                 Vite テンプレートのまま
  package.json                     scripts: dev / build / lint / preview / test
  Dockerfile                       node:22-slim でビルド → nginx:alpine
  nginx.conf                       静的配信 + /api/ → http://api:3000/
  .dockerignore
  public/manifest.webmanifest
  public/icon.svg
  src/
    main.tsx                       createRoot → <App />
    App.tsx                        useLights を呼び、各コンポーネントに props を渡す
    index.css                      @import "tailwindcss"; のみ
    api/types.ts                   API の型と ApiError
    api/lightsApi.ts               fetch ラッパー(LightsApi インターフェースと実装)
    config/rooms.ts                部屋と電球の設定
    state/lightsReducer.ts         AppState / Action / lightsReducer
    state/selectors.ts             buildRooms / summarize / toPercent / toBrightness
    state/useLights.ts             ポーリングと操作のフック
    components/Icon.tsx            SVG アイコン(sofa / desk / bulb / box)
    components/Header.tsx
    components/AllLightsCard.tsx
    components/RoomPanel.tsx
    components/LightCard.tsx       statusText もここから export
    components/BrightnessSheet.tsx
    test/setup.ts                  @testing-library/jest-dom の読み込み
    test/fakeApi.ts                テスト用の LightsApi 実装(Task 5 で作り、6〜8 で使う)
```

テストは実装と同じディレクトリに `*.test.ts(x)` で置く(例 `src/state/selectors.test.ts`)。

---

### Task 1: プロジェクトの雛形と開発基盤

**Files:**
- Create: `package.json`、`vite.config.ts`、`index.html`、`src/main.tsx`、`src/App.tsx`、`src/index.css`、`src/test/setup.ts`、`src/App.test.tsx`、`eslint.config.js`、`tsconfig*.json`(Vite テンプレートが生成)
- Modify: `.gitignore`(`node_modules/`、`dist/`、`.env.local` を追加)

**Interfaces:**
- Produces: `npm run dev` / `npm test` / `npm run lint` / `npm run build` が動く土台。`App` は `<h1>konai</h1>` を描画する

- [ ] **Step 1: Vite のテンプレートをリポジトリ直下に展開する**

```bash
npm create vite@latest . -- --template react-ts
```
既存ファイル(`docs/`、`プロジェクト概要書.md`、`.gitignore`)があるので「Ignore files and continue」相当を選ぶ。生成後、`src/App.css`、`src/assets/`、`public/vite.svg` を削除する。

- [ ] **Step 2: 依存を入れる**

```bash
npm install
npm install tailwindcss @tailwindcss/vite
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: `vite.config.ts` を書く**

`vitest/config` の `defineConfig(({ mode }) => ...)` を使い、`loadEnv(mode, process.cwd(), "")` で `.env.local` を読む。

- `plugins: [react(), tailwindcss()]`
- `server.proxy["/api"]`: `target: env.VITE_DEV_API_URL || "http://localhost:3000"`、`changeOrigin: true`、`rewrite: (p) => p.replace(/^\/api/, "")`
- `test: { environment: "jsdom", setupFiles: "./src/test/setup.ts" }`

- [ ] **Step 4: `src/test/setup.ts` に `import "@testing-library/jest-dom/vitest";` を書き、`package.json` の scripts に `"test": "vitest run"` を足す**

`tsconfig.app.json` の `include` に `src` が含まれていることを確認し、`compilerOptions.types` に `["vitest/globals"]` は入れない(グローバルは使わず `import { describe, it, expect } from "vitest"` で書く)。

- [ ] **Step 5: `src/index.css` を `@import "tailwindcss";` だけにし、`index.html` の `<title>` を `konai`、`<html lang="ja">` にする**

- [ ] **Step 6: 失敗するテストを書く** `src/App.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("アプリ名を表示する", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "konai" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: テストが失敗することを確認する**

Run: `npm test`
Expected: FAIL(テンプレートの App は "Vite + React" を描画している)

- [ ] **Step 8: `src/App.tsx` を `<h1 className="text-xl font-semibold">konai</h1>` を返す最小のコンポーネントに置き換える**

- [ ] **Step 9: テスト・lint・ビルドが通ることを確認する**

Run: `npm test && npm run lint && npm run build`
Expected: すべて成功。`dist/index.html` が生成される

- [ ] **Step 10: `.gitignore` に `node_modules/`、`dist/`、`.env.local` を追記してコミット**

```bash
git add -A
git commit -m "chore: Vite + React + TypeScript + Tailwind + Vitest の雛形"
```

---

### Task 2: API の型と fetch ラッパー

**Files:**
- Create: `src/api/types.ts`、`src/api/lightsApi.ts`
- Test: `src/api/lightsApi.test.ts`

**Interfaces:**
- Produces(`src/api/types.ts`):
  ```ts
  export type LightPower = "ON" | "OFF";
  export interface LightState { name: string; state: LightPower; brightness?: number; updatedAt: string }
  export interface LightCommand { state?: LightPower; brightness?: number }
  export interface Health { status: "ok" | "degraded"; mqtt: "connected" | "disconnected" }
  export type ErrorCode = "INVALID_REQUEST" | "LIGHT_NOT_FOUND" | "NOT_FOUND" | "MQTT_UNAVAILABLE" | "DEVICE_TIMEOUT" | "INTERNAL_ERROR";
  export type ApiErrorCode = ErrorCode | "NETWORK";   // NETWORK = 接続不可、タイムアウト、JSON でない応答
  export class ApiError extends Error { readonly code: ApiErrorCode; readonly status: number | null; constructor(code: ApiErrorCode, status: number | null, message: string) }
  ```
- Produces(`src/api/lightsApi.ts`):
  ```ts
  export const REQUEST_TIMEOUT_MS = 8000;
  export interface LightsApi {
    listLights(): Promise<string[]>;
    getLight(name: string): Promise<LightState>;
    setLightState(name: string, command: LightCommand): Promise<LightState>;
    getHealth(): Promise<Health>;
  }
  export const lightsApi: LightsApi;
  ```
  すべて `/api/...` の相対パスを `fetch` する。`getHealth` は 503 でも body が `Health` の形なら正常に返す(throw しない)

- [ ] **Step 1: 失敗するテストを書く** `src/api/lightsApi.test.ts`

`vi.stubGlobal("fetch", vi.fn())` で `fetch` を差し替え、`afterEach` で `vi.unstubAllGlobals()`。`new Response(JSON.stringify(body), { status })` で応答を作る。

```ts
describe("lightsApi", () => {
  it("listLights は /api/lights を GET し名前の配列を返す", ...);
      // fetch が "/api/lights" で呼ばれ、{ lights: ["living1","desk"] } → ["living1","desk"]
  it("getLight は /api/lights/{name} の応答をそのまま返す", ...);
  it("setLightState は PUT、Content-Type: application/json、body が command の JSON", ...);
      // fetch.mock.calls[0] の url が "/api/lights/desk/state"、init.method === "PUT"、JSON.parse(init.body) が { state: "ON", brightness: 100 }
  it("エラー応答は ApiError(code, status) になる", ...);
      // 404 + { error: { code: "LIGHT_NOT_FOUND", message: "x" } } → rejects ApiError with code "LIGHT_NOT_FOUND", status 404
  it("fetch が throw したら ApiError(NETWORK, null)", ...);
  it("JSON でない応答は ApiError(NETWORK, status)", ...);
      // new Response("<html>", { status: 502 })
  it("getHealth は 503 でも Health を返す", ...);
      // 503 + { status: "degraded", mqtt: "disconnected" } → resolves その値
  it("8 秒で中断して ApiError(NETWORK)", ...);
      // vi.useFakeTimers(); fetch は signal.aborted で reject する Promise を返す; advanceTimersByTimeAsync(8000)
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/api`
Expected: FAIL(モジュールが無い)

- [ ] **Step 3: `src/api/types.ts` と `src/api/lightsApi.ts` を実装する**

`lightsApi.ts` の内部に `request<T>(path: string, init?: RequestInit): Promise<T>` を 1 つ置き、`AbortController` + `setTimeout(REQUEST_TIMEOUT_MS)` で中断する。`finally` でタイマーを消す。`!res.ok` のとき body を `{ error: { code } }` として読み、`code` が `ErrorCode` の一覧に無ければ `NETWORK` にする。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/api`
Expected: PASS(8 件)

- [ ] **Step 5: コミット**

```bash
git add src/api
git commit -m "feat: API の型と fetch ラッパー"
```

---

### Task 3: 部屋の設定と派生値

**Files:**
- Create: `src/config/rooms.ts`、`src/state/selectors.ts`
- Test: `src/state/selectors.test.ts`

**Interfaces:**
- Consumes: `LightPower`、`ApiErrorCode`(Task 2)
- Produces(`src/config/rooms.ts`):
  ```ts
  export type IconName = "sofa" | "desk" | "bulb" | "box";
  export interface LightConfig { name: string; label: string }
  export interface RoomConfig { id: string; name: string; icon: IconName; lights: LightConfig[] }
  export const rooms: RoomConfig[];   // living(リビング, sofa, living1→天井ライト)、desk(デスク, desk, desk→デスクライト)
  ```
- Produces(`src/state/selectors.ts`):
  ```ts
  export interface LightEntry { state: LightPower | null; brightness: number | null; updatedAt: string | null; pending: boolean; error: ApiErrorCode | null }
  export interface LightView { name: string; label: string; entry: LightEntry }
  export interface RoomView { id: string; name: string; icon: IconName; lights: LightView[] }
  export interface AllLightsView { on: number; total: number; anyOn: boolean }
  export const OTHER_ROOM_ID = "other";
  export const emptyEntry: LightEntry;   // { state: null, brightness: null, updatedAt: null, pending: false, error: null }
  export function buildRooms(config: RoomConfig[], names: string[], lights: Record<string, LightEntry>): RoomView[];
  export function summarize(names: string[], lights: Record<string, LightEntry>): AllLightsView;
  export function toPercent(brightness: number): number;
  export function toBrightness(percent: number): number;
  ```
  `LightEntry` はここで定義し、Task 4 の reducer が import する(reducer → selectors の一方向依存)

- [ ] **Step 1: 失敗するテストを書く** `src/state/selectors.test.ts`

```ts
const cfg: RoomConfig[] = [
  { id: "living", name: "リビング", icon: "sofa", lights: [{ name: "living1", label: "天井ライト" }, { name: "living2", label: "フロア" }] },
  { id: "desk", name: "デスク", icon: "desk", lights: [{ name: "desk", label: "デスクライト" }] },
];
describe("buildRooms", () => {
  it("設定の順に部屋を並べ、各部屋は設定の順に電球を並べる", ...);
      // names ["desk","living1"] → rooms [living(living1), desk(desk)]、label が設定の表示名
  it("設定にあって API に無い名前は出さない", ...);           // living2 が消える
  it("設定に無い名前は末尾の「その他」に API 名のまま", ...); // names [..., "garage"] → 最後が { id: "other", name: "その他", icon: "box", lights: [{ name: "garage", label: "garage" }] }
  it("その他に該当が無ければ部屋を作らない", ...);
  it("電球が 1 つも無い部屋は出さない", ...);                 // names ["desk"] → living は出ない
  it("names が空なら空配列", ...);                            // Review Focus 1
  it("lights に無い名前は emptyEntry を使う", ...);
});
describe("summarize", () => {
  it("点灯数と総数と anyOn", ...);   // 2 個中 1 個 ON → { on: 1, total: 2, anyOn: true }
  it("names が空なら { on: 0, total: 0, anyOn: false }", ...);
  it("state が null の電球は点灯に数えない", ...);
});
describe("toPercent / toBrightness", () => {
  it.each([[0, 0], [1, 0], [127, 50], [254, 100]])("toPercent(%i) = %i", ...);
  it.each([[0, 0], [50, 127], [100, 254]])("toBrightness(%i) = %i", ...);
  it("範囲外は 0〜254 に丸める", ...);   // Review Focus 3: toBrightness(150) === 254, toBrightness(-5) === 0
  it("整数を返す", ...);                  // Number.isInteger(toBrightness(33))
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/state/selectors`
Expected: FAIL

- [ ] **Step 3: `src/config/rooms.ts` と `src/state/selectors.ts` を実装する**

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/state/selectors`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/config src/state
git commit -m "feat: 部屋設定と派生値(buildRooms / summarize / 明るさ変換)"
```

---

### Task 4: 状態と更新ルール(reducer)

**Files:**
- Create: `src/state/lightsReducer.ts`
- Test: `src/state/lightsReducer.test.ts`

**Interfaces:**
- Consumes: `LightEntry`、`emptyEntry`(Task 3)、`LightState`、`ApiErrorCode`(Task 2)
- Produces:
  ```ts
  export type Connection = "ok" | "unreachable" | "degraded";
  export interface AppState { names: string[]; lights: Record<string, LightEntry>; connection: Connection; sheet: string | null }
  export const initialState: AppState;   // { names: [], lights: {}, connection: "ok", sheet: null }
  export type Action =
    | { type: "namesLoaded"; names: string[] }
    | { type: "lightFetched"; light: LightState }
    | { type: "lightFetchFailed"; name: string; code: ApiErrorCode }
    | { type: "commandStarted"; name: string }
    | { type: "commandSucceeded"; light: LightState }
    | { type: "commandFailed"; name: string; code: ApiErrorCode }
    | { type: "connectionFailed"; code: ApiErrorCode }   // 電球に紐づかない失敗(listLights、getHealth の例外)
    | { type: "healthChecked"; ok: boolean }
    | { type: "sheetOpened"; name: string }
    | { type: "sheetClosed" };
  export function lightsReducer(state: AppState, action: Action): AppState;
  export function connectionFor(code: ApiErrorCode): Connection;   // MQTT_UNAVAILABLE→degraded、NETWORK / INTERNAL_ERROR→unreachable、それ以外→ok
  ```

ルール(spec 2、3 章):
- `namesLoaded`: `names` を置き換え、各名前に `emptyEntry`(既にある entry は保持)。`connection` を `ok` に
- `lightFetched` / `commandSucceeded`: その電球を応答の値で上書き(`brightness` が無ければ `null`)、`pending: false`、`error: null`、`connection: ok`
- `lightFetchFailed` / `commandFailed`: `pending: false`。`connectionFor(code)` が `ok` 以外ならそれを `connection` にし、entry の `error` は触らない。`ok` なら(`DEVICE_TIMEOUT` など電球単位のエラー)entry の `error` にその code を入れ、`connection` は `ok` にする
- `commandStarted`: `pending: true`
- `connectionFailed`: `connection` を `connectionFor(code)` に(`ok` なら変更しない)。entry は触らない
- `healthChecked`: `ok: true` なら `connection: ok`、`false` なら `degraded`
- `sheetOpened` / `sheetClosed`: `sheet` を設定 / `null`
- 常に新しいオブジェクトを返す(入力を変更しない)

- [ ] **Step 1: 失敗するテストを書く** `src/state/lightsReducer.test.ts`

上のルール 1 つにつき 1 つ以上のテスト。特に:
```ts
it("namesLoaded は既存の entry を保持する", ...);
it("lightFetched は brightness 無しを null にする", ...);
it("commandFailed(DEVICE_TIMEOUT) は entry.error に入り connection は ok", ...);
it("commandFailed(MQTT_UNAVAILABLE) は connection=degraded で entry.error は null のまま", ...);
it("lightFetchFailed(NETWORK) は connection=unreachable", ...);
it("connectionFailed(NETWORK) は connection=unreachable で lights は変わらない", ...);
it("lightFetched で error が消え connection が ok に戻る", ...);
it("commandStarted → commandSucceeded で pending が true → false", ...);
it("入力の state を変更しない", ...);   // Object.isFrozen で固めた state を渡す
it.each([["MQTT_UNAVAILABLE","degraded"],["NETWORK","unreachable"],["INTERNAL_ERROR","unreachable"],["DEVICE_TIMEOUT","ok"],["LIGHT_NOT_FOUND","ok"]])("connectionFor(%s) = %s", ...);
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/state/lightsReducer`
Expected: FAIL

- [ ] **Step 3: `src/state/lightsReducer.ts` を実装する**

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/state/lightsReducer`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/state/lightsReducer.ts src/state/lightsReducer.test.ts
git commit -m "feat: 電球状態の reducer"
```

---

### Task 5: `useLights` フック(ポーリングと操作)

**Files:**
- Create: `src/state/useLights.ts`、`src/test/fakeApi.ts`
- Test: `src/state/useLights.test.ts`

**Interfaces:**
- Consumes: `LightsApi`、`lightsApi`(Task 2)、`buildRooms`、`summarize`、`toBrightness`、`rooms`(Task 3)、`lightsReducer`、`initialState`(Task 4)
- Produces(`src/state/useLights.ts`):
  ```ts
  export const POLL_INTERVAL_MS = 10_000;
  export const REFETCH_DELAY_MS = 1_000;
  export interface LightsController {
    state: AppState;
    rooms: RoomView[];
    all: AllLightsView;
    toggle(name: string): Promise<void>;                       // 現在 ON なら OFF、それ以外は ON。pending 中は何もしない
    setPower(name: string, power: LightPower): Promise<void>;  // { state: power }
    setBrightness(name: string, percent: number): Promise<void>; // { brightness: toBrightness(percent) }
    toggleAll(): Promise<void>;                                // all.anyOn なら全 OFF、でなければ全 ON。Promise.allSettled
    openSheet(name: string): void;
    closeSheet(): void;
  }
  export function useLights(api?: LightsApi): LightsController;   // 既定は lightsApi
  ```
- Produces(`src/test/fakeApi.ts`):
  ```ts
  export interface FakeApi extends LightsApi {
    lights: Map<string, LightState>;          // 現在の擬似状態。setLightState で更新される
    calls: { method: string; name?: string; command?: LightCommand }[];
    failNext: (code: ApiErrorCode) => void;   // 次の 1 回の呼び出しを ApiError(code) で失敗させる
    health: Health;                           // getHealth が返す値
  }
  export function createFakeApi(initial: LightState[]): FakeApi;
  ```

動作(spec 3 章):
- マウント時: `listLights` → `namesLoaded` → 全電球の `getLight` を `Promise.allSettled` で並列 → 各結果を `lightFetched` / `lightFetchFailed`
- `listLights` が失敗したら `connectionFailed` を dispatch し、`POLL_INTERVAL_MS` 後に再試行(名前が取れるまで)。`getHealth` が例外を投げたときも `connectionFailed`
- 1 周期が終わってから `setTimeout(POLL_INTERVAL_MS)` で次を予約する(`setInterval` は使わない)。周期の実行中フラグ(ref)を持ち、重なった要求は無視する
- `connection === "degraded"` の周期では、まず `getHealth` を呼び `healthChecked` を dispatch。`status !== "ok"` なら電球の取得は飛ばす
- `document.visibilityState === "hidden"` になったら予約を消す。`visible` に戻ったら直ちに 1 周期走らせる
- 操作: `commandStarted` → `setLightState` → `commandSucceeded` → `REFETCH_DELAY_MS` 後に `getLight` → `lightFetched`。失敗は `commandFailed`。`ApiError` 以外の例外は `NETWORK` として扱う
- アンマウント時にタイマーとイベントリスナーを外す。アンマウント後に dispatch しない(ref で判定)

- [ ] **Step 1: `src/test/fakeApi.ts` を作る**

`createFakeApi` はメモリ上の `Map` を状態の真実とし、`setLightState` は `state` / `brightness` を適用して更新後の `LightState` を返す(`brightness: 0` → `state: "OFF"`、`brightness` だけなら `state: "ON"`、`state: "ON"` だけなら既存の brightness)。各メソッドは `calls` に記録する。`failNext` 用のキューを持つ。

- [ ] **Step 2: 失敗するテストを書く** `src/state/useLights.test.ts`

`renderHook` + `act`、`vi.useFakeTimers()`、`await vi.advanceTimersByTimeAsync(ms)`。各テストは `createFakeApi([{ name: "living1", state: "ON", brightness: 254, updatedAt: t }, { name: "desk", state: "OFF", updatedAt: t }])` から始める。

```ts
it("マウント時に名前一覧と各電球の状態を取得する", ...);            // names、lights["living1"].state === "ON"、api.calls に getLight ×2
it("10 秒後に再取得する", ...);                                     // advance 10_000 → getLight の回数が 4
it("ページが hidden の間は取得せず、visible に戻ると直ちに取得する", ...);
      // document.visibilityState を vi.spyOn(document, "visibilityState", "get") で差し替え、document.dispatchEvent(new Event("visibilitychange"))
it("前の周期が終わる前に次を始めない", ...);                        // Review Focus 4: getLight を未解決の Promise にして visibilitychange を起こしても getLight 呼び出し数が増えない
it("toggle は ON の電球に { state: OFF } を送り、pending を経て応答で更新する", ...);
      // commandStarted 直後 state.lights.living1.pending === true、解決後 false、state "OFF"
it("toggle は pending 中は無視する", ...);                          // 連続 2 回呼んで setLightState が 1 回
it("操作成功の 1 秒後に getLight で取り直す", ...);                 // advance 1_000 → calls に getLight living1
it("setBrightness(50) は { brightness: 127 } だけを送る", ...);
it("toggleAll は 1 つでも点灯していれば全 OFF、全消灯なら全 ON", ...);
it("toggleAll は一部が失敗しても他を続け、失敗した電球だけ error", ...); // failNext("DEVICE_TIMEOUT") → living1.error === "DEVICE_TIMEOUT"、desk は更新される
it("DEVICE_TIMEOUT は connection を ok のままにする", ...);
it("NETWORK で connection が unreachable になり、次の周期で成功すると ok に戻る", ...);
it("MQTT_UNAVAILABLE で degraded になり、以後の周期は getHealth を呼び、ok になるまで getLight を呼ばない", ...);
      // api.health = { status: "degraded", ... } → advance 10_000 → calls に getHealth、getLight 無し; api.health = ok → advance 10_000 → getLight が呼ばれる
it("listLights が失敗したら 10 秒後に再試行する", ...);
it("openSheet / closeSheet で state.sheet が変わる", ...);
it("アンマウント後はタイマーが残らない", ...);                      // unmount → vi.getTimerCount() === 0
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run src/state/useLights`
Expected: FAIL

- [ ] **Step 4: `src/state/useLights.ts` を実装する**

`useReducer(lightsReducer, initialState)`、`useRef` で `mounted` / `inFlight` / `timer`、`useEffect` でマウント時の開始と `visibilitychange` の登録。`rooms` と `all` は `useMemo` で `buildRooms(rooms, state.names, state.lights)` と `summarize(...)`。操作関数は `useCallback`。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/state/useLights`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/state/useLights.ts src/state/useLights.test.ts src/test/fakeApi.ts
git commit -m "feat: useLights フック(ポーリングと操作)"
```

---

### Task 6: 表示コンポーネント(Icon、Header、AllLightsCard、LightCard、RoomPanel)

**Files:**
- Create: `src/components/Icon.tsx`、`src/components/Header.tsx`、`src/components/AllLightsCard.tsx`、`src/components/LightCard.tsx`、`src/components/RoomPanel.tsx`
- Test: `src/components/Header.test.tsx`、`src/components/AllLightsCard.test.tsx`、`src/components/LightCard.test.tsx`、`src/components/RoomPanel.test.tsx`

**Interfaces:**
- Consumes: `IconName`(Task 3)、`LightView`、`RoomView`、`AllLightsView`、`LightEntry`、`toPercent`(Task 3)、`Connection`(Task 4)
- Produces:
  ```ts
  // Icon.tsx
  export function Icon(props: { name: IconName; className?: string }): JSX.Element;   // inline SVG、aria-hidden
  // Header.tsx
  export function Header(props: { connection: Connection }): JSX.Element;
      // <h1>konai</h1>。unreachable → role="status" に「サーバに接続できません」、degraded → 「サーバが電球と通信できません」、ok → status 無し
  // AllLightsCard.tsx
  export function AllLightsCard(props: { summary: AllLightsView; disabled: boolean; onToggle: () => void }): JSX.Element;
      // <button role="switch" aria-checked={summary.anyOn} aria-label="すべての照明">、文言「N / M 点灯」。disabled または total === 0 で無効
  // LightCard.tsx
  export function statusText(entry: LightEntry): string;
      // pending → "送信中…" / error DEVICE_TIMEOUT → "応答なし" / その他の error → "エラー" / state null → "取得中…" / OFF → "消灯" / ON & brightness → "点灯 · 70%" / ON & null → "点灯"
  export function LightCard(props: { light: LightView; disabled: boolean; onTap: () => void; onMore: () => void }): JSX.Element;
      // 本体 <button aria-label={label}>、右上 <button aria-label={`${label} の明るさ`}>。pending または disabled で本体は disabled。点灯中はアイコン背景 amber
  // RoomPanel.tsx
  export function RoomPanel(props: { room: RoomView; disabled: boolean; onTap: (name: string) => void; onMore: (name: string) => void }): JSX.Element;
      // <section aria-labelledby>、見出しに Icon + room.name、grid grid-cols-2 gap-3 に LightCard
  ```

- [ ] **Step 1: 失敗するテストを書く**

```ts
// Header.test.tsx
it.each([["ok", null], ["unreachable", "サーバに接続できません"], ["degraded", "サーバが電球と通信できません"]])(...);
// AllLightsCard.test.tsx
it("点灯数を表示し aria-checked が anyOn", ...);           // { on: 1, total: 2, anyOn: true } → "1 / 2 点灯"、aria-checked "true"
it("クリックで onToggle", ...);
it("disabled または total 0 では押せない", ...);             // Review Focus 1
// LightCard.test.tsx
describe("statusText", () => it.each([...7 ケース...]));    // Review Focus 2: { state: "ON", brightness: null } → "点灯"
it("表示名と状態行を描画し、タップで onTap", ...);
it("pending 中は本体が disabled で onTap が呼ばれない", ...);
it("「の明るさ」ボタンで onMore", ...);
it("error が応答なしのときも本体は押せる", ...);
// RoomPanel.test.tsx
it("部屋名と電球カードを描画し、onTap / onMore に電球名を渡す", ...);
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/components`
Expected: FAIL

- [ ] **Step 3: 5 つのコンポーネントを実装する**

Tailwind のクラス方針(spec 1 章): カードは `rounded-2xl bg-white dark:bg-slate-800 shadow-sm min-h-[88px] p-3 text-left`、アイコン円は `size-9 rounded-full bg-gray-200 dark:bg-slate-700`、点灯中は `bg-amber-200 dark:bg-amber-400`、状態行は `text-sm text-gray-500 dark:text-slate-400`、点灯中は `text-amber-700 dark:text-amber-300`、エラーは `text-red-600`。無効時は `opacity-50`。ボタンは `min-h-11 min-w-11`。`Icon` の SVG は 4 つとも `viewBox="0 0 24 24"`、`fill="none" stroke="currentColor"` の簡単な線画でよい。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components
git commit -m "feat: 表示コンポーネント(Header / AllLightsCard / LightCard / RoomPanel)"
```

---

### Task 7: 明るさシート

**Files:**
- Create: `src/components/BrightnessSheet.tsx`
- Test: `src/components/BrightnessSheet.test.tsx`

**Interfaces:**
- Consumes: `LightView`、`toPercent`(Task 3)、`LightPower`(Task 2)
- Produces:
  ```ts
  export const SLIDER_DEBOUNCE_MS = 300;
  export function BrightnessSheet(props: {
    light: LightView | null;                 // null なら何も描画しない
    onClose: () => void;
    onBrightness: (percent: number) => void;
    onPower: (power: LightPower) => void;
  }): JSX.Element | null;
  ```
  `role="dialog" aria-modal="true" aria-label={label}`。背景(`data-testid="sheet-backdrop"`)のクリックと ✕(`aria-label="閉じる"`)で `onClose`。`<input type="range" min="0" max="100" aria-label="明るさ">`。大きなパーセント表示(`data-testid="percent"`)。下部に `role="switch" aria-label="電源"`、クリックで `onPower(state === "ON" ? "OFF" : "ON")`。

送信ルール(spec 1 章、Review Focus 5):
- `input` イベント: ローカル値を更新して表示だけ追従。既存のデバウンスタイマーを消し、`SLIDER_DEBOUNCE_MS` 後に `onBrightness(value)` を予約
- `change` イベント(指を離す): デバウンスタイマーを消して直ちに `onBrightness(value)`。直前に同じ値を送っていれば送らない
- props の `entry.brightness` が変わったら(ドラッグ中でなければ)ローカル値を追従させる
- `brightness` が `null` のときは表示「--」、スライダー値は 100

- [ ] **Step 1: 失敗するテストを書く** `src/components/BrightnessSheet.test.tsx`

`fireEvent.input(slider, { target: { value: "50" } })` と `fireEvent.change(...)`、`vi.useFakeTimers()`。

```ts
it("light が null なら何も描画しない", ...);
it("表示名、現在のパーセント、スライダーの値を描画する", ...);        // brightness 127 → "50%"、slider.value "50"
it("brightness が null なら「--」とスライダー 100", ...);            // Review Focus 2
it("input から 300ms 後に 1 回だけ onBrightness", ...);               // input 30 → input 40 → advance 299: 0 回 → advance 1: 1 回 (40)
it("change は直ちに送り、残っていたデバウンスは捨てる", ...);        // Review Focus 5: input 60 → change 60 → 即 1 回 → advance 300 → まだ 1 回
it("同じ値の change を続けて出しても 1 回", ...);
it("電源スイッチで onPower(OFF)", ...);                               // state ON のとき
it("背景のクリックと閉じるボタンで onClose", ...);
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/components/BrightnessSheet`
Expected: FAIL

- [ ] **Step 3: `src/components/BrightnessSheet.tsx` を実装する**

`fixed inset-0 z-50` の背景(`bg-black/40`)と、`absolute inset-x-0 bottom-0 rounded-t-3xl bg-white dark:bg-slate-800 p-5 pb-8 max-w-xl mx-auto`。スライダーは `w-full h-11 accent-amber-500`。パーセントは `text-5xl font-bold text-center`。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/components/BrightnessSheet`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/BrightnessSheet.tsx src/components/BrightnessSheet.test.tsx
git commit -m "feat: 明るさシート"
```

---

### Task 8: App の結線、レイアウト、PWA メタ

**Files:**
- Modify: `src/App.tsx`、`src/App.test.tsx`、`index.html`
- Create: `public/manifest.webmanifest`、`public/icon.svg`

**Interfaces:**
- Consumes: `useLights`(Task 5)、Task 6 と 7 の全コンポーネント、`LightsApi`(Task 2)
- Produces:
  ```ts
  export default function App(props: { api?: LightsApi }): JSX.Element;   // api はテスト注入用。既定は lightsApi
  ```

- [ ] **Step 1: 失敗するテストを書く** `src/App.test.tsx`(Task 1 のテストを置き換える)

`createFakeApi` を注入し、`vi.useFakeTimers()`、`await act(() => vi.advanceTimersByTimeAsync(0))` で初回取得を流す。

```ts
it("部屋パネルと電球カードを設定の表示名で描画する", ...);   // 「リビング」「デスク」「天井ライト」「デスクライト」、「1 / 2 点灯」
it("カードのタップで PUT { state: OFF } が飛び、表示が「消灯」になる", ...);
it("「の明るさ」でシートが開き、スライダーの change で { brightness: 127 } が飛ぶ", ...);
it("すべての照明で全消灯", ...);                               // calls に setLightState ×2、すべて { state: "OFF" }
it("DEVICE_TIMEOUT でカードに「応答なし」", ...);              // failNext → タップ
it("MQTT_UNAVAILABLE でヘッダーに通知が出て全カードが無効", ...);
it("電球が 0 個なら「電球が登録されていません」", ...);        // Review Focus 1: createFakeApi([])
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/App`
Expected: FAIL

- [ ] **Step 3: `src/App.tsx` を実装する**

構造(spec 1 章):
```
<div class="min-h-screen bg-gray-100 text-gray-900 dark:bg-slate-900 dark:text-slate-100">
  <main class="mx-auto max-w-7xl p-4 space-y-4">
    <Header />
    <AllLightsCard />
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">  ← RoomPanel ×N
    (names が空で connection ok なら <p>電球が登録されていません</p>)
  </main>
  <BrightnessSheet light={state.sheet の LightView または null} />
</div>
```
`disabled` は `state.connection !== "ok"`。`onTap` → `toggle`、`onMore` → `openSheet`、シートの `onBrightness` → `setBrightness(state.sheet, p)`、`onPower` → `setPower(state.sheet, power)`。

- [ ] **Step 4: `index.html` と PWA メタを整える**

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="theme-color" content="#f3f4f6" media="(prefers-color-scheme: light)">` と `#0f172a` の dark 版
- `<link rel="manifest" href="/manifest.webmanifest">`、`<link rel="icon" href="/icon.svg" type="image/svg+xml">`、`<meta name="apple-mobile-web-app-capable" content="yes">`
- `public/manifest.webmanifest`: `{ "name": "konai", "short_name": "konai", "start_url": "/", "display": "standalone", "background_color": "#f3f4f6", "theme_color": "#f59e0b", "icons": [{ "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }] }`
- `public/icon.svg`: 角丸の amber 背景に白い電球の線画。手書きの簡単な SVG でよい

- [ ] **Step 5: テスト・lint・ビルドが通ることを確認する**

Run: `npm test && npm run lint && npm run build`
Expected: すべて成功

- [ ] **Step 6: 開発サーバで実機 API に対して動かす**

`.env.local` に `VITE_DEV_API_URL=http://10.20.10.5:3000` を書き、`npm run dev -- --host` で起動。PC のブラウザで開き、カードのタップで実機の電球が変わること、スマホ幅(DevTools)で部屋パネルが縦積みになること、ダークモードで配色が変わることを確認する。結果を次のコミットメッセージ本文に 1 行で書く。

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: App の結線とレイアウト、PWA メタ"
```

---

### Task 9: Docker 配信と compose への組み込み

**Files:**
- Create: `Dockerfile`、`nginx.conf`、`.dockerignore`
- Modify: `../konai-web/compose.yaml`(`web` サービスの追加)、`../konai-web/プロジェクト概要書.md` は触らない
- Modify: `README.md`(新規。起動方法と電球の追加手順)

**Interfaces:**
- Produces: `docker compose up -d --build web` で `http://<Pi>/` が画面を返し、`http://<Pi>/api/lights` が API の応答を返す

- [ ] **Step 1: `Dockerfile` を書く**

```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```
`.dockerignore`: `node_modules`、`dist`、`.git`、`docs`、`.superpowers`、`.env.local`、`*.md`

- [ ] **Step 2: `nginx.conf` を書く**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  location /api/ {
    proxy_pass http://api:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_read_timeout 15s;
  }
  location = /index.html { add_header Cache-Control "no-cache"; }
  location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
  location / { try_files $uri /index.html; }
}
```

- [ ] **Step 3: ローカルでイメージをビルドし、静的配信だけ確認する**

Run: `docker build -t konai-web-front . && docker run --rm -d -p 8081:80 --name kwf konai-web-front && sleep 1 && curl -s localhost:8081/ | grep -o "<title>konai</title>"; docker rm -f kwf`
Expected: `<title>konai</title>` が出る(`/api/` は `api` ホストが無いので 502 でよい)

- [ ] **Step 4: `../konai-web/compose.yaml` に `web` サービスを追加する**

`api:` ブロックの後に spec 4 章の 6 行(`build: ../konai-web-front`、`restart`、`logging: *default-logging`、`depends_on: [api]`、`ports: ["80:80"]`)を追加。`docker compose config` が通ることを確認する。

- [ ] **Step 5: `README.md` を書く**

内容: 1 行の説明、開発(`npm install`、`.env.local`、`npm run dev`)、テスト(`npm test` / `lint` / `build`)、配信(`../konai-web` で `docker compose up -d --build web`、`http://<Pi の IP>/`)、電球の追加手順(API 側 `LIGHTS` に追加 → `src/config/rooms.ts` に 1 行 → 再ビルド)、設計書と概要書へのリンク。

- [ ] **Step 6: Pi 上で起動し、spec 5 章の手動チェックリストを実施する**

Pi 上で `../konai-web` を最新にし `docker compose up -d --build web`。チェックリストの 7 項目をスマホ、iPad、PC で確認し、結果(日付と各項目の可否)を設計書 5 章のチェックリストにチェックとして書き込む。通らない項目があれば直してから次へ進む。

- [ ] **Step 7: コミット(両リポジトリ)**

```bash
# konai-web-front
git add Dockerfile nginx.conf .dockerignore README.md docs/superpowers/specs/2026-11-01-konai-web-front-design.md
git commit -m "feat: Docker(nginx)配信と README"
# ../konai-web
git -C ../konai-web add compose.yaml
git -C ../konai-web commit -m "feat: web(konai-web-front)サービスを compose に追加"
```

- [ ] **Step 8: 概要書の次のアクションを更新する**

`プロジェクト概要書.md` 項目 11 の残り 2 件(API 疎通確認、雛形 + Docker 配信)に `[完了 YYYY-MM-DD]` を付け、最終更新日を更新してコミットする(`docs: 概要書を更新`)。
