import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { evaluateIntroduction } from './evaluateCore'

dotenv.config()

const app = express()
const port = Number(process.env.PORT ?? 8787)

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'mock-interview-coach-api' })
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

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`)
})
