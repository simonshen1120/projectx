interface Env {
  DEEPSEEK_API_KEY?: string
  ASR_PROVIDER?: string
  ASR_API_KEY?: string
  OPENAI_API_KEY?: string
  TENCENT_SECRET_ID?: string
  TENCENT_SECRET_KEY?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const asrProvider = String(context.env.ASR_PROVIDER ?? 'openai').trim().toLowerCase()
  const hasKey = Boolean(context.env.DEEPSEEK_API_KEY)
  const hasAsrKey =
    asrProvider === 'tencent'
      ? Boolean(context.env.TENCENT_SECRET_ID && context.env.TENCENT_SECRET_KEY)
      : Boolean(context.env.ASR_API_KEY || context.env.OPENAI_API_KEY)
  return Response.json({
    ok: true,
    service: 'mock-interview-coach-api',
    runtime: 'cloudflare-pages-functions',
    has_api_key: hasKey,
    asr_provider: asrProvider,
    has_asr_key: hasAsrKey,
  })
}
