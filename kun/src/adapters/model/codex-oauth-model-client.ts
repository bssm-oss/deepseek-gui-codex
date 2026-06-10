import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ModelClient, ModelRequest, ModelStreamChunk, ModelToolSpec } from '../../ports/model-client.js'
import type { TurnItem } from '../../contracts/items.js'
import { emptyUsageSnapshot, type UsageSnapshot } from '../../contracts/usage.js'
import { isToolResultBridgeItem, repairModelHistoryItems } from '../../domain/model-history-repair.js'
import { repairToolArguments } from './tool-argument-repair.js'

export type CodexOAuthModelClientConfig = {
  baseUrl: string
  authPath: string
  model: string
  fetchImpl?: typeof fetch
  streamIdleTimeoutMs?: number
}

type CodexAuthSnapshot = {
  accessToken: string
  refreshToken?: string
  accountId?: string
  isFedrampAccount: boolean
  expiresAtMs?: number
}

type ResponsesContentItem =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }

type ResponsesInputItem =
  | { type: 'message'; role: 'user' | 'assistant' | 'system'; content: ResponsesContentItem[] }
  | { type: 'function_call'; name: string; arguments: string; call_id: string }
  | { type: 'function_call_output'; call_id: string; output: string }

type ResponsesTool = {
  type: 'function'
  name: string
  description: string
  strict: false
  parameters: Record<string, unknown>
}

type StreamReadResult =
  | { kind: 'chunk'; value?: Uint8Array; done: boolean }
  | { kind: 'timeout' }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string }

const DEFAULT_CODEX_OAUTH_BASE_URL = 'https://chatgpt.com/backend-api/codex'
const DEFAULT_CODEX_AUTH_PATH = '~/.codex/auth.json'
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000

export class CodexOAuthModelClient implements ModelClient {
  readonly provider = 'codex-oauth'
  readonly model: string

  private readonly config: CodexOAuthModelClientConfig
  private readonly fetchImpl: typeof fetch

