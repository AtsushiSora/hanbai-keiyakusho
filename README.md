# 販売契約書

車両販売契約の入力内容をPDF保存・印刷・メール・LINE送信用に作成する契約作成システムです。

Netlifyは使いません。ログインと契約データ保存はSupabaseを使います。

## 使うファイル

- `contract.html`: 契約書メニュー
- `contract-create.html`: 契約書作成画面
- `contract-list.html`: 契約一覧画面
- `contract-contact.html`: メール・LINE契約の送信用文面作成画面
- `sales-consent.html`: お客様が確認URLとパスコードで契約内容を確認する画面
- `contract.js`: 契約書入力、PDFテンプレートへの転記、下書き保存
- `src/contract-auth.js`: Supabaseログイン、クラウド保存、JSON出力・取込
- `src/supabase-config.js`: Supabase接続設定
- `supabase-schema.sql`: Supabaseに作成する契約保存テーブル
- `contract-auth.bundle.js`: `src/contract-auth.js` を読み込む入口ファイル
- `sales-template.html`: PDF保存・印刷で内部利用するテンプレートページ
- `sales-sheet.js`: 帳票型ページの保存、上書き、自動計算
- `contract-contact.js`: メール・LINE送信用文面の作成、コピー、起動
- `sales-consent.js`: 確認URLの復号、重要事項確認、電子署名、完了メール作成
- `TEST_GUIDE.md`: テスト手順書

## Supabase設定

1. Supabaseでプロジェクトを作成します。
2. SQL Editorで `supabase-schema.sql` の内容を実行します。
3. Authenticationで管理者用ユーザーを作成します。
4. Project Settings → API から Project URL と anon public key を取得します。
5. `src/supabase-config.js` に設定します。

```js
export const SUPABASE_CONFIG = {
  url: "https://xxxxx.supabase.co",
  anonKey: "xxxxx",
  tableName: "order_auto_contracts",
};
```

## 保存方式

契約データはSupabaseの `order_auto_contracts` テーブルに保存されます。

Row Level Securityを有効にしているため、ログイン中ユーザー本人のデータだけを読み書きできます。複数人で同じ契約一覧を共有したい場合は、同じ管理者アカウントで運用するか、別途チーム権限用の設計が必要です。

## 注意点

`anonKey` は公開サイトに置いてよい公開キーですが、RLS設定が必須です。`service_role` キーは絶対にブラウザ側へ置かないでください。
