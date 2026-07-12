# Hori UX改善（Claude向け修正案）— 設計確定事項

作成日: 2026-07-12
対象: `Hori_UX改善_Claude向け修正案.md` への回答・設計確定
今回のスコープ: **ロジック/データモデル設計のみ。コードは書かない。** 画面デザイン受領後、実装に着手する。

---

## 1. Mission概念の定義

**Missionは表示層だけの概念。データモデルはAction / WorkSession(休憩) / バッファ・自由時間を分離したまま維持する。**

Todayの「主役カード」が今どれをレンダリングしているかを指す言葉として使う。3種類のレンダリング対象がある：

- **work Mission** = 今日のPlan（`plannedSlots`）に載っているAction
- **break Mission** = 休憩中のWorkSession
- **free Mission（自由時間）** = 表示はするが干渉を最小限にする。Horiからの通知/CTAは出さない方針を維持（旧修正案の課題7の考え方を継続）

どれを表示するかの選定ロジックは第3節（DayPhase計算）の一部として扱う。

**判断根拠（忖度なしの意見）：** Action/休憩/自由時間はデータの形が違いすぎる（Actionはタスク紐づけ・完了条件を持つが、休憩は単純な時間枠、自由時間は「Horiが管理しないこと」自体が価値）。1つのFirestore型に統合すると null許容フィールドの増加かtype分岐が必要になり、統合の恩恵より複雑化のコストが大きい。ドキュメント自身も`DayPhase`で`working`/`break`を別値にしており、内部的には最初から分けて考えられている。

---

## 2. Mission選定ロジック（Today表示の中心ロジック）

- 今日の`DailyPlan.plannedSlots`を唯一の真実のソースとする。
- `DailyPlan`が存在しない、またはMorning Setup未完了 → Today = Morning Setup（Plan画面）への誘導。
- `plannedSlots`を開始時刻順に見て、未完了（対応Actionが`done`/`skipped`でない）で最も早いものを現在のMissionとする。
- activeなfocus WorkSessionがあれば、それに対応するActionを時刻順より優先してCurrent Missionとする。
- activeなbreak WorkSessionがあれば、break Missionを表示する。
- すべての`plannedSlots`が完了 → Evening Review系の表示に遷移。
- **Planに載っていないtodo Actionは、Planで選ばれるまでTodayには出てこない。** Planを作ることが前提のフローになる（Plan未作成でもTodayは動くが、Morning Setupへの誘導が最優先表示になる）。

---

## 3. DayPhase（計算専用・Firestoreに保存しない）

```ts
type DayPhase =
  | 'morning_setup'   // 今日のDailyPlanが無い、またはMorning Setup未完了
  | 'mission_ready'   // Missionはあるがfocus WorkSessionが未開始
  | 'working'         // focus WorkSessionがactive
  | 'break'           // break WorkSessionがactive
  | 'mission_result'  // 直前のMissionがdoneになった直後、次Mission未選択
  | 'support'         // 介入条件に合致（開始遅延/休憩超過/連続中断等）
  | 'evening_prompt'  // 23:00以降、今日の終了確認が未実施
  | 'daily_review'    // 終了確認で「振り返る」を選んだ
  | 'tomorrow_plan'   // 振り返り後、翌日の計画確認
  | 'day_complete'    // 終了確認済み
```

**保存せず、Todayレンダリング時に毎回計算する純粋関数として実装する**（`computeDayPhase(now, dailyPlan, activeWorkSession, actions, dailyReview)`）。理由：Cloud Functions等のサーバー側cronがまだ無いため、「時間経過だけで変わるべき状態」（23時到達など）を保存型フィールドにすると誰が更新するかという問題が生じる。既存の`statusMessages.ts`と同じ設計思想（毎回導出）を踏襲する。

優先順位（元ドキュメント5.2節をベースに整理）：

