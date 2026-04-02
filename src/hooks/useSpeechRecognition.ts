import { useEffect, useMemo, useRef, useState } from 'react'

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: SpeechRecognitionResultLike[]
}

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
}

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState('')
  const [isListening, setIsListening] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false)
  const retryPendingRef = useRef(false)
  const retryCountRef = useRef(0)

  const isSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }, [])

  const ensureRecognition = () => {
    if (!isSupported) return null
    if (recognitionRef.current) return recognitionRef.current

    const RecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!RecognitionCtor) return null
    const recognition = new RecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'zh-CN'

    recognition.onresult = (event) => {
      let finalChunk = ''
      let interimChunk = ''

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          finalChunk += `${result[0].transcript} `
        } else {
          interimChunk += result[0].transcript
        }
      }

      if (finalChunk.trim()) {
        setTranscript((prev) => `${prev}${finalChunk}`.trim())
      }
      setInterimTranscript(interimChunk.trim())
    }

    recognition.onerror = (event) => {
      const errorCode = event.error ?? 'unknown'
      if (errorCode === 'network' && retryCountRef.current < 1) {
        retryCountRef.current += 1
        retryPendingRef.current = true
        setError('语音服务网络异常，正在自动重试一次...')
        return
      }

      if (errorCode === 'network') {
        setError('语音识别网络不可用：请科学网络环境或手动补充原文。')
        return
      }

      setError(
        event.error
          ? `语音识别失败：${event.error}。你仍可手动补充原文继续分析。`
          : '语音识别失败，请重试或检查浏览器权限。',
      )
    }

    recognition.onend = () => {
      setIsListening(false)
      if (shouldListenRef.current && retryPendingRef.current) {
        retryPendingRef.current = false
        try {
          recognition.start()
          setIsListening(true)
        } catch {
          // Start may throw if browser blocks immediate restart.
        }
      }
    }

    recognitionRef.current = recognition
    return recognition
  }

  const start = () => {
    setError('')
    const recognition = ensureRecognition()
    if (!recognition) {
      setError('当前浏览器不支持语音转写，请使用最新版 Chrome。')
      return
    }

    if (isListening) return
    shouldListenRef.current = true
    retryCountRef.current = 0
    retryPendingRef.current = false
    recognition.start()
    setIsListening(true)
  }

  const stop = () => {
    shouldListenRef.current = false
    retryPendingRef.current = false
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop()
    }
  }

  const reset = () => {
    setTranscript('')
    setInterimTranscript('')
    setError('')
    retryCountRef.current = 0
    retryPendingRef.current = false
  }

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  return {
    transcript,
    interimTranscript,
    isSupported,
    isListening,
    error,
    start,
    stop,
    reset,
  }
}
