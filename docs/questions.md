# Questions

設計書を読んでもわからなかったこと。止まらずに、おすすめの方で進めた。機能は「返品を return ドメインに割り、交換を足す」。

## 段 1・2: 返品を割る

- QUESTION: 段 1 のあと、grantOrderPoints を order に残せるか。残せない。grantOrderPoints は返品の状態（受け取り待ち）を読むので、order に残すと order → return の向きができ、return → order（注文と行を読む、返金を記録する）と合わせて循環になる。おすすめの方で進めた: 段 1 のコミットで grantOrderPoints と拾う読みも一緒に return へ移し、orders のポイント締めの列に触る所だけ order の一時の usecase（`touchOrder`・`closeOrderPoints`・`markOrderPointsEarned`）を通した。段 2 で return_windows に置き換えて一時の usecase を消した。「段 1 は返品だけ、段 2 でポイント」とは分けられず、段 1 の時点で一部を先取りした。
- QUESTION: `shareOf`（1 冊ずつの取り分の割り振り）はどちらの rules か。設計書は「返品の返すお金とポイント → return/rules.ts（割り振りは order/rules.ts を直接読む）」。割り振りの `allocateDiscount`・`allocatePoints` は確定のときしか使わないので order に残るが、`shareOf` は返品だけが使う。おすすめの方で進めた: `shareOf` は割り振りの仲間として order/rules.ts に残し、return/rules.ts が直接読む（`refundOf`・`pointsRefundOf` が使う）。
- QUESTION: 返金を記録する usecase の形。設計書は「返金は order に残し、return は order の usecase で記録する」とだけ。おすすめの方で進めた: `recordRefund(deps, { orderId, of: { returnId } | { exchangeId }, amount, points, now })`。返金の id（`refundIdOf`）と、うち消費税（合計に 1 回だけ、`taxWithin`）は order が決める。return が pricing を読まずに済み、ドメインの表の「return の読む先: order・inventory・point」のまま。キャンセルの返金は今までどおり order の `giveBack` が直接書く。
- QUESTION: 「この客のこの注文」を見る読み（`findFor`）の置き場所。`findFor` は `order/usecases/_findFor.ts` にあり、他のドメインの `index.ts` から使えない。return の申請も同じ見え方（placing は 404、他人の注文も 404）が要る。おすすめの方で進めた: 読むだけで書かないので `order/queries.ts` の `findOrderFor` に移して index から出した。`conflictNow`（err を返す）は `usecases/_conflictNow.ts` に残した。
- QUESTION: ポイントを貯める注文の拾い方。以前は 1 本の SQL（orders と returns を結ぶ）で、「発送済み・14 日を過ぎた・受け取り待ちの返品が無い・締めていない」を拾っていた。割ると orders は order の表、returns と return_windows は return の表で、結べない。おすすめの方で進めた: return の `pickOrdersToGrant` が order の `shippedOrdersEarning`（発送済みで貯める注文を、発送の古い順に 50 件ずつ）を聞き、return 側で「締め済み」「受け取り待ち」を除く。1 回に拾うのは今までどおり 100 件まで。代償: 締め済みの注文も毎回読むので、発送済みの注文が増えると毎回の走査が増える（friction に書いた）。
- QUESTION: return_windows の列。設計書は「注文 id・ポイント締めの日時・貯め終えた日時・version」。おすすめの方で進めた: `updated_at` を足した（動かした時刻。version を進めるだけの更新でも書く）。
- QUESTION: 段 2 の migration で、すでに締めた注文はどうするか。おすすめの方で進めた: 列を落とす前に、締め済み（`points_closed_at` が入っている）の注文を return_windows に写す（version 1、貯め終えた日時もそのまま）。写さないと、貯め終えていない注文を cron がもう一度締めてしまう。手で書いた文を migration に足した（`sqlite3` で確かめた）。
- QUESTION: 段 2 でテストの期待値を変えたか。値は変えていない。`grantOrderPoints.test.ts` が見る場所だけ変えた: 締めた日時・貯め終えた日時は orders の列から return_windows の行へ。「締めは version を進める」のテストは、注文の version（+1）から返品受付の version（無い=0 から 1）になった。racing の 3 つ目（同じ冊数の申請が同時）は、進める先が注文から返品受付になったが、書き換えずに通った。
- QUESTION: 返品の申請で動きが変わったところ。前は申請が `orders.version` と `updated_at` を進めていたが、今は返品受付の version だけが進み、注文は動かない。客の操作で注文の version を送るのはキャンセルだけで、申請できるのは発送後（キャンセルできない）なので、見える違いは無い。
- QUESTION: 申請が version を進めてから書く形の穴。申請 A が返品受付を進めたあと、返品を書く前に、別の申請 B が返品受付を読むと、B は進んだ version を読んで冊数を数える（A の返品はまだ無い）ので、両方通りうる。段 1 以前の注文の version でも同じ形。小さな隙間なので直さなかった。直すなら、読んでから数える順にして、数えたあとにもう一度 version を見る。
- QUESTION: 設計書の誤りに近いもの。ドメインの表（読む・呼ぶ先）は「return は order（注文と行を読む、返金を記録する）・inventory・point」で足りている。ただ「概要とルール」の GET /orders/[id] の説明（API タブ）と応答例は、交換が入る前の形のまま（`returns`・`refunds.returnId` だけ）。