1. 23時以降 & 終了確認未実施 → `evening_prompt`
2. Morning Setup未完了 → `morning_setup`
3. activeなfocus WorkSessionあり → `working`
4. activeなbreak WorkSessionあり → `break`
5. 介入条件（第4節）に合致 → `support`
6. 直前Action完了直後で次未選択 → `mission_result`
7. 本日の`plannedSlots`全完了 → `tomorrow_plan`（`daily_review`実施済みなら`day_complete`）
8. 次のMissionが存在する → `mission_ready`
9. `plannedSlots`が空（未計画タスクのみ存在） → `morning_setup`（Planへの誘導）
10. Task/Actionが存在しない → Inboxへの誘導

---

## 4. 休憩の二段階閾値（既存statusMessages.tsを置き換え）

- **10分超過**：軽い通知。Missionカード内の軽微な表示分岐、または一言メッセージ。
- **20分超過**：重要通知＝`support`フェーズへの遷移トリガー。理由確認＋Mission変更/延長/縮小の提案。

既存の`BREAK_OVERRUN_THRESHOLD_MINUTES = 20`（一段階）は10分/20分の二段階に置き換える。`continuousWork`（60分）等、休憩以外の既存条件は維持。

---

## 5. データモデル変更確定

### DailyPlan 追加フィールド

```ts
interface DailyPlan {
  // ...既存フィールド...
  morningSetupCompletedAt?: Timestamp
  eveningPromptShownAt?: Timestamp
  eveningPromptAnswer?: 'reviewed' | 'confirmed_tomorrow' | 'continue_working'
  dayCompletedAt?: Timestamp
  notificationState?: {
    missionStartNotifiedActionIds?: string[]
    break10NotifiedSessionIds?: string[]
    break20NotifiedSessionIds?: string[]
  } // フィールドのみ用意。Web Push実装(Phase5)着手までは書き込まない
}
```

`phase`と`currentMissionActionId`は保存しない（第2-3節の通り計算する）。

### WorkSession 追加フィールド

```ts
interface WorkSession {
  // ...既存フィールド...
  scheduledStartAt?: Timestamp   // Planのslotに基づく予定開始時刻。Mission未開始サポート判定に使う
  overtimeStatus?: 'none' | 'prompted' | 'extended' | 'split' | 'stopped'
  interventionCount?: number     // 同一Missionでの介入発生回数（回避検知用）
}
```

### DailyReview（本実装。既存はスキーマのみで未使用だった）

```ts
interface DailyReview {
  id: string
  userId: string
  date: string
  completedActionIds: string[]
  incompleteActionIds: string[]
  estimateDiffSummary?: string
  interruptionSummary?: string
  reflection?: string
  tomorrowNotes?: string
  createdAt: Timestamp
}
```

旧フィールド（`majorEstimateDifferences`/`interruptions`/`unfinishedActionPlacements`/`inboxTriage`の配列群）は使わず、上記のシンプルな要約フィールドに置き換える。

### Task

変更なし。`pendingActionSuggestions`のような下書き保存フィールドは追加しない（一括Diagnoseの未確定タスクは保存しない方針のため）。

### 既存データの扱い

引き続き破壊的変更OK（本番相当データはまだ無く、テストデータのみのため）。

---

## 6. 一括Diagnose設計

- **入口**：Inbox画面の`inbox`状態タスクにチェックボックスを追加。複数選択→「選んだN件を整理する」。
- **単発入力の扱い**：現在のDiagnose画面の「新規タスクをその場で書いて即分割」エントリーは残す。これは一括フローの `n=1` の特別系として扱う（内部的には同じ処理経路）。
- **入力項目**（選択した各タスクごとに、1画面内で縦にセクション分け）：
  - 完了したらどうなる状態か（必須）
  - 現在地（必須。未着手の場合は「未着手」ボタンで即入力）
  - 締切までに必要なこと（任意・自由記述。入力があればAIはこれをユーザー案として優先採用し、不足部分のみ補完する）
  - 締切（任意。日付指定 or 「今週中」「今月中」等の目安ラベル）
