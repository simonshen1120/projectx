import OpenAI from 'openai'

export type EvaluateResponse = {
  overall_score: number
  dimensions: {
    content_completeness: { score: number; comment: string }
    structure: { score: number; comment: string }
    fluency: { score: number; comment: string }
    time_control: { score: number; comment: string }
    persuasiveness: { score: number; comment: string }
  }
  top3_suggestions: string[]
}

const systemPrompt = `你是一位资深的 HR 面试教练，专门帮助应届大学生改进自我介绍。

你会收到一段用户的自我介绍语音转写文本和录音时长。请从以下5个维度进行评估：

1. 内容完整度（1-10分）：是否涵盖了基本背景（学校/专业）、核心经历（实习/项目/比赛/社团）、求职动机？
2. 结构逻辑（1-10分）：是否有清晰的"我是谁→我做过什么→我为什么来"的逻辑线？
3. 表达流畅度（1-10分）：是否有过多口头禅（然后、就是、嗯、那个）、重复、卡顿、语序混乱？
4. 时间控制（1-10分）：自我介绍是否控制在1-3分钟的合理范围内？各部分时间分配是否合理？
5. 说服力（1-10分）：听完后是否对这个人产生兴趣？有没有让人记住的亮点？

评估要求：
- 综合评分 = 5个维度的加权平均（满分100）
- 每个维度的点评要具体，引用用户原文
- 给出最需要改进的3条建议，每条必须：
  - 指出具体问题（引用原文）
  - 给出明确的改进方向
  - 给一个可以立刻模仿的例子
- 语气温和鼓励，像一个耐心的学姐/学长在帮忙，不要居高临下
- 即使说得很差，也要先肯定做得好的地方，再指出问题

请严格按以下 JSON 格式返回（不要返回其他内容）：
{
  "overall_score": number,
  "dimensions": {
    "content_completeness": { "score": number, "comment": "string" },
    "structure": { "score": number, "comment": "string" },
    "fluency": { "score": number, "comment": "string" },
    "time_control": { "score": number, "comment": "string" },
    "persuasiveness": { "score": number, "comment": "string" }
  },
  "top3_suggestions": ["string", "string", "string"]
}`

export function getDeepseekKeyError() {
  const raw = (process.env.DEEPSEEK_API_KEY ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
  if (!raw) return 'DEEPSEEK_API_KEY is missing in server environment'
  if (!/^[\x20-\x7E]+$/.test(raw)) {
    return 'DEEPSEEK_API_KEY contains non-ASCII characters. Please re-paste the raw key only.'
  }
  if (!raw.startsWith('sk-')) {
    return 'DEEPSEEK_API_KEY format looks invalid (should start with sk-).'
  }
  return null
}

function getClient() {
  const keyError = getDeepseekKeyError()
  if (keyError) return { keyError, client: null as OpenAI | null }
  const apiKey = (process.env.DEEPSEEK_API_KEY ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
  return {
    keyError: null,
    client: new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com/v1',
    }),
  }
}

function tryParseJson(content: string): EvaluateResponse | null {
  try {
    const parsed = JSON.parse(content) as EvaluateResponse
    if (
      typeof parsed?.overall_score !== 'number' ||
      !parsed?.dimensions ||
      !Array.isArray(parsed?.top3_suggestions)
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function evaluateIntroduction(
  transcript: string,
  durationSeconds: number,
) {
  const { keyError, client } = getClient()
  if (!client || keyError) {
    return { ok: false as const, error: keyError ?? 'DEEPSEEK_API_KEY is not available' }
  }

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: JSON.stringify(
            {
              transcript,
              duration_seconds: durationSeconds,
            },
            null,
            2,
          ),
        },
      ],
      temperature: 0.3,
    })

    const content = completion.choices[0]?.message?.content ?? ''
    const parsed = tryParseJson(content)
    if (!parsed) {
      return {
        ok: false as const,
        error: 'DeepSeek returned invalid JSON format',
        raw: content,
      }
    }

    return { ok: true as const, data: { ...parsed, transcript } }
  } catch (error) {
    return {
      ok: false as const,
      error: 'Failed to call DeepSeek API',
      details: String(error),
    }
  }
}
