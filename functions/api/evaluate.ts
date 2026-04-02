import { evaluateIntroduction } from '../../server/evaluateCore'

interface Env {
  DEEPSEEK_API_KEY: string
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
    let body: { transcript?: string; duration_seconds?: number }
    try {
      body = (await context.request.json()) as typeof body
    } catch {
      return jsonResponse({ error: 'Invalid request body (not JSON)' }, 400)
    }

    const transcript = String(body?.transcript ?? '').trim()
    const durationSeconds = Number(body?.duration_seconds ?? 0)

    if (!transcript) {
      return jsonResponse({ error: 'transcript is required' }, 400)
    }

    const apiKey = context.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return jsonResponse(
        { error: 'DEEPSEEK_API_KEY not configured in Cloudflare environment' },
        503,
      )
    }

    const result = await evaluateIntroduction(transcript, durationSeconds, apiKey)

    if (!result.ok) {
      const status =
        result.error.includes('missing') || result.error.includes('KEY')
          ? 503
          : 502
      return jsonResponse(result, status)
    }

    return jsonResponse(result.data)
  } catch (err) {
    return jsonResponse(
      {
        error: 'Unhandled function error',
        details: err instanceof Error ? err.message : String(err),
      },
      500,
    )
  }
}
