# 販売契約書

車両販売契約の入力内容をPDF保存・印刷・メール・LINE送信用に作成する契約作成システムです。

Netlifyは使いません。ログインと契約データ保存はSupabaseを使います。

## 使うファイル

- `contract.html`: 契約書メニュー
- `contract-create.html`: 契約書作成画面
- `contract-list.html`: 契約一覧画面
- `contract-contact.html`: メール・LINE契約の送信用文面作成画面
- `sales-consent.html`: お客様が確認URLとパスコードで契約内容を確認する画面
- `admin-invite.html`: Supabaseの管理者招待を受けてパスワードを設定する画面
- `contract.js`: 契約書入力、PDFテンプレートへの転記、下書き保存
- `src/contract-auth.js`: Supabaseログイン、クラウド保存、JSON出力・取込
- `src/supabase-client.js`: Supabaseクライアントの共通初期化
- `src/supabase-config.js`: Supabase接続設定
- `supabase-schema.sql`: 契約・確認URL・署名・監査履歴のテーブル、RLS、RPC
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
4. Project Settings → API Keys から Project URL と Publishable keyを取得します。
5. `src/supabase-config.js` に設定します。

```js
export const SUPABASE_CONFIG = {
  url: "https://xxxxx.supabase.co",
  publishableKey: "sb_publishable_xxxxx",
  anonKey: "",
  tableName: "order_auto_contracts",
  enableTestLogin: false,
};
```

## 保存方式

契約データは `order_auto_contracts`、お客様確認・署名は `order_auto_remote_contracts`、操作履歴は `order_auto_remote_events` に保存されます。

すべてのテーブルでRow Level Securityを有効にしています。管理者は本人のデータだけを読み書きできます。お客様はテーブルへ直接アクセスせず、期限付きトークンと8桁パスコードを検証するRPCだけを利用します。パスコードを5回間違えると15分間ロックされます。

本番公開前に `enableTestLogin` を `false` にしてください。管理者ユーザーはSupabase DashboardのAuthenticationから作成し、一般ユーザーの新規登録は無効のまま運用してください。

## 注意点

Publishable keyまたはLegacy anon keyは公開サイトに置けるキーですが、RLS設定が必須です。Secret keyと`service_role`キーは絶対にブラウザ側へ置かないでください。

確認URLのトークンはURLフラグメントに入り、パスコードは別経路で送ります。署名はPNGデータとしてSupabaseへ保存され、契約完了時に元契約も「完了」へ更新されます。
