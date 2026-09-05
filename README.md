# KOMES

毎日自分で不動産サイトを確認するのが面倒で、
首都圏の物件を自動収集・検索できるよう自作した社内ツールです。

---

## 技術スタック

| 区分 | 技術 |
|------|------|
| Runtime | Node.js 20 |
| Language | TypeScript |
| Frontend | React 18, Vite |
| Backend | Express |
| Crawler | Puppeteer Real Browser |
| Database | PostgreSQL 16 |
| Auth | Google OAuth 2.0, JWT (httpOnly Cookie) |
| Infra | Docker, Docker Compose, Nginx, Let's Encrypt (HTTPS) |

---

## 主な機能

- 東京・埼玉・千葉・神奈川の物件を毎日自動クロール
- エリア・路線・駅・価格・徒歩・土地/建物面積・築年数の複合フィルター
- 中古物件の価格変更履歴を自動記録・閲覧
- ウォッチリスト — 物件が掲載終了後もスナップショットで保持
- Google OAuthログイン / 内部IP自動管理者認証

---

## フロントエンド構成

```
client/src/
├── App.tsx          # 全体の状態管理、サイドバー（路線・駅）、レイアウト
├── FilterBar.tsx    # エリア・価格・築年数などチップ形式のフィルター
├── PropertyCard.tsx # 物件カード（交通パース、価格履歴モーダル、お気に入りボタン）
├── Pagination.tsx   # ページネーション
├── LoginPage.tsx    # Google OAuthログイン画面
├── api.ts           # Axiosベースのクライアント
├── constants.ts     # フィルターオプション定数
└── types.ts         # 共通型定義
```

フィルター変更時は`AbortController`で前のリクエストを即キャンセルし、レスポンスの順序逆転を防いでいます。
ページ移動時は`skipCount`オプションでCOUNTクエリを省略し、応答速度を改善しています。

---

## バックエンド構成

```
server/
├── index.ts              # Expressアプリ、認証ミドルウェア、バッチクロールループ
├── crawler.ts            # Puppeteerクローラー（ページパース、詳細スクレイプ、DB保存）
├── db.ts                 # DB初期化、テーブル・ビュー作成、マイグレーション
├── lines.ts              # 30地域の定義（slug、prefecture）
├── types.ts              # サーバー共通型
└── routes/
    ├── properties.ts     # 物件取得API（複合フィルター、ソート、ページネーション）
    ├── auth.ts           # Google OAuthコールバック、JWT発行
    ├── watchlist.ts      # ウォッチリストCRUD
    └── favorites.ts      # お気に入り
```

**Cloudflare回避**
通常のPuppeteerはCloudflare Turnstileにブロックされます。
実際のブラウザフィンガープリントを使用する`puppeteer-real-browser`で回避し、
ブロック検知時は30秒後に自動リトライします。

**地域別テーブル分離 + UNION VIEW**
30地域を単一テーブルで管理すると、同時クロール時に書き込み競合が発生します。
地域ごとに別テーブル（`prop_chiyoda_city`など）を用意し、`properties` VIEWで統合する方式で解決しました。

**クロール安全装置**
収集件数が既存の30%未満になった場合、大量削除を自動で保留します。
新規物件のみ詳細ページを訪問し、不要なリクエストを最小限に抑えています。

---

## サーバー・インフラ構成

```
Docker Compose
├── postgres   PostgreSQL 16（データ永続ボリューム）
├── server     Node.js 20 + Express（クローラー含む）
└── client     Nginx（Reactビルド配信、HTTPS終端、APIプロキシ）
```

- Let's Encryptで HTTPS対応
- 内部ネットワークIPはJWTなしで管理者自動認証
- クローラーはサーバープロセス内の無限ループで8グループを順番に実行 — 別途スケジューラー不要
- 現在、首都圏11,000件以上の物件を運用中
