# Horizon (Hori) 現状の機能・UX一覧

作成日: 2026-07-12
目的: 現時点の実装内容をありのまま棚卸しする。UXの改善案をブレインストーミングする際の材料として使う想定なので、「本来こうあるべき」ではなく「今、実際にこう動く」を記載している。理想論・未実装のアイデアは「12. 既知のギャップ」に分けて記載した。

---

## 0. アプリの概要と技術構成

- 名称: **Horizon**（アプリ内のAIコーチ的な人格は「Hori」と呼んでいる）
- コンセプト: マインドフルな生産性・集中支援アプリ。単なるTodoアプリではなく、「タスクをActionへ分割し、1日の予定を立て、作業中の中断や休憩を記録し、その履歴を振り返りに使う」という循環を目指している（詳細は別紙「Hori_UX改善_修正案.md」参照。本ドキュメントは"今の実装"のスナップショット）。
- スタック: Vite + React + TypeScript + Tailwind CSS v3、Firebase（Firestore + Auth + Hosting）、AIはFirebase AI Logic経由でGoogle Gemini（`gemini-2.5-flash-lite`）を使用。
- デザイン: ニューモーフィズム調（`neumorphic-raised` / `neumorphic-sunken` の押し出し・くぼみ表現、`btn-squish` の押し込みアニメーション）。プライマリカラーは青系、セカンダリは赤系。
- 対応言語: UIチュームは英語ラベルが多いが、実際に入力・表示されるコンテンツ（タスク内容・AIの応答・説明文）は日本語中心。バイリンガル混在が現状の一貫したスタイル。
- 画面はPC（サイドバー常時表示）・モバイル（下部タブ+FAB）両対応。

### ナビゲーション構成

サイドバー（PC）/ 下部タブ（モバイル）に並ぶ6画面：

1. Today（`/`）
2. Inbox（`/inbox`）
3. Diagnose（`/diagnose/:taskId?`）— 画面タイトルは実質「Plan this Task」
4. Plan（`/plan`）— 画面タイトルは「Today's Plan」
5. Overlay（`/overlay/:taskId/:actionId`）— ナビには載っておらず、Today画面の「Start」からのみ到達する非表示ルート（モバイル下部タブにも出てこない）
6. Growth（`/growth`）

加えて、全画面共通で右下に**グローバルFAB**（＋ボタン）があり、押すと「Quick Dump」（Inboxへ移動）と「Build Plan」（後述の開発者向けメタ機能パネルを開く）の2択が出る。

各画面の見出し横には「?」ヘルプボタンがあり、クリックでその画面の使い方を説明するモーダルが開く（2026-07-12追加）。

---

## 1. データモデル概要（画面の裏側）

Firestoreコレクション: `tasks`, `actions`, `workSessions`, `dailyPlans`, `dailyReviews`(スキーマのみ、未使用), `growthLogs`, `userSettings`, `features`, `ideas`。

- **Task**: `title`, `originalInput`（Inboxの生入力）, `status`(`inbox`|`planned`|`in_progress`|`interrupted`|`done`), `inboxTriage`(`unsorted`|`today`|`later`、UIは未実装), `outputGoal`（完成イメージ）, `currentState`（現在地）, `deadline`, `estimatedTotalMinutes`/`actualTotalMinutes`（集計キャッシュ）, `isMain`, `skipCount`。
- **Action**: `taskId`/`taskTitle`（非正規化）, `title`, `output`/`completionCriteria`（AI分割時に生成、UI表示は完了条件のみ）, `estimatedMinutes`, `status`(`todo`|`doing`|`done`|`skipped`), `deferredTo`（「明日に回す」で設定）。
- **WorkSession**: `type`(`focus`|`break`), `status`(`active`|`completed`|`interrupted`|`cancelled`), `taskId`/`actionId`, `plannedMinutes`/`actualMinutes`, `interruptionReason`, `noteTrigger`(`done`|`break_start`|`exit`), `note`, `estimatedProgress`(未使用・UIから入力不可), `estimatedRemainingMinutes`, `nextStartAction`, AI要約フィールド(`aiStatus`/`structured`/`suggestedActions`)。
- **DailyPlan**: `date`, `requiredGoal`, `requiredActionIds`(最大2件), `requiredGoalCondition`, `selectedActionIds`, `calendarBusySlots`（手入力の固定予定）, `plannedSlots`, `freeTimeSlots`（常に空配列、未使用）, `bufferSlots`, `dayEndTime`。
- **DailyReview**: 型だけ定義済み。生成・表示するUIはまだ存在しない。
- **UserSettings**: `mainGoal`（週次メイン目標）, `weekdayCapacityMinutes`/`weekendCapacityMinutes`（旧Capacity画面時代の設定、現在UIから編集不可）, `scopeGuard`（Build Roadmap用）。

