# Friction

規約やキットの都合が悪かったところ。機能は「入荷のお知らせ」。

- 別のドメインの値で絞る読み（「在庫が 1 以上の本の待ち」）を置く場所。`docs/domains.md` は「いくつかのドメインにまたがる読みは route で組み立てる」と書くが、cron は route ではない。queries は他のドメインの `index.ts` を読めず、usecase は書き込みのものなので、cron のファイルの中に 50 冊ずつ inventory に聞く関数を書いた（`src/crons/send-restock-alerts.ts` の `waitingInStock`）。cron でも同じ形で書いてよい、と一文あれば迷わなかった。
- その読みは SQL で表を結べば 1 本で済むが、「表は 1 つのドメインだけが読む」で結べない。結ばないので、待っている本の id を全部読み、D1 の値の数の上限に合わせて 50 ずつに分ける手間が出た。規約の代償としては想定内だが、件数が増えると効いてくる。
- mailer の本番の既定。`inbound-outbound.md` は「集めるダミーは配列をモジュールの上に持てない」と書くが、本番でダミーを使うとき何を既定にするかは書いていない。ログに書くだけにした（`logMailer`）。テスト用の `collectingMailer`・`downMailer` が本番のコードと同じファイル（`src/lib/mailer.ts`）に入る。テスト用の道具を置く決まった場所（`test/` が良いか）が欲しい。
- `makeDeps(env, overrides)` は `inbound-outbound.md` のとおり書けたが、`test/fixtures.ts` の `appAs` は `makeDeps(env)` を直に呼ぶので、HTTP のテストで mailer を差し替える口が無い。今回は HTTP から mailer を呼ばないので困らなかった（cron のテストは `cron.run({ deps: makeDeps(env, { mailer }) })`）。
- 「読んだ状態と回数のときだけ切り替える」更新（`startAttempt`）は、表に version を持たない設計なので `updateWithVersion` が使えず、`WHERE id AND status AND attempts` の更新を手で書いた。version の代わりに「読んだ値」で見る形のための道具はキットに無い。
- 同時に走るテスト（同じ登録を 2 つの run が同時に送る）は `Promise.all` で書けて通ったが、2 つが本当に交互に動いたかは確かめられない。前の機能の friction と同じで、読んだあと書く前に割り込ませる道具があると、「負けた方は何もしない」を確実に確かめられる。
- テストの共通の道具（`bookWith`・`put`）が `src/routes/orders/_test-helpers.ts` にあり、restock のテスト（domains や crons や別の route）がそれを相対パスで読む。lint はテストを除外しているので通るが、「別の resource のファイルを読まない」の決まりと向きが合わない。共通のテスト道具を置く場所が決まっていない。
- 一意制約の名前。`uniqueViolationOf` が複数列の索引で `"restock_alerts.customer_id, restock_alerts.book_id"` と全列を並べた文字列を返すので、比べる文字列を手で書いた。索引の名前（`restock_alerts_open`）で比べられると壊れにくい（条件つきの索引は列の並びで返るので、式の索引のときだけ名前になる、という `hono-kit/sqlite` の仕様）。
