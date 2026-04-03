type TranscribeSuccess = {
  ok: true
  data: { text: string }
}

type TranscribeFailure = {
  ok: false
  error: string
}

export type TranscribeResult = TranscribeSuccess | TranscribeFailure

type AsrOverrides = {
  provider?: string
  apiKey?: string
  baseUrl?: string
  model?: string
  tencentSecretId?: string
  tencentSecretKey?: string
  tencentRegion?: string
  tencentEngineType?: string
}

function clean(raw: string | undefined) {
  return (raw ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function decodeBase64(base64: string) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function validateAsrApiKey(raw: string | undefined): string | null {
  const key = clean(raw)
  if (!key) return 'ASR_API_KEY/OPENAI_API_KEY is missing in server environment'
  if (!/^[\x20-\x7E]+$/.test(key)) {
    return 'ASR API key contains non-ASCII characters. Please re-paste the raw key only.'
  }
  return null
}

function getAsrConfig() {
  const env =
    typeof process !== 'undefined' && process.env
      ? process.env
      : ({} as Record<string, string | undefined>)
  const provider = clean(env.ASR_PROVIDER).toLowerCase() || 'openai'
  const apiKey = clean(env.ASR_API_KEY ?? env.OPENAI_API_KEY)
  const baseUrl = clean(env.ASR_BASE_URL ?? env.OPENAI_BASE_URL) || 'https://api.openai.com/v1'
  const model = clean(env.ASR_MODEL) || 'whisper-1'
  const tencentSecretId = clean(env.TENCENT_SECRET_ID)
  const tencentSecretKey = clean(env.TENCENT_SECRET_KEY)
  const tencentRegion = clean(env.TENCENT_ASR_REGION) || 'ap-beijing'
  const tencentEngineType = clean(env.TENCENT_ENG_SERVICE_TYPE) || '16k_zh'
  return {
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    tencentSecretId,
    tencentSecretKey,
    tencentRegion,
    tencentEngineType,
  }
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function getSubtleCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle
  throw new Error('Web Crypto API is not available in current runtime')
}

async function sha256Hex(input: string) {
  const digest = await getSubtleCrypto().digest('SHA-256', new TextEncoder().encode(input))
  return toHex(new Uint8Array(digest))
}

async function hmacSha256(key: Uint8Array, data: string) {
  const importedKey = await getSubtleCrypto().importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await getSubtleCrypto().sign('HMAC', importedKey, new TextEncoder().encode(data))
  return new Uint8Array(signature)
}

function formatTencentVoiceFormat(mimeType: string | undefined) {
  const mime = (mimeType ?? '').toLowerCase()
  if (mime.includes('ogg')) return 'ogg-opus'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a'
  if (mime.includes('amr')) return 'amr'
  if (mime.includes('silk')) return 'silk'
  if (mime.includes('speex')) return 'speex'
  // webm-opus does not have an official Tencent voice format token.
  return 'ogg-opus'
}

async function transcribeViaOpenAiCompat(
  audioBase64: string,
  mimeType: string | undefined,
  language: string | undefined,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<TranscribeResult> {
  const keyError = validateAsrApiKey(apiKey || undefined)
  if (keyError) return { ok: false, error: keyError }

  const bytes = decodeBase64(audioBase64)
  const blob = new Blob([bytes], {
    type: mimeType?.trim() || 'audio/webm',
  })

  const formData = new FormData()
  formData.append('model', model)
  if (language?.trim()) formData.append('language', language.trim())
  formData.append('response_format', 'json')
  formData.append('file', blob, 'recording.webm')

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  const raw = await response.text()
  if (!response.ok) {
    return {
      ok: false,
      error: `ASR API ${response.status}: ${raw.slice(0, 220)}`,
    }
  }

  let parsed: { text?: string } = {}
  try {
    parsed = JSON.parse(raw) as { text?: string }
  } catch {
    return { ok: false, error: `ASR returned non-JSON: ${raw.slice(0, 220)}` }
  }

  const text = String(parsed.text ?? '').trim()
  if (!text) {
    return { ok: false, error: 'ASR returned empty transcript' }
  }

  return { ok: true, data: { text } }
}

async function transcribeViaTencent(
  audioBase64: string,
  mimeType: string | undefined,
  secretId: string,
  secretKey: string,
  region: string,
  engineType: string,
): Promise<TranscribeResult> {
  if (!secretId || !secretKey) {
    return { ok: false, error: 'TENCENT_SECRET_ID/TENCENT_SECRET_KEY is missing in server environment' }
  }

  const bytes = decodeBase64(audioBase64)
  // SentenceRecognition constraints: max 60s and max 3MB per request.
  if (bytes.byteLength > 3 * 1024 * 1024) {
    return { ok: false, error: 'Tencent SentenceRecognition requires <= 3MB audio. Please shorten recording.' }
  }

  const payload = {
    EngSerViceType: engineType,
    SourceType: 1,
    VoiceFormat: formatTencentVoiceFormat(mimeType),
    Data: audioBase64,
    DataLen: bytes.byteLength,
  }
  const payloadJson = JSON.stringify(payload)

  const host = 'asr.tencentcloudapi.com'
  const service = 'asr'
  const action = 'SentenceRecognition'
  const version = '2019-06-14'
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  const canonicalUri = '/'
  const canonicalQuerystring = ''
  const canonicalHeaders =
    'content-type:application/json; charset=utf-8\n' +
    `host:${host}\n` +
    `x-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedPayload = await sha256Hex(payloadJson)
  const canonicalRequest =
    `POST\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`

  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign =
    `${algorithm}\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`

  const secretDate = await hmacSha256(new TextEncoder().encode(`TC3${secretKey}`), date)
  const secretService = await hmacSha256(secretDate, service)
  const secretSigning = await hmacSha256(secretService, 'tc3_request')
  const signature = toHex(await hmacSha256(secretSigning, stringToSign))

  const authorization =
    `${algorithm} Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  const response = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: host,
      'X-TC-Action': action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': version,
      'X-TC-Region': region,
    },
    body: payloadJson,
  })

  const raw = await response.text()
  let parsed: {
    Response?: {
      Result?: string
      Error?: { Code?: string; Message?: string }
    }
  } = {}
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return { ok: false, error: `Tencent ASR returned non-JSON: ${raw.slice(0, 220)}` }
  }

  const err = parsed.Response?.Error
  if (!response.ok || err) {
    return {
      ok: false,
      error: `Tencent ASR ${response.status}${err?.Code ? ` ${err.Code}` : ''}: ${err?.Message ?? raw.slice(0, 220)}`,
    }
  }

  const text = String(parsed.Response?.Result ?? '').trim()
  if (!text) {
    return { ok: false, error: 'Tencent ASR returned empty transcript' }
  }
  return { ok: true, data: { text } }
}

export async function transcribeAudioBase64(
  audioBase64: string,
  mimeType: string | undefined,
  language: string | undefined,
  overrides?: AsrOverrides,
): Promise<TranscribeResult> {
  const cfg = getAsrConfig()
  const provider = clean(overrides?.provider ?? cfg.provider).toLowerCase() || 'openai'

  if (!audioBase64.trim()) {
    return { ok: false, error: 'audio_base64 is required' }
  }

  try {
    if (provider === 'tencent') {
      return await transcribeViaTencent(
        audioBase64,
        mimeType,
        clean(overrides?.tencentSecretId ?? cfg.tencentSecretId),
        clean(overrides?.tencentSecretKey ?? cfg.tencentSecretKey),
        clean(overrides?.tencentRegion ?? cfg.tencentRegion),
        clean(overrides?.tencentEngineType ?? cfg.tencentEngineType),
      )
    }

    return await transcribeViaOpenAiCompat(
      audioBase64,
      mimeType,
      language,
      clean(overrides?.apiKey ?? cfg.apiKey),
      clean(overrides?.baseUrl ?? cfg.baseUrl),
      clean(overrides?.model ?? cfg.model),
    )
  } catch (error) {
    return {
      ok: false,
      error: `Failed to call ASR API: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