  constructor(config: CodexOAuthModelClientConfig) {
    this.config = config
    this.model = config.model
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamChunk> {
    if (request.abortSignal.aborted) {
      yield { kind: 'error', message: 'request was aborted before start' }
      return
    }

    let auth: CodexAuthSnapshot
    try {
      auth = await this.resolveAuth()
    } catch (error) {
      yield {
        kind: 'error',
        message: `Codex OAuth auth unavailable: ${error instanceof Error ? error.message : String(error)}`,
        code: 'codex_oauth_unavailable'
      }
      return
    }

    yield* this.streamWithAuth(request, auth, false)
  }

  private async *streamWithAuth(
    request: ModelRequest,
    auth: CodexAuthSnapshot,
    retriedAfterRefresh: boolean
  ): AsyncIterable<ModelStreamChunk> {
    const response = await this.sendResponsesRequest(request, auth).catch((error: unknown) => ({
      error: error instanceof Error ? error.message : String(error)
    }))
    if ('error' in response) {
      yield { kind: 'error', message: `model request failed: ${response.error}` }
      return
    }
    if (!response.ok) {
      const text = await response.text()
      if ((response.status === 401 || response.status === 403) && !retriedAfterRefresh) {
        try {
          const refreshed = await this.refreshAuth()
          yield* this.streamWithAuth(request, refreshed, true)
          return
        } catch {
          // Fall through to the original provider error; it has the most useful status/body.
        }
      }
      yield {
        kind: 'error',
        message: `Codex OAuth model request failed with status ${response.status}: ${text.slice(0, 500)}`,
        code: `codex_http_${response.status}`
      }
      return
    }
    if (!response.body) {
      yield { kind: 'error', message: 'model response had no body' }
      return
    }
    yield* this.streamResponsesSse(response.body, request.abortSignal)
  }

  private async sendResponsesRequest(request: ModelRequest, auth: CodexAuthSnapshot): Promise<Response> {
    const body = this.buildRequestBody(request)
    return this.fetchImpl(this.buildUrl('/responses'), {
      method: 'POST',
      headers: this.buildHeaders(auth),
      body: JSON.stringify(body),
      signal: request.abortSignal
    })
  }

  private buildUrl(path: string): string {
    const base = (this.config.baseUrl.trim() || DEFAULT_CODEX_OAUTH_BASE_URL).replace(/\/+$/, '')
    return `${base}${path}`
  }

  private buildHeaders(auth: CodexAuthSnapshot): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${auth.accessToken}`,
      originator: 'codex_cli_rs'
    }
    if (auth.accountId) headers['ChatGPT-Account-ID'] = auth.accountId
    if (auth.isFedrampAccount) headers['X-OpenAI-Fedramp'] = 'true'
    return headers
  }

  private buildRequestBody(request: ModelRequest): Record<string, unknown> {
    return {
      model: request.model?.trim() || this.config.model,
      instructions: [
        request.systemPrompt,
        request.modeInstruction,
        ...(request.contextInstructions ?? [])
      ].filter((value) => typeof value === 'string' && value.trim()).join('\n\n'),
      input: this.collectInput(request),
      tools: normalizeToolSpecs(request.tools).map((tool): ResponsesTool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        strict: false,
        parameters: canonicalizeSchema(tool.inputSchema)
      })),
      tool_choice: 'auto',
      parallel_tool_calls: true,
      reasoning: reasoningForRequest(request.reasoningEffort),
      store: false,
      stream: true,
      include: request.reasoningEffort && request.reasoningEffort !== 'off'
        ? ['reasoning.encrypted_content']
        : []
    }
  }

  private collectInput(request: ModelRequest): ResponsesInputItem[] {
    const items = repairModelHistoryItems([...request.prefix, ...request.history])
    const out: ResponsesInputItem[] = []
    for (let index = 0; index < items.length;) {
      if (isBridgeItemBeforeToolCall(items, index)) {
        index += 1
        continue
      }
      const block = this.toolCallBlockToInput(items, index)
      if (block) {
        out.push(...block.items)
        index = block.nextIndex
        continue
      }
      const item = items[index]
      if (!item) {
        index += 1
        continue
      }
      if (item.kind === 'tool_result') {
        index += 1
        continue
      }
      const input = this.itemToInput(item)
      if (input) out.push(input)
      index += 1
    }
    return out
  }

  private toolCallBlockToInput(
    items: TurnItem[],
    startIndex: number
  ): { items: ResponsesInputItem[]; nextIndex: number } | null {
    const calls: Extract<TurnItem, { kind: 'tool_call' }>[] = []
    let index = startIndex
    while (index < items.length && items[index]?.kind === 'tool_call') {
      calls.push(items[index] as Extract<TurnItem, { kind: 'tool_call' }>)
      index += 1
    }
    if (calls.length === 0) return null

    const turnId = calls[0]?.turnId ?? ''
    const expectedCallIds = new Set(calls.map((call) => call.callId))
    const seenResultIds = new Set<string>()
    const resultInputs: ResponsesInputItem[] = []
    while (index < items.length) {
      const item = items[index]
      if (!item) break
      if (item.kind === 'tool_result') {
        if (expectedCallIds.has(item.callId) && !seenResultIds.has(item.callId)) {
          seenResultIds.add(item.callId)
          resultInputs.push({
            type: 'function_call_output',
            call_id: item.callId,
            output: toolResultContent(item.output)
          })
        }
        index += 1
        continue
      }
      if (isToolResultBridgeItem(item, { turnId, sawResult: seenResultIds.size > 0 })) {
        index += 1
        continue
      }
      break
    }
    if (![...expectedCallIds].every((callId) => seenResultIds.has(callId))) return null
    return {
      items: [
        ...calls.map((call): ResponsesInputItem => ({
          type: 'function_call',
          name: call.toolName,
          arguments: JSON.stringify(call.arguments),
          call_id: call.callId
        })),
        ...resultInputs
      ],
      nextIndex: index
    }
  }

  private itemToInput(item: TurnItem): ResponsesInputItem | null {
    switch (item.kind) {
      case 'user_message':
        return messageInput('user', item.text)
      case 'assistant_text':
        return messageInput('assistant', item.text)
      case 'assistant_reasoning':
        return null
      case 'tool_call':
        return {
          type: 'function_call',
          name: item.toolName,
          arguments: JSON.stringify(item.arguments),
          call_id: item.callId
        }
      case 'tool_result':
        return {
          type: 'function_call_output',
          call_id: item.callId,
          output: toolResultContent(item.output)
        }
      case 'compaction':
        return item.replacedTokens > 0
          ? messageInput('system', `Conversation summary from earlier turns:\n${item.summary}`)
          : null
      case 'review':
        return item.status === 'completed' && item.reviewText?.trim()
          ? messageInput('system', `Code review result from an earlier turn:\n${item.reviewText}`)
          : null
      case 'approval':
      case 'user_input':
      case 'error':
        return null
    }
  }

  private async *streamResponsesSse(
    body: ReadableStream<Uint8Array>,
    signal: AbortSignal
  ): AsyncIterable<ModelStreamChunk> {
    const decoder = new TextDecoder('utf-8')
    const reader = body.getReader()
    let buffer = ''
    let usage: UsageSnapshot | null = null
    let completed = false
    let failed = false
    const idleTimeoutMs = normalizeStreamIdleTimeoutMs(this.config.streamIdleTimeoutMs)
    try {
      while (!signal.aborted) {
        const read = await readStreamChunk(reader, signal, idleTimeoutMs)
        if (read.kind === 'timeout') {
          yield {
            kind: 'error',
            message: `model stream stalled for ${idleTimeoutMs}ms without data`,
            code: 'stream_idle_timeout'
          }
          return
        }
        if (read.kind === 'aborted') break
        if (read.kind === 'error') {
          yield { kind: 'error', message: read.message, code: 'stream_read_error' }
          return
        }
        const { value, done } = read
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary: number
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const payload = parseSseFrame(frame)
          if (!payload) continue
          const result = this.consumeResponsesPayload(payload)
          if (result.usage) usage = result.usage
          if (result.completed) completed = true
          if (result.failed) failed = true
          for (const chunk of result.chunks) yield chunk
        }
        if (completed || failed) break
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // The stream may already be released; ignore.
      }
    }
    if (signal.aborted) {
      yield { kind: 'error', message: 'request was aborted' }
      return
    }
    if (usage) yield { kind: 'usage', usage }
    yield { kind: 'completed', stopReason: failed ? 'error' : 'stop' }
  }

  private consumeResponsesPayload(payload: Record<string, unknown>): {
    chunks: ModelStreamChunk[]
    usage: UsageSnapshot | null
    completed: boolean
    failed: boolean
  } {
    const chunks: ModelStreamChunk[] = []
    const type = typeof payload.type === 'string' ? payload.type : ''
    if (type === 'response.output_text.delta' && typeof payload.delta === 'string') {
      chunks.push({ kind: 'assistant_text_delta', text: payload.delta })
    } else if (
      (type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta') &&
      typeof payload.delta === 'string'
    ) {
      chunks.push({ kind: 'assistant_reasoning_delta', text: payload.delta })
    } else if (
      (type === 'response.function_call_arguments.delta' || type === 'response.custom_tool_call_input.delta') &&
      typeof payload.delta === 'string'
    ) {
      const callId = stringField(payload.call_id) || stringField(payload.item_id)
      if (callId) {
        chunks.push({ kind: 'tool_call_delta', callId, argumentsDelta: payload.delta })
      }
    } else if (type === 'response.output_item.done') {
      const toolCall = responseToolCall(payload.item)
      if (toolCall) {
        chunks.push({
          kind: 'tool_call_complete',
          callId: toolCall.callId,
          toolName: toolCall.name,
          arguments: repairToolArguments(toolCall.arguments || '{}').arguments
        })
      }
    } else if (type === 'response.failed') {
      chunks.push({
        kind: 'error',
        message: responseErrorMessage(payload.response),
        code: 'codex_response_failed'
      })
    }
    return {
      chunks,
      usage: type === 'response.completed' ? usageFromCompleted(payload.response) : null,
      completed: type === 'response.completed',
      failed: type === 'response.failed'
    }
  }

  private async resolveAuth(): Promise<CodexAuthSnapshot> {
    const envToken = process.env.CODEX_ACCESS_TOKEN?.trim()
    if (envToken) {
      const payload = parseJwtPayload(envToken)
      const authClaims = chatgptAuthClaims(payload)
      return {
        accessToken: envToken,
        accountId: stringField(authClaims?.['chatgpt_account_id']),
        isFedrampAccount: authClaims?.['chatgpt_account_is_fedramp'] === true,
        expiresAtMs: numberField(payload?.exp) ? numberField(payload?.exp)! * 1000 : undefined
      }
    }
    const auth = await this.readAuthFile()
    if (!auth.accessToken) throw new Error(`missing Codex access token in ${this.authPath()}`)
    if (shouldRefresh(auth)) {
      try {
        return await this.refreshAuth(auth)
      } catch {
        return auth
      }
    }
    return auth
  }

  private async refreshAuth(current?: CodexAuthSnapshot): Promise<CodexAuthSnapshot> {
    const auth = current ?? await this.readAuthFile()
    if (!auth.refreshToken) throw new Error('Codex OAuth refresh token is unavailable')
    const response = await this.fetchImpl(process.env.CODEX_REFRESH_TOKEN_URL_OVERRIDE || REFRESH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', originator: 'codex_cli_rs' },
      body: JSON.stringify({
        client_id: CODEX_OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken
      })
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Codex OAuth refresh failed with status ${response.status}: ${text.slice(0, 300)}`)
    }
    const payload = JSON.parse(text) as Record<string, unknown>
    const next = await this.readAuthJsonObject()
    const tokens = objectValue(next.tokens)
    const accessToken = stringField(payload.access_token) || auth.accessToken
    const refreshToken = stringField(payload.refresh_token) || auth.refreshToken
    const idToken = stringField(payload.id_token) || stringField(tokens.id_token)
    next.tokens = {
      ...tokens,
      ...(idToken ? { id_token: idToken } : {}),
      access_token: accessToken,
      refresh_token: refreshToken,
      ...(auth.accountId ? { account_id: auth.accountId } : {})
    }
    next.last_refresh = new Date().toISOString()
    await writeJsonFileAtomic(this.authPath(), next)
    return this.readAuthFile()
  }

  private async readAuthFile(): Promise<CodexAuthSnapshot> {
    const auth = await this.readAuthJsonObject()
    const tokens = objectValue(auth.tokens)
    const accessToken = stringField(tokens.access_token) || stringField(auth.personal_access_token)
    if (!accessToken) throw new Error(`missing access token in ${this.authPath()}`)
    const idPayload = parseJwtPayload(stringField(tokens.id_token) || accessToken)
    const accessPayload = parseJwtPayload(accessToken)
    const idAuthClaims = chatgptAuthClaims(idPayload)
    const accessAuthClaims = chatgptAuthClaims(accessPayload)
    const accountId =
      stringField(tokens.account_id) ||
      stringField(idAuthClaims?.['chatgpt_account_id']) ||
      stringField(accessAuthClaims?.['chatgpt_account_id'])
    return {
      accessToken,
      refreshToken: stringField(tokens.refresh_token),
      accountId,
      isFedrampAccount:
        idAuthClaims?.['chatgpt_account_is_fedramp'] === true ||
        accessAuthClaims?.['chatgpt_account_is_fedramp'] === true,
      expiresAtMs: numberField(accessPayload?.exp) ? numberField(accessPayload?.exp)! * 1000 : undefined
    }
  }

  private async readAuthJsonObject(): Promise<Record<string, unknown>> {
    const path = this.authPath()
    const text = await readFile(path, 'utf8')
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`invalid Codex auth JSON at ${path}`)
    }
    return parsed as Record<string, unknown>
  }

  private authPath(): string {
    const raw = this.config.authPath?.trim() || DEFAULT_CODEX_AUTH_PATH
    return expandHomePath(raw)
  }
}

