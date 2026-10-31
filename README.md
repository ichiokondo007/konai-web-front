# konai-web-front

Home lab「konai」のフロントエンド。API サーバ [`../konai-web`](../konai-web) と連携し、スマホ / iPad / PC のブラウザからスマート電球をカード UI で操作する。

- 設計書: [`docs/superpowers/specs/2026-11-01-konai-web-front-design.md`](docs/superpowers/specs/2026-11-01-konai-web-front-design.md)
- 概要書: [`プロジェクト概要書.md`](プロジェクト概要書.md)

## 開発

```bash
npm install
cp .env.local.example .env.local   # 無ければ下の 1 行を .env.local に書く
npm run dev -- --host
```

`.env.local` に API サーバの URL を書く(開発サーバの `/api` がそこへ転送される。既定は `http://localhost:3000`)。

```
VITE_DEV_API_URL=http://10.20.10.5:3000
```

## テスト

コミットの条件は次の 3 つがすべて通ること。

```bash
npm test        # Vitest(単体 + コンポーネント)
npm run lint    # oxlint
npm run build   # tsc + vite build
```

## 配信(Raspberry Pi 上の Docker)

`../konai-web/compose.yaml` の `web` サービスがこのリポジトリをビルドして nginx で配信する。`/api/` は同じ compose ネットワークの `api` へ転送される。

```bash
cd ../konai-web
docker compose up -d --build web
```

家族は `http://<Pi の IP>/` を開く(ポート指定なし)。ホーム画面に追加すると全画面で使える。フロントを直したら同じコマンドを再実行する。

## 電球を増やすとき

1. API サーバ側: `../konai-web/compose.yaml` の `LIGHTS` に電球名を追加する(ペアリングは API 側の手順)
2. フロント側: [`src/config/rooms.ts`](src/config/rooms.ts) の該当する部屋に `{ name: "<電球名>", label: "<表示名>" }` を 1 行足す。新しい部屋ならオブジェクトを 1 つ足す
3. `docker compose up -d --build web` で再ビルド

設定に無い電球は「その他」の部屋に API 名のまま表示されるので、2 を忘れても画面から消えることはない。

## 構成

```
src/
  config/rooms.ts        部屋と電球の設定
  api/lightsApi.ts       fetch ラッパー(/api/... 相対パス、8 秒タイムアウト)
  state/lightsReducer.ts 状態と更新ルール
  state/selectors.ts     派生値(部屋パネルの組み立て、明るさ変換)
  state/useLights.ts     ポーリング(10 秒)と操作。将来 SSE に差し替える境界
  components/            Header, AllLightsCard, RoomPanel, LightCard, BrightnessSheet
```
