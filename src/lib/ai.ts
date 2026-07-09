import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'
import { app } from './firebase'

const ai = getAI(app, { backend: new GoogleAIBackend() })

const MODEL_ID = 'gemini-2.5-flash-lite'

export interface TaskDiagnosis {
  title: string
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  riskLabel: string
  riskReason: string
  suggestedAction: string
  estimatedMinutes: number
}

const diagnosisModel = getGenerativeModel(ai, {
  model: MODEL_ID,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: Schema.object({
      properties: {
        title: Schema.string(),
        riskLevel: Schema.enumString({ enum: ['HIGH', 'MEDIUM', 'LOW'] }),
        riskLabel: Schema.string(),
        riskReason: Schema.string(),
        suggestedAction: Schema.string(),
        estimatedMinutes: Schema.number(),
      },
    }),
  },
})

export async function diagnoseTask(rawInput: string): Promise<TaskDiagnosis> {
  const prompt = `You are a productivity coach helping a user turn a rough task note into a clear, actionable item.

Task note (may be in Japanese or English): "${rawInput}"

Analyze it and respond with:
- title: a short, clear task title
- riskLevel: HIGH, MEDIUM, or LOW risk of the task expanding, being ambiguous, or causing overwork
- riskLabel: a short 2-4 word label for the main risk (e.g. "Incomplete Criteria", "Unclear Scope")
- riskReason: one sentence explaining the risk in the same language as the task note
- suggestedAction: a concrete first next-step the user could do in 15 minutes or less, in the same language as the task note
- estimatedMinutes: a rough total time estimate in minutes for the whole task`

  const result = await diagnosisModel.generateContent(prompt)
  return JSON.parse(result.response.text()) as TaskDiagnosis
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