function messageInput(role: 'user' | 'assistant' | 'system', text: string): ResponsesInputItem {
  return {
    type: 'message',
    role,
    content: [{
      type: role === 'assistant' ? 'output_text' : 'input_text',
      text
    }]
  }
}

function normalizeToolSpecs(tools: ModelToolSpec[]): ModelToolSpec[] {
  return [...tools]
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: canonicalizeSchema(tool.inputSchema)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function reasoningForRequest(effort: string | undefined): Record<string, unknown> | null {
  const normalized = effort?.trim().toLowerCase()
  if (!normalized || ['off', 'disabled', 'none', 'false'].includes(normalized)) return null
  return {
    effort: normalized === 'max' || normalized === 'xhigh' || normalized === 'maximum'
      ? 'high'
      : normalized === 'low' || normalized === 'medium' || normalized === 'high'
        ? normalized
        : 'high',
    summary: 'auto'
  }
}

function responseToolCall(value: unknown): { callId: string; name: string; arguments: string } | null {
  const item = objectValue(value)
  const type = stringField(item.type)
  if (type !== 'function_call' && type !== 'custom_tool_call') return null
  const callId = stringField(item.call_id)
  const name = stringField(item.name)
  if (!callId || !name) return null
  return {
    callId,
    name,
    arguments: stringField(item.arguments) || stringField(item.input) || '{}'
  }
}

function usageFromCompleted(value: unknown): UsageSnapshot | null {
  const response = objectValue(value)
  const usage = objectValue(response.usage)
  if (Object.keys(usage).length === 0) return null
  const promptTokens = numberField(usage.input_tokens) ?? 0
  const completionTokens = numberField(usage.output_tokens) ?? 0
  const totalTokens = numberField(usage.total_tokens) ?? promptTokens + completionTokens
  const inputDetails = objectValue(usage.input_tokens_details)
  const cachedTokens = numberField(inputDetails.cached_tokens) ?? 0
  const cacheMissTokens = Math.max(promptTokens - cachedTokens, 0)
  const cacheTotal = cachedTokens + cacheMissTokens
  return {
    ...emptyUsageSnapshot(),
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheHitTokens: cachedTokens,
    cacheMissTokens,
    cacheHitRate: cacheTotal > 0 ? cachedTokens / cacheTotal : null,
    turns: 1
  }
}

function responseErrorMessage(value: unknown): string {
  const response = objectValue(value)
  const error = objectValue(response.error)
  return stringField(error.message) || stringField(error.code) || 'Codex OAuth response failed'
}

function parseSseFrame(frame: string): Record<string, unknown> | null {
  const data = frame
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('')
  if (!data || data === '[DONE]') return null
  try {
    const parsed = JSON.parse(data) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function parseJwtPayload(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length < 2 || !parts[1]) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as unknown
    return objectValue(parsed)
  } catch {
    return null
  }
}

function chatgptAuthClaims(payload: Record<string, unknown> | null): Record<string, unknown> {
  return objectValue(payload?.['https://api.openai.com/auth'])
}

function shouldRefresh(auth: CodexAuthSnapshot): boolean {
  return typeof auth.expiresAtMs === 'number' && auth.expiresAtMs <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS
}

function expandHomePath(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2).replace(/\\/g, '/'))
  }
  return path
}

