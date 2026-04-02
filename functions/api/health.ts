export const onRequestGet: PagesFunction = async () => {
  return Response.json({ ok: true, service: 'mock-interview-coach-api' })
}
