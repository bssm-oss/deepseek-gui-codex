import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_SGLANG_BASE_URL,
  DEFAULT_SGLANG_MODEL_PATH,
  SGLANG_MODEL_PROVIDER_ID,
  type KunRuntimeSettingsV1
} from '../shared/app-settings'
import { appendManagedLogLine } from './logger'

const SGLANG_STOP_GRACE_MS = 5_000
const SGLANG_STOP_FORCE_MS = 1_000
const parsedStartupTimeoutMs = Number(process.env.DEEPSEEK_GUI_SGLANG_STARTUP_TIMEOUT_MS)
const SGLANG_STARTUP_TIMEOUT_MS = Number.isFinite(parsedStartupTimeoutMs) && parsedStartupTimeoutMs > 0
  ? parsedStartupTimeoutMs
  : 180_000
const SGLANG_STDERR_TAIL_MAX_CHARS = 6_000
const DEFAULT_SGLANG_PYTHON = join(homedir(), '.deepseekgui', 'sglang-metal', 'bin', 'python')
const SGLANG_LAUNCHER_FILE = 'sglang-gemma4-text-launcher.py'

let child: ChildProcess | null = null
let stderrTail = ''

type SglangEndpoint = {
  baseUrl: string
  host: string
  port: number
  autoLaunchable: boolean
}

type SglangHealth = {
  ok: boolean
  modelIds: string[]
}

function appendTail(current: string, nextChunk: string): string {
  const combined = `${current}${nextChunk}`
  return combined.length > SGLANG_STDERR_TAIL_MAX_CHARS
    ? combined.slice(-SGLANG_STDERR_TAIL_MAX_CHARS)
    : combined
}

function formatLogLine(stream: 'stdout' | 'stderr' | 'lifecycle', pid: number | undefined, message: string): string {
  const stamp = new Date().toISOString()
  const pidLabel = typeof pid === 'number' ? `sglang pid=${pid}` : 'sglang'
  return `[${stamp}] [${stream.toUpperCase()}] [${pidLabel}] ${message}\n`
}

function logLifecycle(message: string, pid = child?.pid): void {
  void appendManagedLogLine('sglang', formatLogLine('lifecycle', pid, message))
}

function captureChildOutput(stream: 'stdout' | 'stderr', pid: number | undefined, chunk: Buffer | string): void {
  const text = String(chunk).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (stream === 'stderr') stderrTail = appendTail(stderrTail, text)
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    void appendManagedLogLine('sglang', formatLogLine(stream, pid, line))
  }
}

function parseSglangEndpoint(baseUrl: string): SglangEndpoint {
  const fallback = new URL(DEFAULT_SGLANG_BASE_URL)
  let url: URL
  try {
    url = new URL(baseUrl.trim() || DEFAULT_SGLANG_BASE_URL)
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

async function checkSglangHealth(endpoint: SglangEndpoint, timeoutMs = 1_000): Promise<SglangHealth> {
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

function modelIsExposed(health: SglangHealth, model: string): boolean {
  return health.ok && (health.modelIds.length === 0 || health.modelIds.includes(model))
}

function sglangPythonPath(): string {
  return process.env.DEEPSEEK_GUI_SGLANG_PYTHON?.trim() || DEFAULT_SGLANG_PYTHON
}

function sglangLauncherPath(): string {
  const override = process.env.DEEPSEEK_GUI_SGLANG_LAUNCHER?.trim()
  if (override) return override
  return app.isPackaged
    ? join(process.resourcesPath, SGLANG_LAUNCHER_FILE)
    : join(app.getAppPath(), 'resources', SGLANG_LAUNCHER_FILE)
}

function sglangModelPath(): string {
  return process.env.DEEPSEEK_GUI_SGLANG_MODEL_PATH?.trim() || DEFAULT_SGLANG_MODEL_PATH
}

function sglangLaunchArgs(endpoint: SglangEndpoint, model: string, launcherPath: string): string[] {
  return [
    launcherPath,
    '--host',
    endpoint.host,
    '--port',
    String(endpoint.port),
    '--model-path',
    sglangModelPath(),
    '--served-model-name',
    model,
    '--reasoning-parser',
    'gemma4',
    '--tool-call-parser',
    'gemma4',
    '--log-level',
    'warning',
    '--log-level-http',
    'warning'
  ]
}

function isSglangSelected(runtime: KunRuntimeSettingsV1): boolean {
  return runtime.modelProviderAuthType === 'none' && runtime.providerId === SGLANG_MODEL_PROVIDER_ID
}

export async function ensureSglangServerForRuntime(runtime: KunRuntimeSettingsV1): Promise<void> {
  if (!isSglangSelected(runtime)) return

  const endpoint = parseSglangEndpoint(runtime.baseUrl)
  const health = await checkSglangHealth(endpoint)
  if (modelIsExposed(health, runtime.model)) return
  if (health.ok) {
    throw new Error(
      `SGLang server at ${endpoint.baseUrl} is running but does not expose model "${runtime.model}". Exposed models: ${health.modelIds.join(', ') || '(none)'}`
    )
  }
  if (!endpoint.autoLaunchable) {
    throw new Error(`SGLang server is not reachable at ${endpoint.baseUrl}. Start it manually or use a local 127.0.0.1 endpoint.`)
  }

  if (child && child.exitCode === null && child.signalCode === null) {
    await waitForSglangServer(endpoint, runtime.model)
    return
  }

  const python = sglangPythonPath()
  if (!existsSync(python)) {
    throw new Error(
      `SGLang runtime is not installed at ${python}. Install the local SGLang/MLX runtime or switch Settings to Ollama.`
    )
  }
  const launcherPath = sglangLauncherPath()
  if (!existsSync(launcherPath)) {
    throw new Error(
      `SGLang launcher is missing at ${launcherPath}. Reinstall DeepSeek GUI or switch Settings to Ollama.`
    )
  }

  const args = sglangLaunchArgs(endpoint, runtime.model, launcherPath)
  stderrTail = ''
  child = spawn(python, args, {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      SGLANG_USE_MLX: '1'
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

  await waitForSglangServer(endpoint, runtime.model, startedChild)
  logLifecycle(`ready on ${endpoint.baseUrl} as ${runtime.model}`, pid)
}

async function waitForSglangServer(
  endpoint: SglangEndpoint,
  model: string,
  process?: ChildProcess
): Promise<void> {
  const deadline = Date.now() + Math.max(1_000, SGLANG_STARTUP_TIMEOUT_MS)
  while (Date.now() <= deadline) {
    if (process && process.exitCode !== null) {
      throw new Error(
        `SGLang exited during startup with code ${process.exitCode}.${stderrTail ? `\n${stderrTail}` : ''}`
      )
    }
    const health = await checkSglangHealth(endpoint, 1_500)
    if (modelIsExposed(health, model)) return
    await new Promise((resolve) => setTimeout(resolve, 750))
  }
  throw new Error(
    `Timed out waiting for SGLang at ${endpoint.baseUrl} to expose model "${model}".${stderrTail ? `\n${stderrTail}` : ''}`
  )
}

export async function stopSglangServerAndWait(): Promise<void> {
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
  const exited = await waitForChildExit(stoppingChild, SGLANG_STOP_GRACE_MS)
  if (!exited) {
    try {
      if (pid) process.kill(pid, 'SIGKILL')
    } catch {
      /* already gone */
    }
    await waitForChildExit(stoppingChild, SGLANG_STOP_FORCE_MS)
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
