# Friction

規約やキットの都合が悪かったところ。

- 列の名前を変える migration（`released_at` → `restored_at`）。`drizzle-kit generate` は「作る・名前を変える」を対話で聞いてくるので、TTY の無い環境では止まる。擬似端末で 2 番目（rename）を選んで通した。`AGENTS.md` の手順（`pnpm db:generate`）だけでは進められない。
- 既に行がある表に NOT NULL の列を足すとき（`orders.earn_id`）、既定値が必要。SQLite は NOT NULL で既定値なしの `ADD COLUMN` を、空の表でも受けつけない。「ID を注文のときに作って保存する」形（押さえ id・使用 id と同じ）は、後から足すと nullable になってしまう。
- 同じ `docs/domains.md` のとおり、使う・戻す・貯めるを point の usecase にすると、「注文まるごとの戻し」と「返品の一部の戻し」で必要な入力が違った（前者は使った履歴から量を読めば安全、後者は order が量を渡す）。usecase を 1 つにまとめるか 2 つに分けるかは規約に書いていなくて、判断になった（`restorePointsOfUse` と `restorePoints` に分けた）。
- 「他の usecase を呼ぶ」順番（確定の 6 段、キャンセルの 5 段）を 1 つの usecase の中で手で並べるので、段を足すたびに失敗のときの取り消しを手で書き足す（placeOrder の段 4 の失敗で、クーポンと在庫を戻して注文を消す）。段が増えるほど取り消しの組み合わせが増える。規約が「各段は 2 回呼ばれて同じ」を求めているので、取り消し側を `giveBack` に寄せれば足りたが、placeOrder の取り消しは「まだ注文を消せる」ので別の書き方になった。
- 動いている最中に割り込ませるテスト（締めと返品の申請の version の取り合い）は、`updateWithVersion` が db のどのメソッドを呼ぶかに依るので、差し替えて書けなかった。キットに「この書き込みの前に別の書き込みを入れる」テスト用の道具があると、設計書の同時実行の決まりを確かめやすい。
- lint の `require-array-sort-compare` が、テストの `.sort()` に比較関数を求める（warning）。`pnpm check` は warning でも通るが、出力に出るので毎回直した。
