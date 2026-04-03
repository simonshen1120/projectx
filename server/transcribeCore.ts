type TranscribeSuccess = {
  ok: true
  data: { text: string }
}

type TranscribeFailure = {
  ok: false
  error: string
}

export type TranscribeResult = TranscribeSuccess | TranscribeFailure

function clean(raw: string | undefined) {
  return (raw ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function decodeBase64(base64: string) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function validateAsrApiKey(raw: string | undefined): string | null {
  const key = clean(raw)
  if (!key) return 'ASR_API_KEY/OPENAI_API_KEY is missing in server environment'
  if (!/^[\x20-\x7E]+$/.test(key)) {
    return 'ASR API key contains non-ASCII characters. Please re-paste the raw key only.'
  }
  return null
}

function getAsrConfig() {
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env
      : ({} as Record<string, string | undefined>)
  const apiKey = clean(
    env.ASR_API_KEY ?? env.OPENAI_API_KEY ?? env.DEEPSEEK_API_KEY,
  )
  const baseUrl = clean(env.ASR_BASE_URL ?? env.OPENAI_BASE_URL) || 'https://api.openai.com/v1'
  const model = clean(env.ASR_MODEL) || 'whisper-1'
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ''), model }
}

export async function transcribeAudioBase64(
  audioBase64: string,
  mimeType: string | undefined,
  language: string | undefined,
  explicitApiKey?: string,
): Promise<TranscribeResult> {
  const cfg = getAsrConfig()
  const apiKey = clean(explicitApiKey ?? cfg.apiKey)
  const keyError = validateAsrApiKey(apiKey || undefined)
  if (keyError) return { ok: false, error: keyError }

  if (!audioBase64.trim()) {
    return { ok: false, error: 'audio_base64 is required' }
  }

  try {
    const bytes = decodeBase64(audioBase64)
    const blob = new Blob([bytes], {
      type: mimeType?.trim() || 'audio/webm',
    })

    const formData = new FormData()
    formData.append('model', cfg.model)
    if (language?.trim()) formData.append('language', language.trim())
    formData.append('response_format', 'json')
    formData.append('file', blob, 'recording.webm')

    const response = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    const raw = await response.text()
    if (!response.ok) {
      return {
        ok: false,
        error: `ASR API ${response.status}: ${raw.slice(0, 220)}`,
      }
    }

    let parsed: { text?: string } = {}
    try {
      parsed = JSON.parse(raw) as { text?: string }
    } catch {
      return { ok: false, error: `ASR returned non-JSON: ${raw.slice(0, 220)}` }
    }

    const text = String(parsed.text ?? '').trim()
    if (!text) {
      return { ok: false, error: 'ASR returned empty transcript' }
    }

    return { ok: true, data: { text } }
  } catch (error) {
    return {
      ok: false,
      error: `Failed to call ASR API: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