## 段 3: 交換の申請と一覧

- QUESTION: GET /exchanges で客に自分の分だけ見せるとき、客の id をどこから読むか。exchanges の表に客の列が無く、orders は order の表なので結べない。おすすめの方で進めた: `exchanges.customer_id` を足し、申請のとき注文から写す（stock-alert が email を写すのと同じ形）。設計書の列に無い。
- QUESTION: 申請の errors。API タブの表にあるのは新しい code が EXCHANGE_STATUS_CONFLICT だけ。おすすめの方で進めた: 申請の 422・409 は返品と同じ code（`RETURN_PERIOD_ENDED`・`ORDER_STATUS_CONFLICT`・`RETURN_QUANTITY_EXCEEDED`。冊数は返品と交換を合わせて数える）。
- QUESTION: 交換の理由の値。`damaged` と `defective` をそのまま enum にした。それ以外は 400。
- QUESTION: 交換に載せる日時。設計書は「申請／受け取り／発送の日時・戻し終えた日時」。おすすめの方で進めた: 返金にしたときの時刻は `received_at`（店が傷んだ本を受け取った時刻なので、受け取った交換と同じ列）、断った時刻は返品に合わせて `rejected_at` を足した。
- QUESTION: GET /orders/[id] の応答。設計書は「行・返品・返金つき」。おすすめの方で進めた: `exchanges` を足し、返金に `exchangeId` を足した（これが無いと、交換の返金は `returnId: null` で、キャンセルの返金と見分けがつかない）。
- QUESTION: 交換の権限。権限の表は「交換を申請する: 客（自分の、14 日以内）／受け取る・断る・発送する: 店」。おすすめの方で進めた: 申請は `requireRole("customer")`（店の人は 403）、受け取る・断る・発送するは `requireRole("staff")`、GET /exchanges は `requireAuth`（客は自分の分、店は全部）。

## 段 4: 受け取る・断る・発送する

- QUESTION: 「交換品を 1 冊押さえる」は、行が複数・冊数が複数のとき。おすすめの方で進めた: 交換の全部の行の冊数を 1 つの押さえ（id は交換 id から決まる `exchange-<交換 id>`）で押さえる。足りない本が 1 冊でもあれば全部返金（部分的に送って部分的に返金、にはしない）。
- QUESTION: 受け取りをやり直したとき、前の試みが押さえたままだったら。前の試みが押さえて切り替える前に落ちると、押さえた分だけ在庫が減っているので、やり直しの在庫の確認（reserveStock が先に読む）が「足りない」と見て返金に進みうる。おすすめの方で進めた: 返金に進むとき、切り替えのあと交換 id の押さえを戻してから返金する（無ければ何もしない）。設計書の「在庫が無いとき」の段には、この押さえを戻す段が無い。
- QUESTION: 受け取りが負けたとき（押さえたあと切り替えで version に負けた）。おすすめの方で進めた: 勝った側が「受け取った」なら押さえはその交換品なので戻さない。それ以外（断った・返金にした）なら押さえを戻す。
- QUESTION: 断るとき押さえを戻す順番。「断る」は手放す側なので切り替えが最初、押さえを戻すのはそのあと。切り替えのあと戻す前に落ちると、押さえが残る。それを拾う cron は設計書に無い（拾うには、断った交換に押さえがあるかを調べる印が要る）。おすすめの方で進めた: 作らなかった。押さえが残るのは「押さえたあと切り替える前に落ちた受け取り」と「断った直後に落ちた」の組み合わせだけ。
- QUESTION: 返品の返金の「それ以前に返した冊数」に、返金にした交換を入れるか。設計書は「返金にした交換は返品と同じく数える」（申請できる冊数）だけで、返金の端数（最後の 1 冊が持つ）の数え方は書いていない。おすすめの方で進めた: 返品の返金も交換の返金も、「完了の返品＋返金にした交換のうち、自分以外」を使う。同じ行の端数が、返品と交換をまたいでも合計が払った額ちょうどになる。
- QUESTION: ポイントを貯める条件に交換。おすすめの方で進めた: 申請中の交換、返金にしたが戻し終えていない交換がある注文は飛ばす。受け取った交換は待たない（設計書どおり）。貯まる量の元から引く返したお金は、返品の返金と交換の返金の両方。
