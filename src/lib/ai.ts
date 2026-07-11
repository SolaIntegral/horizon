import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'
import { app } from './firebase'

const ai = getAI(app, { backend: new GoogleAIBackend() })

const MODEL_ID = 'gemini-2.5-flash-lite'

export interface TaskPlanInput {
  title: string
  outputGoal: string
  currentState: string
}

export interface ActionSuggestion {
  title: string
  estimatedMinutes: number
  completionCriteria: string
}

export interface BreakdownResult {
  actions: ActionSuggestion[]
}

const breakdownModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        actions: Schema.array({
          items: Schema.object({
            properties: {
              title: Schema.string(),
              estimatedMinutes: Schema.number(),
              completionCriteria: Schema.string(),
            },
          }),
        }),
      },
    }),
  },
})

export async function suggestActionBreakdown(input: TaskPlanInput): Promise<BreakdownResult> {
  const prompt = `You are a productivity coach helping a user break a task down into small, concrete 15-45 minute actions.

Task title: "${input.title}"
Desired output / done-looks-like (完成イメージ): "${input.outputGoal}"
Current state (現在地、どこまで出来ているか): "${input.currentState}"

Propose 2-6 concrete next actions to get from the current state to the desired output. For each action:
- title: a short, concrete action title, in the same language as the input
- estimatedMinutes: a realistic time estimate, generally between 15 and 45 minutes (round to 15/30/45 where sensible)
- completionCriteria: one short sentence describing exactly what "done" looks like for this action, in the same language as the input

Never propose a single action estimated over 45 minutes — split it further instead.`

  const result = await breakdownModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as BreakdownResult
}

export interface GrowthMemo {
  summary: string
  bulletPoints: string[]
  quizQuestion: string
  tomorrowChallenge: string
}

const growthModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        summary: Schema.string(),
        bulletPoints: Schema.array({ items: Schema.string() }),
        quizQuestion: Schema.string(),
        tomorrowChallenge: Schema.string(),
      },
    }),
  },
})

export async function generateGrowthMemo(reflectionText: string): Promise<GrowthMemo> {
  const prompt = `You are a learning coach. A user wrote this reflection about what they learned today (may be in Japanese or English):

"${reflectionText}"

Respond with:
- summary: a 1-2 sentence organized summary of the core learning, in the same language as the reflection
- bulletPoints: 2-4 short bullet points of specific things they learned, in the same language as the reflection
- quizQuestion: one short knowledge-check question testing the concept, in the same language as the reflection
- tomorrowChallenge: one small follow-up exercise to reinforce the learning tomorrow, in the same language as the reflection`

  const result = await growthModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as GrowthMemo
}

export interface QuizCheckResult {
  correct: boolean
  feedback: string
}

const quizCheckModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        correct: Schema.boolean(),
        feedback: Schema.string(),
      },
    }),
  },
})

export async function checkQuizAnswer(question: string, userAnswer: string): Promise<QuizCheckResult> {
  const prompt = `You are a quick knowledge-check grader.

Question: "${question}"
User's answer: "${userAnswer}"

Judge if the answer is substantially correct (minor wording or syntax differences are fine). Respond with:
- correct: true or false
- feedback: one short, encouraging sentence explaining why, in the same language as the question`

  const result = await quizCheckModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as QuizCheckResult
}

export interface StructuredNote {
  doneSummary?: string
  nextSummary?: string
  blockerSummary?: string
  ideaSummary?: string
}

export interface SuggestedActionAI {
  title: string
  estimatedMinutes: number
  reason?: string
  recommendationType: 'overwrite_current' | 'add_new'
}

export interface ProcessedNote {
  structured: StructuredNote
  suggestedActions: SuggestedActionAI[]
}

const noteModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        structured: Schema.object({
          properties: {
            doneSummary: Schema.string(),
            nextSummary: Schema.string(),
            blockerSummary: Schema.string(),
            ideaSummary: Schema.string(),
          },
          optionalProperties: ['doneSummary', 'nextSummary', 'blockerSummary', 'ideaSummary'],
        }),
        suggestedActions: Schema.array({
          items: Schema.object({
            properties: {
              title: Schema.string(),
              estimatedMinutes: Schema.number(),
              reason: Schema.string(),
              recommendationType: Schema.enumString({ enum: ['overwrite_current', 'add_new'] }),
            },
            optionalProperties: ['reason'],
          }),
        }),
      },
    }),
  },
})

export async function processSessionNote(rawNote: string, currentActionTitle: string): Promise<ProcessedNote> {
  const prompt = `You are a focus coach analyzing a user's short free-text progress note written during or after a work session (may be in Japanese or English).

Current Next-15 Action: "${currentActionTitle}"
Progress note: "${rawNote}"

Respond with:
- structured: split the note into doneSummary (what was accomplished, if any), nextSummary (what to do next, if mentioned), blockerSummary (what's blocking progress, if mentioned), ideaSummary (any idea/insight, if mentioned). Omit fields the note doesn't address. Same language as the note.
- suggestedActions: 0-3 concrete next 15-minute actions implied by the note, same language as the note. For each, set recommendationType to "overwrite_current" if it's simply a more concrete version of the current action (same goal, natural next step replacing it), or "add_new" if it's a separate/derived task that should exist alongside the current action. Include a short one-sentence reason for each.`

  const result = await noteModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as ProcessedNote
}

export interface IdeaOrganizeResult {
  suggestion: string
  options: string[]
}

const organizeModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        suggestion: Schema.string(),
        options: Schema.array({ items: Schema.string() }),
      },
    }),
  },
})

export async function organizeIdea(title: string, memo: string): Promise<IdeaOrganizeResult> {
  const prompt = `You are lightly organizing a raw idea for a solo developer's idea-parking board. Do NOT decide anything for them — just suggest a gentle direction and 2-3 concrete next-step options they could pick from.

Idea title: "${title}"
Idea memo: "${memo}"

Respond in Japanese with:
- suggestion: one short sentence suggesting a gentle direction (not a command)
- options: 2-3 short option labels the user could choose from (e.g. "そのままIdeaに置いておく", "既存機能に紐づける", "Featureとして追加する")`

  const result = await organizeModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as IdeaOrganizeResult
}
