import { evaluateIntroduction } from '../../server/evaluateCore'

interface Env {
  DEEPSEEK_API_KEY: string
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = (await context.request.json()) as {
    transcript?: string
    duration_seconds?: number
  }

  const transcript = String(body?.transcript ?? '').trim()
  const durationSeconds = Number(body?.duration_seconds ?? 0)

  if (!transcript) {
    return jsonResponse({ error: 'transcript is required' }, 400)
  }

  const result = await evaluateIntroduction(
    transcript,
    durationSeconds,
    context.env.DEEPSEEK_API_KEY,
  )

  if (!result.ok) {
    const status =
      result.error.includes('missing') || result.error.includes('KEY')
        ? 503
        : 502
    return jsonResponse(result, status)
  }

  return jsonResponse(result.data)
}
