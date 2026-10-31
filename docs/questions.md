# Questions

設計書を読んでもわからなかったこと。止まらずに、おすすめの方で進めた。

## point（段 1）

- QUESTION: 「データベース」タブは、ポイントの残高を `INSERT … ON CONFLICT DO UPDATE` の「無ければ作る」形で書くとあるが、そのままだと使う（負の増減）が通らない。SQLite は ON CONFLICT を見る前に、INSERT しようとする行（残高 = −200 など）に CHECK (balance >= 0) をかけるので、残高が足りていても落ちる。おすすめの方で進めた: 履歴の INSERT → 残高の行を 0 で作る（`ON CONFLICT DO NOTHING`）→ 残高を UPDATE で足し引き、の 3 文を 1 つの batch に。残高が足りなければ UPDATE の CHECK で batch ごと取り消され、残高の行が無い客が使っても同じく取り消される。設計書の書き方を直してほしい。
