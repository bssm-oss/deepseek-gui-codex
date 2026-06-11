import type {
  TestSpriteSettingsPatchV1,
  TestSpriteSettingsV1
} from './app-settings-types'

export const TESTSPRITE_MCP_SERVER_NAME = 'testsprite'
export const TESTSPRITE_DOCS_URL = 'https://docs.testsprite.com/mcp/getting-started/installation'
export const DEFAULT_TESTSPRITE_MCP_COMMAND = 'npx'
export const DEFAULT_TESTSPRITE_MCP_ARGS = ['-y', '@testsprite/testsprite-mcp@latest'] as const
export const DEFAULT_TESTSPRITE_TIMEOUT_MS = 120_000
export const MIN_TESTSPRITE_TIMEOUT_MS = 5_000
export const MAX_TESTSPRITE_TIMEOUT_MS = 600_000
export const DEFAULT_TESTSPRITE_PROMPT_PREFIX = [
  'Use TestSprite MCP to test this workspace end to end.',
  'Read the project, infer frontend and backend entry points, generate and run the relevant TestSprite tests, then inspect the TestSprite result.',
  'Do not replace TestSprite with manual-only testing. If TestSprite is unavailable, report the exact MCP/tool error and stop.'
].join('\n')

export function defaultTestSpriteSettings(): TestSpriteSettingsV1 {
  return {
    enabled: false,
    apiKey: '',
    command: DEFAULT_TESTSPRITE_MCP_COMMAND,
    args: [...DEFAULT_TESTSPRITE_MCP_ARGS],
    timeoutMs: DEFAULT_TESTSPRITE_TIMEOUT_MS,
    promptPrefix: DEFAULT_TESTSPRITE_PROMPT_PREFIX
  }
}

export function normalizeTestSpriteSettings(
  settings?: Partial<TestSpriteSettingsV1> | null
): TestSpriteSettingsV1 {
  const defaults = defaultTestSpriteSettings()
  const args = Array.isArray(settings?.args)
    ? settings.args
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults.args
  return {
    enabled: settings?.enabled === true,
    apiKey: typeof settings?.apiKey === 'string' ? settings.apiKey.trim() : '',
    command:
      typeof settings?.command === 'string' && settings.command.trim()
        ? settings.command.trim()
        : defaults.command,
    args: args.length > 0 ? args : defaults.args,
    timeoutMs: clampTestSpriteTimeout(settings?.timeoutMs),
    promptPrefix:
      typeof settings?.promptPrefix === 'string' && settings.promptPrefix.trim()
        ? settings.promptPrefix
        : defaults.promptPrefix
  }
}

export function mergeTestSpriteSettings(
  current: TestSpriteSettingsV1 | undefined,
  patch: TestSpriteSettingsPatchV1 | undefined
): TestSpriteSettingsV1 {
  const safeCurrent = normalizeTestSpriteSettings(current)
  if (!patch) return safeCurrent
  return normalizeTestSpriteSettings({
    ...safeCurrent,
    ...patch,
    args: patch.args ?? safeCurrent.args
  })
}

export function isTestSpriteReady(settings?: Partial<TestSpriteSettingsV1> | null): boolean {
  const normalized = normalizeTestSpriteSettings(settings)
  return normalized.enabled && normalized.apiKey.trim().length > 0
}

export function buildTestSpriteRunPrompt(input: {
  workspaceRoot: string
  promptPrefix?: string
}): string {
  const prefix = input.promptPrefix?.trim() || DEFAULT_TESTSPRITE_PROMPT_PREFIX
  return [
    prefix,
    '',
    `Workspace: ${input.workspaceRoot}`,
    '',
    'Run this through TestSprite MCP now. Discover the app shape, run the generated TestSprite QA flow, and report the TestSprite result.',
    'If the MCP server is not available or the API key is rejected, say that directly with the exact error instead of claiming the app passed.',
    'Answer the final result in Korean with pass/fail status, what was tested, and any concrete failures.'
  ].join('\n')
}

function clampTestSpriteTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TESTSPRITE_TIMEOUT_MS
  return Math.min(
    MAX_TESTSPRITE_TIMEOUT_MS,
    Math.max(MIN_TESTSPRITE_TIMEOUT_MS, Math.round(value))
  )
}