---

## 2. 認証（Login / Signup）

- メール+パスワードのみ。`/login`と`/signup`は別ルート（トグルではない）。
- Signupで表示名を入力（Firebase Authの`displayName`に保存、Sidebarのアカウント表示に使われる）。
- Loginにパスワードリセット機能あり（「パスワードをお忘れですか？」→ リセットメール送信）。
- ログアウトはSidebar下部のアカウント表示をクリック→ドロップダウンから。常時表示のログアウトボタンはない。
- 未ログインでの保護ルートアクセスは`/login`へリダイレクト。ログイン済みで`/login`/`/signup`にアクセスすると`/`へリダイレクト。

---

## 3. Today（`/`）

### 目的
今日取り組むActionを表示し、作業を開始する起点になる画面。

### 表示要素・機能
- ヘッダー：タイトル「Today」＋ヘルプボタン、今日の日付。右側に「Add Task」ボタン（`/inbox`へ遷移）と、機能未接続の「layers」アイコンボタン（onClickなし＝現状見た目だけ）。
- **ステータスカード**（左2/3幅）：
  - 「Status: Working / On Break / Replanning」という表示だが、これは**ローカルのUI状態のみ**で、実際の作業記録（WorkSession）とは連動していない。押しても記録は残らない（本物の計測はOverlay側のみ）。
  - Horiの一言メッセージ（統計に基づくルールベースの固定文からランダム選択。AI生成ではない）。
  - 「Work / Break / Replan」ボタン3つ。見た目上の切り替えのみ。
- **Main Timeカード**（右1/3幅）：週次のメイン目標（名前＋週の目標時間）。未設定なら「目標を設定」から作成。進捗リング表示はあるが**常に0%固定**（進捗計算が未実装）。
- **Next 15 Actions**：`todo`/`doing`状態の全Actionをカードで一覧表示。各カードに：
  - タスク名／Action名／見積り分／Low・Med・High Loadバッジ（見積り分をしきい値で色分けしただけの簡易表示）
  - 「Focus: Deep Work」という**常に固定表示のラベル**（実データと連動していない）
  - 「Start」（`/overlay/:taskId/:actionId`へ）、「Edit」（タイトル・見積り分をその場編集）、「Skip」（`skipAction`：ステータスを`skipped`にし、親タスクの`skipCount`を+1）
- Horiの一言メッセージは以下の状態を見て選ばれる（`statusMessages.ts`のルールベース）：休憩超過（20分超）、連続作業60分超、今日3件以上Action完了、締切3日以内で未着手Actionがある、アクティブAction見積り合計180分超、`skipCount`が2以上のタスクがある、深夜（23時〜5時）に作業中。これら以外は「順調です」系の文言。

---

## 4. Inbox（`/inbox`）

### 目的
思いついたことをそのまま書き出す、低コストの捕捉画面。

### 表示要素・機能
- テキストエリア＋マイク（Web Speech APIでの音声入力、ブラウザ非対応ならalert）／クリップボード貼り付けボタン。
- 「Text / Voice / Quick Add」タブがあるが、**切り替えても表示内容は変化しない**（現状すべて同じテキスト入力UI、見た目だけのタブ）。
- 「Add to Inbox」：改行区切りで**1行＝1タスク**として`tasks`（status: `inbox`）に登録。プレースホルダーにその旨明記。
- 「Captured Today」：`inbox`状態のタスクを新しい順に一覧表示。各アイテムに相対時刻（just now / Nm ago等）、固定バッジ「Waiting for AI Diagnosis」、「Diagnose」ボタン（`/diagnose/:taskId`へ）、「⋮」メニュー（編集・削除）。
- 編集はテキストエリアでのインライン編集、保存で`originalInput`のみ更新（タイトルや分割済みActionには影響しない）。

---

## 5. Diagnose（`/diagnose/:taskId?`, 画面表示は「Plan this Task」）

### 目的
1つのタスクを実行可能なAction群に分割する。

