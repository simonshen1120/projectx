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

type TranscribePayload = {
  audio_base64: string
  mime_type: string
  language?: string
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()

function shouldIgnoreConfiguredApiBase(url: string) {
  if (typeof window === 'undefined') return false
  // Guardrail: prevent production bundles from accidentally hardcoding localhost APIs.
  if (!/localhost|127\.0\.0\.1/i.test(url)) return false
  return !/localhost|127\.0\.0\.1/i.test(window.location.hostname)
}

function getApiUrl(path: string) {
  if (!API_BASE_URL) return path
  if (shouldIgnoreConfiguredApiBase(API_BASE_URL)) return path
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

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.includes(',') ? result.split(',')[1] : ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('录音编码失败，请重试。'))
    reader.readAsDataURL(blob)
  })
}

export async function transcribeAudio(blob: Blob, language = 'zh') {
  const audioBase64 = await blobToBase64(blob)
  if (!audioBase64) {
    throw new Error('录音编码为空，请重新录制。')
  }

  const payload: TranscribePayload = {
    audio_base64: audioBase64,
    mime_type: blob.type || 'audio/webm',
    language,
  }

  const response = await fetch(getApiUrl('/api/transcribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const raw = await response.text()
  let data: { text?: string; error?: string } = {}
  try {
    data = JSON.parse(raw) as { text?: string; error?: string }
  } catch {
    const normalized = raw.toLowerCase()
    if (normalized.includes('payloadtoolargeerror') || normalized.includes('request entity too large')) {
      data = { error: '录音文件过大，请缩短单次录音到 60 秒内后重试。' }
    } else {
      data = { error: '转写服务异常，请稍后重试（你仍可手动输入原文）。' }
    }
  }

  if (!response.ok) {
    throw new Error(data.error || '语音转写失败，请稍后重试。')
  }

  const text = String(data.text ?? '').trim()
  if (!text) {
    throw new Error('转写结果为空，请重新录制或手动输入。')
  }
  return text
}
