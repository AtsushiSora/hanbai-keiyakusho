# 販売契約書

車両販売契約の入力内容をPDF保存・印刷・メール・LINE送信用に作成する管理者向けツールです。

## 使うファイル

- `contract.html`: 契約書メニュー
- `contract-create.html`: 契約書作成画面
- `contract-list.html`: 契約一覧画面
- `contract-contact.html`: メール・LINE契約の送信用文面作成画面
- `sales-consent.html`: お客様が確認URLとパスコードで契約内容を確認する画面
- `contract.js`: 契約書入力、PDFテンプレートへの転記、端末内履歴
- `sales-template.html`: PDF保存・印刷で内部利用するテンプレートページ
- `sales-sheet.js`: 帳票型ページの保存、上書き、自動計算
- `contract-contact.js`: メール・LINE送信用文面の作成、コピー、起動
- `sales-consent.js`: 確認URLの復号、重要事項確認、電子署名、完了メール作成
- `contract-auth.bundle.js`: 管理者ログイン用のビルド済みJS
- `netlify/functions/contracts.ts`: 契約一覧、保存、削除API
- `TEST_GUIDE.md`: テスト手順書

## Netlifyで使う場合

1. Netlifyでこのフォルダーを公開します。
2. Build command は `npm run build` にします。
3. Publish directory は `.` にします。
4. Netlify Identityを有効化します。
5. Registration は `Invite only` 推奨です。
6. 管理者ユーザーに `admin` ロールを付けるか、環境変数 `ADMIN_EMAILS` に管理者メールを設定します。

契約データはNetlify Blobsの `order-auto-contracts` ストアに保存されます。
