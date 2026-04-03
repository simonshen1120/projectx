import { transcribeAudioBase64 } from '../../server/transcribeCore'

interface Env {
  ASR_API_KEY?: string
  OPENAI_API_KEY?: string
  ASR_BASE_URL?: string
  ASR_MODEL?: string
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = (await context.request.json()) as {
      audio_base64?: string
      mime_type?: string
      language?: string
    }

    const audioBase64 = String(body?.audio_base64 ?? '').trim()
    const mimeType = String(body?.mime_type ?? '').trim() || 'audio/webm'
    const language = String(body?.language ?? '').trim() || 'zh'

    if (!audioBase64) {
      return jsonResponse({ error: 'audio_base64 is required' }, 400)
    }

    const apiKey = context.env.ASR_API_KEY || context.env.OPENAI_API_KEY
    if (!apiKey) {
      return jsonResponse(
        { error: 'ASR_API_KEY or OPENAI_API_KEY not configured in Cloudflare environment' },
        503,
      )
    }

    const result = await transcribeAudioBase64(
      audioBase64,
      mimeType,
      language,
      apiKey,
    )

    if (!result.ok) {
      const status = result.error.includes('missing') || result.error.includes('KEY') ? 503 : 502
      return jsonResponse(result, status)
    }

    return jsonResponse(result.data)
  } catch (error) {
    return jsonResponse(
      {
        error: 'Unhandled transcribe function error',
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    )
  }
}