async function writeJsonFileAtomic(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

function canonicalizeSchema(value: unknown): Record<string, unknown> {
  const canonical = canonicalize(value)
  return canonical && typeof canonical === 'object' && !Array.isArray(canonical)
    ? canonical as Record<string, unknown>
    : {}
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalize((value as Record<string, unknown>)[key])
  }
  return out
}

function toolResultContent(output: unknown): string {
  if (typeof output === 'string') return output
  return JSON.stringify(output) ?? ''
}

function isBridgeItemBeforeToolCall(items: TurnItem[], index: number): boolean {
  const item = items[index]
  if (!item || (item.kind !== 'assistant_reasoning' && item.kind !== 'assistant_text')) return false
  let cursor = index + 1
  while (cursor < items.length) {
    const next = items[cursor]
    if (!next) return false
    if (next.kind === 'assistant_reasoning' || next.kind === 'assistant_text') {
      if (next.turnId !== item.turnId) return false
      cursor += 1
      continue
    }
    return next.kind === 'tool_call' && next.turnId === item.turnId
  }
  return false
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeStreamIdleTimeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(value)) return DEFAULT_STREAM_IDLE_TIMEOUT_MS
  return Math.max(0, Math.floor(value))
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  idleTimeoutMs: number
): Promise<StreamReadResult> {
  if (signal.aborted) return { kind: 'aborted' }
  let timeout: ReturnType<typeof setTimeout> | undefined
  let cleanupAbort: (() => void) | undefined
  const readPromise = reader.read()
    .then((result): StreamReadResult => ({ kind: 'chunk', ...result }))
    .catch((error): StreamReadResult => {
      if (signal.aborted) return { kind: 'aborted' }
      const message = error instanceof Error ? error.message : String(error)
      return { kind: 'error', message: `model stream read failed: ${message}` }
    })
  const abortPromise = new Promise<StreamReadResult>((resolve) => {
    const onAbort = (): void => resolve({ kind: 'aborted' })
    if (signal.aborted) {
      resolve({ kind: 'aborted' })
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    cleanupAbort = () => signal.removeEventListener('abort', onAbort)
  })
  const timeoutPromise = new Promise<StreamReadResult>((resolve) => {
    if (idleTimeoutMs <= 0) return
    timeout = setTimeout(() => resolve({ kind: 'timeout' }), idleTimeoutMs)
  })
  try {
    return await Promise.race([readPromise, abortPromise, timeoutPromise])
  } finally {
    if (timeout) clearTimeout(timeout)
    cleanupAbort?.()
  }
}