### 表示要素・機能
- 「Task Note」欄：Inboxからの生入力テキスト（新規タスクの場合は自由入力可）。
- 「Plan」欄：タイトル・完成イメージ（アウトプット）・現在地（どこまで出来ているか）・締切（日付、任意）を入力。すべて必須（締切以外）を入れないと分割ボタンが押せない。
- 「Actionへ分割してもらう」：Gemini APIを呼び、2〜6件のAction案（タイトル・見積り分・完了条件）を生成。プロンプトは「45分を超える単一Actionを提案しない」旨を明示。
- 提案結果はその場でタイトル・見積り分・完了条件を編集可、✕で個別削除可。
- 「この分割で計画を確定」：タスクを`status: 'planned'`にして`outputGoal`/`currentState`/`deadline`を保存し、提案された各Actionを実際に`actions`コレクションへ作成（`estimatedTotalMinutes`も自動加算）。保存後は`/`（Today）へ遷移。
- 既存タスク（`taskId`あり）を開いた場合は既存の`title`/`outputGoal`/`currentState`を読み込んで再編集できる。
- **リスク診断（HIGH/MEDIUM/LOW等）は廃止済み**。旧バージョンにあった機能で、現在は完全にAction分割に一本化されている。

---

## 6. Plan（`/plan`, 画面表示は「Today's Plan」）

### 目的
1日の時間割（予定表）を作る。旧「Capacity」画面（週次の空き時間バーチャート）を完全に置き換えたもの。

### タブ
「今日」「明日」「3日後まで」の3タブ。

### セットアップフォーム（今日その日の予定がまだない場合、または「予定を作り直す」を押した場合に表示）
1. **今日の状態**：睡眠時間（数値入力）、今の体調（良い/普通/しんどい の3択）。
   - ⚠️ **睡眠時間はUI上入力できるが、どこにも保存・利用されていない**（見た目だけの入力欄）。
   - 体調（`fatigue`）は下記の予定表生成の「詰め込み率」に使われる（良い80%／普通75%／しんどい50%）が、**DailyPlan自体には保存されない**ため、「予定を作り直す」で再度セットアップを開くと常に「普通」にリセットされる。
2. **今日中に終わらせたいこと（必須目標）**：自由記述のテキスト（`requiredGoal`として保存）。下の候補一覧で「必須」指定したAction（最大2件）がある場合のみ、達成条件（タスク全体完了／選んだAction完了／一定時間作業）の選択肢が出る。
3. **今日進めるAction**：`todo`/`doing`状態の全ActionをHoriが以下のロジックでランク付けし、上位5件を「おすすめ」として表示（「すべて表示」で全件展開）：
   - 締切が3日以内 → 「締切が近い」
   - タスクが`interrupted` → 「中断中」
   - タスクが`in_progress` → 「進行中」
   - それ以外 → 「その他」
   - 各Actionをクリックで選択/解除、「必須」ボタンで最大2件まで必須指定。
4. **固定予定**：手入力（タイトル・開始・終了時刻）で0件以上追加。Googleカレンダー連携は未実装で、これは**その仮の代替**として明記されている。
5. **今日の終了予定時刻**：時刻入力（デフォルト22:00）。
6. 「予定表を作成」：`dailyPlanEngine.ts`のアルゴリズムでスケジュールを自動生成：
   - 今の時刻(`dayStart`)から終了予定時刻(`dayEnd`)までを、固定予定で分割して空き区間を算出。
   - 午前（12時より前）の区間を優先的に使い、必須Action→その他Actionの順に、各区間の「詰め込み率」分だけ詰めていく（Action間に5分の隙間を自動挿入）。
   - 各区間で使い切らなかった残りは「バッファ」として（ラベル付きの空白ブロックとして）表示。
   - 区間に入らなかったAction（時間が余らなかった分）は「今日は入りませんでした」リストへ。

### 予定表ビュー（作成後）
- 必須目標（`requiredGoal`）があれば冒頭にハイライト表示。
- タイムライン：固定予定（グレー背景）／Action（通常カード、開始・終了時刻＋↑↓の並び替えボタン＋「明日に回す」ボタン＋開始時刻を直接変更できる時刻入力）／バッファ（点線の空白ブロック、ラベルのみ）を開始時刻順に並べて表示。
  - 「↑↓」は**隣接する2つのActionブロックの開始・終了時刻を入れ替えるだけ**（固定予定やバッファを挟んだ並び替え、時間の自動詰め直しは無い）。
  - 「明日に回す」：そのActionを今日の`plannedSlots`から削除し、Actionの`deferredTo`に翌日の日付をセット。
  - 時刻変更：その場でAction単体の開始時刻のみ変更（他のブロックとの重複チェックは無い＝ユーザーの自己責任で自由編集、という設計）。
