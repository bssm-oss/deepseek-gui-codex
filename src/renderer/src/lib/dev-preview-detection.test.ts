import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../agent/types'
import {
  extractAutoOpenDevPreviewUrls,
  extractDetectedDevPreviewUrls,
  extractLatestTurnAutoOpenDevPreviewUrls,
  extractLatestTurnDevPreviewUrls
} from './dev-preview-detection'

function user(text: string): ChatBlock {
  return { kind: 'user', id: `user:${text}`, text }
}

function assistant(text: string): ChatBlock {
  return { kind: 'assistant', id: `assistant:${text}`, text }
}

function commandExecutionBlock(input: {
  summary?: string
  detail?: string
  status?: 'running' | 'success' | 'error'
  command: string
}): ChatBlock {
  return {
    kind: 'tool',
    id: `tool:${input.command}`,
    summary: input.summary ?? input.command,
    detail: input.detail,
    status: input.status ?? 'success',
    toolKind: 'command_execution',
    meta: { command: input.command }
  }
}

describe('dev preview detection', () => {
  it('ignores architectural explanations that only mention preview config and localhost', () => {
    const blocks: ChatBlock[] = [
      user('explain the project'),
      assistant(
        [
          '개발 미리보기 URL 허용 목록',
          '',
          '- 허용된 출처에는 `http://localhost:5173` 및 `http://127.0.0.1:5173`이 포함됩니다.',
          '- 이 내용은 주로 설정 설명이며 페이지를 열라는 안내가 아닙니다.'
        ].join('\n')
      )
    ]

    expect(extractLatestTurnDevPreviewUrls(blocks)).toEqual([])
    expect(extractLatestTurnAutoOpenDevPreviewUrls(blocks)).toEqual([])
  })

  it('shows a preview card for explicit assistant navigation hints without auto-opening', () => {
    const blocks: ChatBlock[] = [
      user('where is the frontend'),
      assistant('프론트엔드는 현재 http://localhost:3000 에서 실행 중이니 바로 접속해 확인할 수 있습니다.')
    ]

    expect(extractLatestTurnDevPreviewUrls(blocks)).toEqual(['http://localhost:3000/'])
    expect(extractLatestTurnAutoOpenDevPreviewUrls(blocks)).toEqual([])
  })

  it('auto-opens when a dev server command announces a local URL', () => {
    const blocks: ChatBlock[] = [
      commandExecutionBlock({
        command: 'npm run dev',
        status: 'running',
        detail: 'VITE v5.4.0  ready in 180 ms\n  Local:   http://localhost:5173/\n'
      })
    ]

    expect(extractDetectedDevPreviewUrls(blocks)).toEqual(['http://localhost:5173/'])
    expect(extractAutoOpenDevPreviewUrls(blocks)).toEqual(['http://localhost:5173/'])
  })

  it('ignores runtime API URLs even when they are local', () => {
    const blocks: ChatBlock[] = [
      user('how does the runtime work'),
      assistant('GUI는 runtime:request로 http://localhost:3000/v1/threads 에 요청해 스레드 목록을 가져옵니다.')
    ]

    expect(extractLatestTurnDevPreviewUrls(blocks)).toEqual([])
    expect(extractLatestTurnAutoOpenDevPreviewUrls(blocks)).toEqual([])
  })

  it('does not auto-open failed dev server commands that only expose a bound port', () => {
    const blocks: ChatBlock[] = [
      commandExecutionBlock({
        command: 'npm run dev',
        status: 'error',
        detail: 'Error: listen EADDRINUSE: address already in use 127.0.0.1:3000'
      })
    ]

    expect(extractDetectedDevPreviewUrls(blocks)).toEqual([])
    expect(extractAutoOpenDevPreviewUrls(blocks)).toEqual([])
  })
})
