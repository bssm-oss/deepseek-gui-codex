import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_MLX_LM_BASE_URL,
  DEFAULT_MLX_LM_MODEL,
  MLX_LM_MODEL_PROVIDER_ID,
  type KunRuntimeSettingsV1
} from '../shared/app-settings'
import { appendManagedLogLine } from './logger'

const MLX_LM_STOP_GRACE_MS = 5_000
const MLX_LM_STOP_FORCE_MS = 1_000
const parsedStartupTimeoutMs = Number(process.env.DEEPSEEK_GUI_MLX_LM_STARTUP_TIMEOUT_MS)
const MLX_LM_STARTUP_TIMEOUT_MS = Number.isFinite(parsedStartupTimeoutMs) && parsedStartupTimeoutMs > 0
  ? parsedStartupTimeoutMs
  : 180_000
const MLX_LM_STDERR_TAIL_MAX_CHARS = 6_000
const DEFAULT_MLX_LM_PYTHON = join(homedir(), '.deepseekgui', 'sglang-metal', 'bin', 'python')

export type MlxLmRuntimeEnsureOptions = {
  startupTimeoutMs?: number
}

let child: ChildProcess | null = null
let stderrTail = ''

type MlxLmEndpoint = {
  baseUrl: string
  host: string
  port: number
  autoLaunchable: boolean
}

type MlxLmHealth = {
  ok: boolean
  modelIds: string[]
}

function appendTail(current: string, nextChunk: string): string {
  const combined = `${current}${nextChunk}`
  return combined.length > MLX_LM_STDERR_TAIL_MAX_CHARS
    ? combined.slice(-MLX_LM_STDERR_TAIL_MAX_CHARS)
    : combined
}

function formatLogLine(stream: 'stdout' | 'stderr' | 'lifecycle', pid: number | undefined, message: string): string {
  const stamp = new Date().toISOString()
  const pidLabel = typeof pid === 'number' ? `mlx-lm pid=${pid}` : 'mlx-lm'
  return `[${stamp}] [${stream.toUpperCase()}] [${pidLabel}] ${message}\n`
}

function logLifecycle(message: string, pid = child?.pid): void {
  void appendManagedLogLine('mlx-lm', formatLogLine('lifecycle', pid, message))
}

function captureChildOutput(stream: 'stdout' | 'stderr', pid: number | undefined, chunk: Buffer | string): void {
  const text = String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (stream === 'stderr') stderrTail = appendTail(stderrTail, text)
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    void appendManagedLogLine('mlx-lm', formatLogLine(stream, pid, line))
  }
}

function parseMlxLmEndpoint(baseUrl: string): MlxLmEndpoint {
  const fallback = new URL(DEFAULT_MLX_LM_BASE_URL)
  let url: URL
  try {
    url = new URL(baseUrl.trim() || DEFAULT_MLX_LM_BASE_URL)
  } catch {
    url = fallback
  }
  const host = url.hostname || fallback.hostname
  const port = Number(url.port || fallback.port || 80)
  const autoLaunchable =
    url.protocol === 'http:' &&
    (host === '127.0.0.1' || host === 'localhost' || host === '::1') &&
    (url.pathname === '' || url.pathname === '/')
  return {
    baseUrl: `${url.protocol}//${url.host}`.replace(/\/+$/, ''),
    host,
    port,
    autoLaunchable
  }
}

