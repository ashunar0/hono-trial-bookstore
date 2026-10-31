# Friction

規約やキットの都合が悪かったところ。機能は「返品を return ドメインに割り、交換を足す」。

## ドメインを割るとき（docs/domains.md）

- 割る手順が書いていない。「循環は、置き場所が間違っているしるし。両方が要るものは下のドメインに出す」とあるが、動かす順番は無い。今回は、返品を order から出すと、返品の状態を読む grantOrderPoints が order に残れず、1 回目のコミットで一緒に動かすことになった（order の列に触る一時の usecase を 3 つ挟んで、次のコミットで消した）。「その usecase は何を読むか」を先に数えて、読み先ごとドメインを決めてから動かす、と一文あれば迷わなかった。
- 表の持ち主（ルール 4）を lint が見ない。`domains/imports` が止めるのは import だけで、`src/db/schema.ts` の表はどこからでも import できる。order の queries が `returnsTable` を import して結んでも通る。割ったあとの「どの表がどのドメインか」は schema.ts の見出しの並びだけで守られていて、最初のコミットでは見出しの移し忘れがあった（自分で気づいた）。表の見出し（`// ── return ──`）と、その表を import してよいドメインを対応させる検査があると、割る作業の取りこぼしが減る。
- 「2 つのドメインにまたがって拾う」読みの置き場所は、`pickDue…` の形（usecase が相手の index に聞く）で書けたが、代償がある。以前の `ordersToGrant` は SQL 1 本（orders と returns を結ぶ）で、「発送済み・期限後・受け取り待ち無し・締めていない」を絞ってから 100 件取っていた。割ると orders（order の表）と return_windows（return の表）は結べないので、order から発送済みを 50 件ずつ読み、return 側で除く形になった。締め済みの注文も毎回先頭から読み直すので、発送済みの注文が増えると毎回の走査も増える。「拾う条件が別のドメインの表にまたがり、片方の条件が時間とともに増える」ときの正しい形（結ぶことの許し、または印をどちらかに持つ）が domains.md に無い。
- 他のドメインの index から使えない `usecases/_*` に、読むだけの判定（`findFor`：この客に見える注文か）があった。返品・交換が同じ見え方を要るので queries に移したが、「見え方の規則」を queries に置いてよいか（queries は決めない、とも読める）は書いていない。今回は読むだけなので queries にした。
- 値を持つだけで読まない他のドメインの id（refunds の `returnId`・`exchangeId`）が、order の表に return の言葉で入る。ルールとしては「id は値として持つ」で足りるが、order が return を知らない形（`order は返品も交換も知らない`）と、列の名前が return を指すのは緊張がある。`recordRefund` の入力を `of: { returnId } | { exchangeId }` にして order の中は列に写すだけにしたが、新しい種類の返金（ほかの機能）のたびに order の列が増える。
- 共有する前提の確認（`_checkRequest`）と、version を進める部分（`_advanceWindow`）を `usecases/_*` に出せたのは、よく働いた。返品と交換の申請が、同じ順番の確認を 1 か所に持てた。

## kit・テスト

- 「行が無ければ version 0」の形（在庫の `setStock`・返品受付の `advanceWindow`）は、`version === 0 ? insert : updateWithVersion` と 1 回目の insert の競合を毎回手で書く。inventory にもあるので同じ形が 2 か所。`updateWithVersion` の姉妹に「無ければ作る」があると、書き違いが減る。
- 同時に走るテスト（返品と交換を同時に申請、受け取りを同時に 2 回）は `Promise.all` で書けたが、2 つが読んだあと書く前に交互に動いたかは確かめられない。受け取りの同時のテストは、どちらが勝っても在庫と返金が合っている、という書き方にした（前の機能と同じ、読んだあと書く前に割り込ませる道具が欲しい）。
- 共通のテスト道具（`bookWith`・`put`・`shippedOrder`）が `src/routes/orders/_test-helpers.ts` にあり、return の usecase のテスト（`src/domains/return/usecases/*.test.ts`）や exchanges の route のテストが相対パスで読む。lint はテストを除外しているので通るが、「別の resource のファイルを読まない」と向きが合わない。前の機能でも書いたが、ドメインが増えて読む人が増えた。
- 状態が 5 つある交換（requested・received・shipped・rejected・refunded）の「今の状態ではできない」を、受け取り・断る・発送の 3 つで同じ形に書いた（`_exchangeConflict`）。hono-kit の failure は `details` に状態を持てるので書けたが、`kind` と `details` を usecase ごとに組み立てるのは、返品・注文でも同じ書き方が 3 回目になった。