- 「今日は入りませんでした」：選択したが予定表に入らなかったActionの一覧（読み取り専用）。
- 「明日」「3日後まで」タブ：**実際のスケジュールではなく簡易プレビュー**。締切が翌日/2日後のAction、または「明日に回す」で`deferredTo`が翌日/2日後になっているActionを一覧表示するだけ。時間割は生成されない（本文中にも「当日の朝にあらためて作成してください」と明記）。

---

## 7. Overlay（`/overlay/:taskId/:actionId`）

### 目的
実際にActionへ取り組む間のタイマー・状態管理画面。ナビゲーションには表示されず、Todayの「Start」からのみ到達。

### 状態遷移
`loading` → `focus`（作業中） ⇄ `break`（休憩中） → `suggestions`（休憩から戻る際、AI提案がある場合のみ経由） 。`error`（Actionが見つからない場合）。

### 主な機能
- 進入時に自動で対象Actionを`doing`にし、`workSessions`にfocusセッション（`plannedMinutes`=Actionの見積り分）を作成。
- **カウントダウン表示**：残り時間をタップで一時停止・再開できる（`paused`はローカル状態のみで、休憩とは異なる概念）。時間超過時は負数（マイナス表示）になる。
- 「Next 15 min」カード：現在のAction名を表示、鉛筆アイコンでタイトル・見積り分をその場編集（`overwriteAction`）。
- **Take Break**：進捗メモ入力を経て、focusセッションを`completed`にし、5分固定の`break`セッションを開始。
- **Done**：進捗メモ入力を経て、focusセッションを`completed`にし、Actionを`done`にして`/`へ遷移。
- **右上×（Exit）**：進捗メモに加えて「中断理由」（疲れた／行き詰まった／飽きた・集中できない／返信待ち／資料・情報待ち／別の作業を優先／その他）、残り時間の見積り（分）、次に戻った時の最初の行動、を追加で入力できる。セッションは経過1分未満なら`cancelled`、それ以上なら`interrupted`。Action自体のステータスは変化しない（中断してもActionは`doing`のまま残る）。
- 各メモ入力は「Skip」で省略可能（すべて任意）。
- メモに文字が入力された場合のみ、非同期でGemini APIに投げて「doneSummary/nextSummary/blockerSummary/ideaSummary」への要約＋0〜3件の次Action提案（`overwrite_current`=現在のActionを上書き／`add_new`=新規Actionとして追加）を生成（`aiStatus`で二重処理を防止）。
- 「Back to Work」（休憩から復帰）：直前の`break_start`メモがAI処理済みで提案がある場合、提案一覧画面（`suggestions`フェーズ）を経由。提案を選ぶと即座に反映して新しいfocusセッションを開始。「自分で決める」でスキップも可能。
- 休憩フェーズでは、休憩超過分数を「Nm over」で表示。

---

## 8. Growth（`/growth`）

### 目的
1日の学びの振り返りを記録する。

### 機能
- 「今日、自分の言葉で説明できるようになったことは？」への自由記述＋「Generate AI Memo」でGemini APIが以下を生成：要約(`summary`)、箇条書き2〜4点(`bulletPoints`)、確認クイズ1問(`quizQuestion`)、明日のチャレンジ(`tomorrowChallenge`)。
- クイズ回答欄＋「Check」：Gemini APIで簡易採点（正誤＋一言フィードバック）。
- 「Save Log」：`growthLogs`へ保存（1日に何度でも保存可、上書きなし）。
- 「Export Markdown」：現在表示中のログをMarkdownファイルとしてダウンロード（Firestore無関係、クライアントのみ）。
- 「Previous Reflections」：過去の振り返りを新しい順に一覧表示。各ログにも個別のMarkdown書き出しボタンあり。
- ⚠️ **Task/Action/Overlayとの連携は無い**。振り返り内容は完全に独立したテキストで、「今日完了したAction」などとは紐付いていない。

---

## 9. Build Plan（グローバルFABの「Build Plan」から開くパネル）※開発者向けメタ機能

Horizonというアプリ自体の開発を自己管理するための、エンドユーザー向けタスク管理とは別軸の機能。「Build Roadmap」と「Idea Parking」の2タブ。