async function checkMlxLmHealth(endpoint: MlxLmEndpoint, timeoutMs = 1_000): Promise<MlxLmHealth> {
  try {
    const res = await fetch(`${endpoint.baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) return { ok: false, modelIds: [] }
    const body = await res.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null
    const modelIds = Array.isArray(body?.data)
      ? body.data.map((item) => typeof item.id === 'string' ? item.id : '').filter(Boolean)
      : []
    return { ok: true, modelIds }
  } catch {
    return { ok: false, modelIds: [] }
  }
}

function modelIsExposed(health: MlxLmHealth, model: string): boolean {
  return health.ok && (health.modelIds.length === 0 || health.modelIds.includes(model))
}

function mlxLmPythonPath(): string {
  return process.env.DEEPSEEK_GUI_MLX_LM_PYTHON?.trim() ||
    process.env.DEEPSEEK_GUI_SGLANG_PYTHON?.trim() ||
    DEFAULT_MLX_LM_PYTHON
}

function mlxLmModelPath(runtime: KunRuntimeSettingsV1): string {
  return process.env.DEEPSEEK_GUI_MLX_LM_MODEL_PATH?.trim() || runtime.model || DEFAULT_MLX_LM_MODEL
}

function mlxLmLaunchArgs(endpoint: MlxLmEndpoint, runtime: KunRuntimeSettingsV1): string[] {
  return [
    '-m',
    'mlx_lm',
    'server',
    '--model',
    mlxLmModelPath(runtime),
    '--host',
    endpoint.host,
    '--port',
    String(endpoint.port),
    '--chat-template-args',
    '{"enable_thinking":false}',
    '--log-level',
    'WARNING'
  ]
}

function isMlxLmSelected(runtime: KunRuntimeSettingsV1): boolean {
  return runtime.modelProviderAuthType === 'none' && runtime.providerId === MLX_LM_MODEL_PROVIDER_ID
}

export async function ensureMlxLmServerForRuntime(
  runtime: KunRuntimeSettingsV1,
  options: MlxLmRuntimeEnsureOptions = {}
): Promise<void> {
  if (!isMlxLmSelected(runtime)) return

  const endpoint = parseMlxLmEndpoint(runtime.baseUrl)
  const health = await checkMlxLmHealth(endpoint)
  if (modelIsExposed(health, runtime.model)) return
  if (health.ok) {
    throw new Error(
      `MLX-LM server at ${endpoint.baseUrl} is running but does not expose model "${runtime.model}". Exposed models: ${health.modelIds.join(', ') || '(none)'}`
    )
  }
  if (!endpoint.autoLaunchable) {
    throw new Error(`MLX-LM server is not reachable at ${endpoint.baseUrl}. Start it manually or use a local 127.0.0.1 endpoint.`)
  }

  if (child && child.exitCode === null && child.signalCode === null) {
    await waitForMlxLmServer(endpoint, runtime.model, undefined, options.startupTimeoutMs)
    return
  }

  const python = mlxLmPythonPath()
  if (!existsSync(python)) {
    throw new Error(
      `MLX-LM runtime is not installed at ${python}. Install the local MLX runtime or switch Settings to Ollama.`
    )
  }

  const args = mlxLmLaunchArgs(endpoint, runtime)
  stderrTail = ''
  child = spawn(python, args, {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET || '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  })
  const startedChild = child
  const pid = startedChild.pid
  logLifecycle(`spawned ${python} ${args.join(' ')}`, pid)
  startedChild.stdout?.on('data', (chunk) => captureChildOutput('stdout', pid, chunk))
  startedChild.stderr?.on('data', (chunk) => captureChildOutput('stderr', pid, chunk))
  startedChild.on('exit', (code, signal) => {
    logLifecycle(signal ? `exited with signal ${signal}` : `exited with code ${code ?? 'unknown'}`, pid)
    if (child === startedChild) child = null
  })
  startedChild.on('error', (error) => {
    logLifecycle(`process error: ${error instanceof Error ? error.message : String(error)}`, pid)
  })

  await waitForMlxLmServer(endpoint, runtime.model, startedChild, options.startupTimeoutMs)
  logLifecycle(`ready on ${endpoint.baseUrl} as ${runtime.model}`, pid)
}

async function waitForMlxLmServer(
  endpoint: MlxLmEndpoint,
  model: string,
  process?: ChildProcess,
  startupTimeoutMs = MLX_LM_STARTUP_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + Math.max(1_000, startupTimeoutMs)
  while (Date.now() <= deadline) {
    if (process && process.exitCode !== null) {
      throw new Error(
        `MLX-LM exited during startup with code ${process.exitCode}.${stderrTail ? `\n${stderrTail}` : ''}`
      )
    }
    const health = await checkMlxLmHealth(endpoint, 1_500)
    if (modelIsExposed(health, model)) return
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(
    `Timed out waiting for MLX-LM at ${endpoint.baseUrl} to expose model "${model}".${stderrTail ? `\n${stderrTail}` : ''}`
  )
}

export async function stopMlxLmServerAndWait(): Promise<void> {
  if (!child) return
  const stoppingChild = child
  const pid = stoppingChild.pid
  if (stoppingChild.exitCode === null && stoppingChild.signalCode === null) {
    try {
      stoppingChild.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
  const exited = await waitForChildExit(stoppingChild, MLX_LM_STOP_GRACE_MS)
  if (!exited) {
    try {
      if (pid) process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
    await waitForChildExit(stoppingChild, MLX_LM_STOP_FORCE_MS)
  }
  if (child === stoppingChild) child = null
}

function waitForChildExit(process: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (process.exitCode !== null || process.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => settle(false), timeoutMs)
    const settle = (exited: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      process.removeListener('exit', onExit)
      process.removeListener('error', onError)
      resolve(exited)
    }
    const onExit = (): void => settle(true)
    const onError = (): void => settle(true)
    process.once('exit', onExit)
    process.once('error', onError)
  })
}
