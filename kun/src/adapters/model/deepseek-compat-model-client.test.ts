import { describe, expect, it, vi } from 'vitest'
import { makeUserItem } from '../../domain/item.js'
import type { ModelRequest } from '../../ports/model-client.js'
import { DeepseekCompatModelClient } from './deepseek-compat-model-client.js'

describe('DeepseekCompatModelClient local max tokens', () => {
  it('adds a local default max_tokens for localhost-compatible providers', async () => {
    const { body } = await captureRequestBody('http://127.0.0.1:30000')

    expect(body.max_tokens).toBe(1024)
  })

  it('does not add a default max_tokens for remote providers', async () => {
    const { body } = await captureRequestBody('https://api.deepseek.com')

    expect(body).not.toHaveProperty('max_tokens')
  })

  it('preserves explicit maxTokens over the local default', async () => {
    const { body } = await captureRequestBody('http://localhost:11434', {
      maxTokens: 256
    })

    expect(body.max_tokens).toBe(256)
  })
})

async function captureRequestBody(
  baseUrl: string,
  requestPatch: Partial<ModelRequest> = {}
): Promise<{ body: Record<string, unknown> }> {
  let captured: Record<string, unknown> | null = null
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        id: 'chatcmpl_test',
        model: 'gemma4-12b',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'ok' }
          }
        ]
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  })
  const client = new DeepseekCompatModelClient({
    baseUrl,
    apiKey: '',
    model: 'gemma4-12b',
    fetchImpl,
    nonStreaming: true
  })

  for await (const _chunk of client.stream(modelRequest(requestPatch))) {
    // Drain the stream so the request is sent.
  }

  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(captured).not.toBeNull()
  return { body: captured ?? {} }
}

function modelRequest(patch: Partial<ModelRequest> = {}): ModelRequest {
  const controller = new AbortController()
  const threadId = 'thr_test'
  const turnId = 'turn_test'
  return {
    threadId,
    turnId,
    model: 'gemma4-12b',
    prefix: [],
    history: [
      makeUserItem({
        id: 'item_user',
        threadId,
        turnId,
        text: 'hello'
      })
    ],
    tools: [],
    abortSignal: controller.signal,
    ...patch
  }
}