### Build Roadmap
- MVP／Next／Later／Ideasの4カラムのカンバン。各カードに機能名・タグ・優先度・（あれば）追記メモ件数。
- カードクリックで詳細パネル（機能名・説明・優先度・難易度・ステータス・カラム移動ボタン・Current Focus設定・追記メモ・削除）。
- 各カラム内で「↑↓」による手動並び替え（`order`フィールドの隣接スワップ）。
- 「Current Focus」：1件だけ設定でき、理由・期待効果・次のアクションを添えてボード上部にハイライト表示。
- 「Scope Guard」：折りたたみ式の「Do Now / Not Now」リスト（今やること／今はやらないこと、を宣言する自己管理メモ）。
- 初回アクセス時、機能が0件なら初期シードデータを自動投入。

### Idea Parking
- Horizon関連に限らない、なんでも思いつきを書き留める場所。「Add Idea」「Add and Keep Writing」「Ask AI to lightly categorize」（Geminiが方向性の提案＋2〜3の選択肢を出すのみで、**AIは何も決定しない**という明示ルール）。
- カテゴリ（App Idea/Research/Design/Learning/Life・Workflow/Writing/Other）、ステータス（Raw/Growing/Maybe Task/Converted/Archived）、Pin、検索、ステータス絞り込み。
- 詳細パネルでタイトル・メモ・カテゴリ・ステータス編集、追記メモ、AI整理の再実行、「Convert to Feature Idea」（Roadmap側にFeatureとして複製）、Archive等。

---

## 10. 横断的な既知の未実装・簡易実装ポイント（改善検討のたたき台）

- **Today画面のWork/Break/Replanボタンとステータス表示**は完全にローカルUIのみで、実際のWorkSessionと連動していない。ユーザーが実際に作業しているかどうかの実態は反映されない。
- **Main Timeの進捗リングは常に0%**（進捗計算未実装）。
- **Todayの「layers」ボタンは未接続**（onClickなし）。
- **Inboxの「Voice」「Quick Add」タブは見た目だけ**で機能の切り替えは起きない。
- **Next 15 Actionカードの「Focus: Deep Work」ラベルとLoad区分は固定表示・簡易ヒューリスティック**で、実データに基づくものではない。
- **Plan画面の睡眠時間入力は保存も利用もされていない**（体調（fatigue）だけが詰め込み率に影響し、そのfatigue自体もDailyPlanに保存されないため再編集時にリセットされる）。
- **Plan画面の「明日」「3日後まで」タブは簡易プレビューのみ**で、実際の時間割は生成されない。
- **Overlayのブロック並び替えは隣接スワップのみ**。固定予定やバッファを挟んだ移動、時間の自動再計算は無い。
- **DailyReview（1日の終わりの振り返り）はデータモデルのみ存在し、生成・表示するUIが無い**。
- **Growth LogとTask/Action/Overlayは完全に独立**していて、振り返りが翌日の計画やAI提案に反映される仕組みは無い。
- **週次のMain Goal（`userSettings.mainGoal`）と日次のRequired Goal（`dailyPlans.requiredGoal`）という2つの「目標」概念が並存**していて、互いに参照・連携していない。
- **Googleカレンダー連携は完全に未実装**。Plan画面の「固定予定」は手入力のみで、実際の読み取り・書き込みは無い。
- **Inboxの「1日の終わりの整理」（今日中に扱う／後で扱う／削除）UIは存在しない**（`Task.inboxTriage`フィールドはあるが、セットする画面が無い）。
- **中断（Overlayの×）を繰り返した場合の自動検知・再計画提案は無い**（理由や回数は記録されるだけで、それを使った後追い処理は未実装）。
- **旧`userSettings.weekdayCapacityMinutes`/`weekendCapacityMinutes`（旧Capacity画面の週次稼働時間設定）は編集するUIが今は存在しない**（データフィールドとしては残っている）。
- 週次振り返り・見積り精度の自動分析（見積もりと実績の差、中断理由の集計など）は構想のみで実装は無い。

---

## 11. 参考：関連ドキュメント

- `Hori_UX改善_修正案.md`（リポジトリルート）：本アプリのUXを「タスク管理アプリ」から「1日の計画・実行・振り返りループを支援するシステム」へ発展させるための設計思想・要件定義書。本ドキュメントで書いた「現状」の多くは、この修正案の一部（データモデル刷新、Plan＝1日の予定表画面、Overlayの中断理由記録、ヘルプ機能）を実装した結果。まだ着手していない項目（Inbox整理UI、DailyReview、週次振り返り、Googleカレンダー本実装など）も同ドキュメントに記載されている。
