import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { evaluateIntroduction } from './evaluateCore'
import { transcribeAudioBase64 } from './transcribeCore'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? 8787)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'mock-interview-coach-api',
    has_api_key: Boolean(process.env.DEEPSEEK_API_KEY),
    has_asr_key: Boolean(process.env.ASR_API_KEY || process.env.OPENAI_API_KEY),
  })
})

app.post('/api/evaluate', async (req, res) => {
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
  return res.json(result.data)
})

app.post('/api/transcribe', async (req, res) => {
  const audioBase64 = String(req.body?.audio_base64 ?? '').trim()
  const mimeType = String(req.body?.mime_type ?? '').trim() || 'audio/webm'
  const language = String(req.body?.language ?? '').trim() || 'zh'

  if (!audioBase64) {
    return res.status(400).json({ error: 'audio_base64 is required' })
  }

  const result = await transcribeAudioBase64(
    audioBase64,
    mimeType,
    language,
    process.env.ASR_API_KEY ?? process.env.OPENAI_API_KEY,
  )

  if (!result.ok) {
    const status = result.error.includes('missing') || result.error.includes('KEY') ? 503 : 502
    return res.status(status).json(result)
  }

  return res.json(result.data)
})

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
})
