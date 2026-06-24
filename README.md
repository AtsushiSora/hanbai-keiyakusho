# 販売契約書

自動車売買契約書兼注文書を作成する管理者向けツールです。

## 使うファイル

- `contract.html`: 契約書作成画面
- `contract.js`: 契約書入力、プレビュー、印刷、端末内履歴
- `contract-auth.bundle.js`: 管理者ログイン用のビルド済みJS
- `netlify/functions/contracts.ts`: 契約一覧、保存、削除API

## Netlifyで使う場合

1. Netlifyでこのフォルダーを公開します。
2. Build command は `npm run build` にします。
3. Publish directory は `.` にします。
4. Netlify Identityを有効化します。
5. Registration は `Invite only` 推奨です。
6. 管理者ユーザーに `admin` ロールを付けるか、環境変数 `ADMIN_EMAILS` に管理者メールを設定します。

契約データはNetlify Blobsの `order-auto-contracts` ストアに保存されます。
