# フォロー棚 — エージェント向け

ローカルファーストの日本語ウェブアプリ。X の休眠フォローを洗い、外す。名簿はブラウザ内だけ。

公開リポジトリ: https://github.com/gatyoukatyou/follow-tana

## 守ること

- 名簿をサーバに送らない。IndexedDB（`src/lib/idb-storage.ts`）と JSON 控えだけ。
- 認証・DB・アカウント機能を足さない。
- UI 文言は日本語。見本データは架空の `tana_*` だけ。
- オーナーハンドルは Zustand に入れない。`src/lib/owner.ts` の localStorage。
- X の取得・生存確認・フォロー解除は、ログイン中の X タブで動くコンソールスクリプト。サーバから X を叩かない。
- `lookupFailed`（停止）は、削除・凍結が確認できたときだけ。調べ損ね・タイムアウト・空レスは未確認のまま。
- 停止が名簿の 35% 超なら `repairMassFalseDead` が未確認に戻す。この安全弁を外さない。

## スタック

TanStack Start / React 19 / Tailwind v4 / Zustand persist / Vitest

```bash
npm install
npm test
npm run typecheck
```

変更したらテストと typecheck を通す。ドメインロジックは `src/lib/*.test.ts`。

## 主なファイル

| 役割 | 場所 |
|---|---|
| デスク UI | `src/components/follow-desk.tsx` |
| 名簿状態 | `src/lib/roster-store.ts` |
| 生存判定 | `src/lib/types.ts` の `activityOf` |
| 取込＋最終投稿 | `src/lib/x-collector-script.ts` |
| 生存確認コード | `src/lib/x-scan-script.ts` |
| 解除コード | `src/lib/x-unfollow-script.ts` |
| postMessage | `src/hooks/use-x-bridge.ts` |
| 公開API予備 | `src/lib/x-lookup.ts`（遅い・欠けやすい） |
| ゲーム表示ロジック | `src/lib/arena.ts`（postMessage 契約はファイル先頭）・`src/lib/arena-store.ts` |
| ゲーム表示デモ | `src/lib/arena-demo.ts`（架空の `tana_*` だけ） |

## いまの既知課題

1. 7,500 人規模で `users/lookup` が途中で欠ける。欠けた人は未確認に残すこと。停止にしない。
2. 相互／一方はフォロワー照合後に付く。取込直後は未確認で正しい。
3. 公開の fxtwitter / Nitter 経路は予備。主経路は X タブのコード。

## 出してはいけないもの

- 実在アカウントの名簿、`follow-tana.json`、Cookie、トークン
- App Builder 足場（`db.ts`、AuthProvider など）
