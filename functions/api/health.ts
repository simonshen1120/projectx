interface Env {
  DEEPSEEK_API_KEY?: string
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const hasKey = Boolean(context.env.DEEPSEEK_API_KEY)
  return Response.json({
    ok: true,
    service: 'mock-interview-coach-api',
    runtime: 'cloudflare-pages-functions',
    has_api_key: hasKey,
  })
}
