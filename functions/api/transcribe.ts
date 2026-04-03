import { transcribeAudioBase64 } from '../../server/transcribeCore'

interface Env {
  ASR_PROVIDER?: string
  ASR_API_KEY?: string
  OPENAI_API_KEY?: string
  ASR_BASE_URL?: string
  ASR_MODEL?: string
  TENCENT_SECRET_ID?: string
  TENCENT_SECRET_KEY?: string
  TENCENT_ASR_REGION?: string
  TENCENT_ENG_SERVICE_TYPE?: string
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

    const result = await transcribeAudioBase64(
      audioBase64,
      mimeType,
      language,
      {
        provider: context.env.ASR_PROVIDER,
        apiKey: context.env.ASR_API_KEY || context.env.OPENAI_API_KEY,
        baseUrl: context.env.ASR_BASE_URL,
        model: context.env.ASR_MODEL,
        tencentSecretId: context.env.TENCENT_SECRET_ID,
        tencentSecretKey: context.env.TENCENT_SECRET_KEY,
        tencentRegion: context.env.TENCENT_ASR_REGION,
        tencentEngineType: context.env.TENCENT_ENG_SERVICE_TYPE,
      },
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
