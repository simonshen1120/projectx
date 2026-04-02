import { evaluateIntroduction } from '../server/evaluateCore'

type EvaluateRequestBody = {
  transcript?: string
  duration_seconds?: number
}

type VercelRequestLike = {
  method?: string
  body?: EvaluateRequestBody
}

type VercelResponseLike = {
  status: (code: number) => VercelResponseLike
  json: (payload: unknown) => void
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  const transcript = String(req.body?.transcript ?? '').trim()
  const durationSeconds = Number(req.body?.duration_seconds ?? 0)
  if (!transcript) {
    return res.status(400).json({ error: 'transcript is required' })
  }

  const result = await evaluateIntroduction(transcript, durationSeconds)
  if (!result.ok) {
    const status = result.error.includes('missing') || result.error.includes('KEY')
      ? 503
      : result.error.includes('invalid JSON')
        ? 502
        : 502
    return res.status(status).json(result)
  }
  return res.status(200).json(result.data)
}