- **AI呼び出し**：選択された全タスクを1回のリクエストにまとめて送る。プロンプトに各`taskId`を含め、レスポンスは`taskId`ごとの`actions`配列（21節のJSON形式）で返す。
- **Action生成数の上限**：1タスクあたり原則1〜4件（45分ルール維持）。**単発Diagnoseも同じ上限に統一する**（既存の2〜6件から変更）。
- **確認画面**：タスクごとにカード表示（折りたたみ時：タイトル＋Action数＋先頭数件のタイトル、展開時：全Action編集・削除・並び替え・タスク単位の再生成）。
- **確定**：タスク単位で確定可能。一部のみ確定しても他タスクは`inbox`のまま残る。AI提案の下書きは保存しない（次に開いたら再度AI分割し直す）。エラーになったタスクがあっても他タスクの確定には影響しない（部分成功を許容）。

---

## 7. Hori常設メニュー

- **PC**：右下にHori本体を常時表示。クリックで左上方向に縦4項目のメニューを展開。
- **モバイル**：右下固定。クリックで2×2グリッド展開。
- **4項目**：タスク追加（→Inbox）／アイデア記録（→Idea Parking）／今日の記録を見る（→ Missionログ・WorkSession履歴）／今日の計画を見直す（→ Plan再考フロー）。
- **Growthの入口**：Hori4項目には含めない。**画面右上の設定歯車メニュー内に新設**する（8.2節で既に「設定用の歯車」という逃げ先の概念があるため、そこにGrowthを配置）。開発者向けメタ機能のBuild Plan（Build Roadmap/Idea Parkingの片方）も同じ設定歯車配下に移し、一般ユーザーの主要導線からは外す。
- **「見落としがありそう」を示す点滅/呼吸表示の条件**：既存GlobalFabの「未整理アイデアあり」信号を維持しつつ、以下を追加：Mission開始遅延サポートが必要／休憩20分超過／23時以降で終了確認未実施。

---

## 8. Today画面（仕様。コーディングは次回・デザイン受領後）

- 常時表示は現在のMissionカード1枚のみ：Mission名／完了条件／主ボタン／「詳細を見る」。
- 詳細展開：予定開始〜終了時刻、見積り時間、親Task、Horiがこれを選んだ理由、計画見直しへの小さい入口。
- 削除対象：Stats（Work/Break/Replan疑似操作）、Main Time、Next 15 Actions一覧、固定「Focus: Deep Work」ラベル、未接続の`layers`ボタン。
- 「今日のミッションを見る」トグルで縦のMissionログ（Morning Setup→完了済みMission→現在Mission→Break→次Mission→Evening Review）を表示。閲覧専用（並び替え・削除・時刻変更は不可）。

---

## 9. ナビゲーション変更

- Sidebar/MobileNavの常設タブからInbox/Diagnose/Plan/Growthを外す。**常設は Today のみ**。
- 各機能はHoriメニュー・設定歯車・Todayからの動線でのみ到達する。ルート自体（`/inbox`等）は維持し、直接遷移（CTAクリックやURL直打ち）は可能なままにする。

---

## 10. 今回のスコープ外（次回以降）

- 上記の実装コード化（Today再構築、Hori常設メニューコンポーネント、一括Diagnose UI、Morning Setup統合、Mission未開始/超過サポート、休憩10分/20分通知、計画見直しフロー、DailyReview UI、ナビゲーション変更）は、**画面デザイン受領後に着手**する。
- Web Push通知（FCM + Service Worker + Cloud Functions）は、データモデルのフィールド（`notificationState`）だけ今回用意し、実装は別途相談の上で着手する（このプロジェクトは現在Cloud Functions未導入のため、導入コスト・運用面を別途検討する）。
