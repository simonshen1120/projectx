import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { AudioWave } from './components/AudioWave'
import { RecordButton } from './components/RecordButton'
import { useSpeechRecognition } from './hooks/useSpeechRecognition'
import { evaluateSelfIntro, transcribeAudio, type EvaluationResult } from './lib/api'

type AppState = 'idle' | 'recording' | 'result'
const MAX_RECORDING_SECONDS = 180
const dimensionItems: Array<{
  key: keyof EvaluationResult['dimensions']
  label: string
}> = [
  { key: 'content_completeness', label: '内容完整度' },
  { key: 'structure', label: '结构逻辑' },
  { key: 'fluency', label: '表达流畅度' },
  { key: 'time_control', label: '时间控制' },
  { key: 'persuasiveness', label: '说服力' },
]

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function choosePreferredMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return undefined
  const candidates = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  return candidates.find((item) => MediaRecorder.isTypeSupported(item))
}

function App() {
  const [state, setState] = useState<AppState>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const [manualTranscript, setManualTranscript] = useState('')
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluateError, setEvaluateError] = useState('')
  const [resolvedTranscript, setResolvedTranscript] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const autoEvaluateRequestedRef = useRef(false)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const speech = useSpeechRecognition()

  const isRecordingSupported = useMemo(() => {
    if (typeof window === 'undefined') return false
    return Boolean(navigator.mediaDevices && typeof MediaRecorder !== 'undefined')
  }, [])

  const title = useMemo(() => {
    if (state === 'idle') return 'AI 面试教练 MVP'
    if (state === 'recording') return '录音中'
    return '录音完成'
  }, [state])

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const stopStreamTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
  }

  const stopRecording = (finalDuration?: number) => {
    if (state !== 'recording') return

    clearTimer()
    speech.stop()
    const duration = finalDuration ?? elapsedSeconds
    setDurationSeconds(duration)
    setEvaluateError('')
    setState('result')

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      stopStreamTracks()
    }
  }

  const startRecording = async () => {
    if (!isRecordingSupported || isStarting) return

    setIsStarting(true)
    setErrorMessage('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredMimeType = choosePreferredMimeType()
      const mediaRecorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      mediaStreamRef.current = stream
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      mediaRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, {
            type: mediaRecorder.mimeType || preferredMimeType || 'audio/webm',
          })
          setRecordedAudioBlob(blob)
        }
        audioChunksRef.current = []
        stopStreamTracks()
        mediaRecorderRef.current = null
      }

      mediaRecorder.start()
      setElapsedSeconds(0)
      setDurationSeconds(0)
      setManualTranscript('')
      setEvaluation(null)
      setEvaluateError('')
      setResolvedTranscript('')
      autoEvaluateRequestedRef.current = false
      setRecordedAudioBlob(null)
      speech.reset()
      speech.start()
      setState('recording')

      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1
          if (next >= MAX_RECORDING_SECONDS) {
            window.setTimeout(() => stopRecording(MAX_RECORDING_SECONDS), 0)
            return MAX_RECORDING_SECONDS
          }
          return next
        })
      }, 1000)
    } catch {
      setErrorMessage('麦克风权限被拒绝或不可用，请检查浏览器设置后重试。')
      stopStreamTracks()
    } finally {
      setIsStarting(false)
    }
  }

  const resetToIdle = () => {
    clearTimer()
    stopStreamTracks()
    speech.stop()
    speech.reset()
    setElapsedSeconds(0)
    setDurationSeconds(0)
    setManualTranscript('')
    setEvaluation(null)
    setEvaluateError('')
    setIsEvaluating(false)
    setResolvedTranscript('')
    setRecordedAudioBlob(null)
    autoEvaluateRequestedRef.current = false
    setErrorMessage('')
    setState('idle')
  }

  const runEvaluation = useCallback(async (transcriptText: string) => {
    const cleanTranscript = transcriptText.trim()
    if (!cleanTranscript) return

    setIsEvaluating(true)
    setEvaluateError('')

    try {
      setResolvedTranscript(cleanTranscript)
      const result = await evaluateSelfIntro({
        transcript: cleanTranscript,
        duration_seconds: durationSeconds,
      })
      setEvaluation(result)
    } catch (error) {
      setEvaluateError(
        error instanceof Error ? error.message : '分析失败，请稍后重试。',
      )
    } finally {
      setIsEvaluating(false)
    }
  }, [durationSeconds])

  const liveTranscript = `${speech.transcript} ${speech.interimTranscript}`.trim()

  const transcriptForDisplay =
    evaluation?.transcript ||
    resolvedTranscript ||
    liveTranscript ||
    manualTranscript ||
    (isEvaluating
      ? '正在从录音中提取文本，请稍候...'
      : '未获取到转写内容，你仍可手动补充原文继续分析。')

  useEffect(() => {
    return () => {
      clearTimer()
      stopStreamTracks()
    }
  }, [])

  useEffect(() => {
    if (state !== 'result') return
    const recognizedTranscript = liveTranscript
    if (autoEvaluateRequestedRef.current) return

    if (recognizedTranscript) {
      autoEvaluateRequestedRef.current = true
      void runEvaluation(recognizedTranscript)
      return
    }

    if (!recordedAudioBlob) return

    autoEvaluateRequestedRef.current = true
    setIsEvaluating(true)
    setEvaluateError('')
    void (async () => {
      try {
        const text = await transcribeAudio(recordedAudioBlob, 'zh')
        await runEvaluation(text)
      } catch (error) {
        setEvaluateError(
          error instanceof Error
            ? `${error.message}（你仍可手动补充原文继续分析）`
            : '语音转写失败，请手动补充原文继续分析。',
        )
      } finally {
        setIsEvaluating(false)
      }
    })()
  }, [liveTranscript, recordedAudioBlob, runEvaluation, state, speech.transcript, speech.interimTranscript])

  const showRealtimeFallbackHint =
    !liveTranscript &&
    (speech.error.includes('not-allowed') ||
      speech.error.includes('network') ||
      !speech.isSupported)

  const showRealtimeErrorInHeader = state === 'recording' && Boolean(speech.error)
  const showFallbackRecoveredHint =
    state === 'result' &&
    Boolean(speech.error) &&
    !isEvaluating &&
    Boolean(evaluation || resolvedTranscript)

  return (
    <main className="app-shell">
      <section className="panel">
        <p className="status-tag">{title}</p>
        <h1>来，试着做一段自我介绍，随便说，说得不好没关系。</h1>
        {!isRecordingSupported && (
          <p className="hint error">
            当前浏览器不支持录音，请使用最新版 Chrome（桌面或安卓）。
          </p>
        )}
        {!speech.isSupported && (
          <p className="hint warn">
            当前浏览器不支持语音转写（webkitSpeechRecognition），建议使用 Chrome。
          </p>
        )}
        {errorMessage && <p className="hint error">{errorMessage}</p>}
        {showRealtimeErrorInHeader && <p className="hint error">{speech.error}</p>}
        {showFallbackRecoveredHint && (
          <p className="hint warn">
            实时语音识别曾失败，但系统已自动切换后端转写并完成分析。
          </p>
        )}

        {state === 'idle' && (
          <RecordButton
            onClick={() => {
              void startRecording()
            }}
            disabled={!isRecordingSupported || isStarting}
          >
            开始录音
          </RecordButton>
        )}

        {state === 'recording' && (
          <div className="stack">
            <p className="timer">
              {formatDuration(elapsedSeconds)} / {formatDuration(MAX_RECORDING_SECONDS)}
            </p>
            <AudioWave />
            <section className="transcript-box">
              <p className="transcript-title">实时转写（测试中）</p>
              <p className="transcript-content">
                {liveTranscript
                  ? liveTranscript
                  : showRealtimeFallbackHint
                    ? '当前环境实时转写不可用，结束录音后会自动走后端语音转写。'
                    : '正在聆听，请开始说话...'}
              </p>
            </section>
            <RecordButton variant="danger" onClick={() => stopRecording()}>
              结束录音
            </RecordButton>
          </div>
        )}

        {state === 'result' && (
          <div className="stack result">
            <p className="loading">
              录音已结束，时长 {formatDuration(durationSeconds)}
              {isEvaluating ? '，分析中...' : ''}
            </p>
            {evaluateError && <p className="hint error">{evaluateError}</p>}
            {evaluation ? (
              <div className="score-grid">
                <p className="score-main">综合评分：{evaluation.overall_score}</p>
                <div className="dimension-grid">
                  {dimensionItems.map((item) => {
                    const data = evaluation.dimensions[item.key]
                    return (
                      <article className="dimension-card" key={item.key}>
                        <div className="dimension-head">
                          <p className="dimension-label">{item.label}</p>
                          <p className="dimension-score">{data.score}/10</p>
                        </div>
                        <p className="dimension-comment">{data.comment}</p>
                      </article>
                    )
                  })}
                </div>
                <section className="transcript-box">
                  <p className="transcript-title">最需要改进的 3 个建议</p>
                  <ol className="suggestion-list">
                    {evaluation.top3_suggestions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </section>
              </div>
            ) : isEvaluating ? (
              <p className="hint">
                正在转写并分析录音，结果出来后会自动更新，不是上一次结果。
              </p>
            ) : (
              <p className="hint warn">暂未生成分析结果，请重试或手动补充原文继续分析。</p>
            )}
            <section className="transcript-box">
              <p className="transcript-title">你的自我介绍原文</p>
              <p className="transcript-content">{transcriptForDisplay}</p>
            </section>
            {!`${speech.transcript} ${speech.interimTranscript}`.trim() && (
              <section className="transcript-box">
                <p className="transcript-title">手动补充原文（网络异常时可用）</p>
                <textarea
                  className="transcript-input"
                  placeholder="在此粘贴/输入你的自我介绍文本，后续阶段会直接用这段文本分析。"
                  value={manualTranscript}
                  onChange={(event) => setManualTranscript(event.target.value)}
                />
                <RecordButton
                  onClick={() => {
                    void runEvaluation(manualTranscript)
                  }}
                  disabled={isEvaluating || !manualTranscript.trim()}
                >
                  {isEvaluating ? '分析中...' : '用这段原文开始分析'}
                </RecordButton>
              </section>
            )}
            <RecordButton variant="ghost" onClick={resetToIdle}>
              再试一次
            </RecordButton>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
