export type EvaluationResult = {
  overall_score: number
  dimensions: {
    content_completeness: { score: number; comment: string }
    structure: { score: number; comment: string }
    fluency: { score: number; comment: string }
    time_control: { score: number; comment: string }
    persuasiveness: { score: number; comment: string }
  }
  top3_suggestions: string[]
  transcript: string
}

type EvaluatePayload = {
  transcript: string
  duration_seconds: number
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

function getApiUrl(path: string) {
  if (!API_BASE_URL) return path
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`
}

export async function evaluateSelfIntro(payload: EvaluatePayload) {
  const response = await fetch(getApiUrl('/api/evaluate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let data: EvaluationResult | { error?: string } = {}
  try {
    data = JSON.parse(raw) as EvaluationResult | { error?: string }
  } catch {
    data = { error: raw || '服务返回了非 JSON 内容。' }
  }

  if (!response.ok) {
    throw new Error(
      'error' in data && data.error ? data.error : '评估请求失败，请稍后重试。',
    )
  }

  return data as EvaluationResult
}
