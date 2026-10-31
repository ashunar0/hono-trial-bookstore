# Friction

規約やキットの都合が悪かったところ。

- 列の名前を変える migration（`released_at` → `restored_at`）。`drizzle-kit generate` は「作る・名前を変える」を対話で聞いてくるので、TTY の無い環境では止まる。擬似端末で 2 番目（rename）を選んで通した。`AGENTS.md` の手順（`pnpm db:generate`）だけでは進められない。
- 既に行がある表に NOT NULL の列を足すとき（`orders.earn_id`）、既定値が必要。SQLite は NOT NULL で既定値なしの `ADD COLUMN` を、空の表でも受けつけない。「ID を注文のときに作って保存する」形（押さえ id・使用 id と同じ）は、後から足すと nullable になってしまう。
