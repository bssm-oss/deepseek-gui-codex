import { describe, expect, it } from 'vitest'
import {
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_KUN_MODEL,
  DEFAULT_MODEL_PROVIDER_ID,
  buildInitialSetupProviderPatch,
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  normalizeAppSettings,
  resolveKunRuntimeSettings,
  type AppSettingsV1
} from './app-settings'

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'ko',
    theme: 'system',
    uiFontScale: 'small',
    provider: defaultModelProviderSettings(),
    agents: { kun: defaultKunRuntimeSettings() },
    workspaceRoot: '/tmp/workspace',
    log: { enabled: false, retentionDays: 7 },
    notifications: { turnComplete: true },
    appBehavior: { openAtLogin: false, startMinimized: false, closeToTray: false },
    keyboardShortcuts: defaultKeyboardShortcuts(),
    write: defaultWriteSettings(),
    claw: defaultClawSettings(),
    schedule: defaultScheduleSettings(),
    guiUpdate: { channel: 'stable' },
    codePromptPrefix: ''
  }
}

function applyProviderPatch(settings: AppSettingsV1, authType: 'api-key' | 'codex-oauth'): AppSettingsV1 {
  const patch = buildInitialSetupProviderPatch(settings, authType)
  return normalizeAppSettings({
    ...settings,
    ...patch,
    provider: {
      ...settings.provider,
      ...(patch.provider ?? {})
    },
    agents: patch.agents
      ? {
          ...settings.agents,
          ...patch.agents,
          kun: {
            ...settings.agents.kun,
            ...(patch.agents.kun ?? {})
          }
        }
      : settings.agents
  } as AppSettingsV1)
}

describe('initial setup provider patch', () => {
  it('selects Codex OAuth without requiring a DeepSeek API key', () => {
    const initial = settings()
    const next = applyProviderPatch(initial, 'codex-oauth')
    const runtime = resolveKunRuntimeSettings(next)
    const codexProvider = next.provider.providers.find((provider) =>
      provider.id === CODEX_OAUTH_MODEL_PROVIDER_ID
    )

    expect(next.agents.kun.providerId).toBe(CODEX_OAUTH_MODEL_PROVIDER_ID)
    expect(next.agents.kun.model).toBe(DEFAULT_CODEX_OAUTH_MODEL)
    expect(codexProvider).toMatchObject({
      authType: 'codex-oauth',
      apiKey: '',
      baseUrl: DEFAULT_CODEX_OAUTH_BASE_URL,
      codexAuthPath: DEFAULT_CODEX_AUTH_PATH
    })
    expect(runtime.modelProviderAuthType).toBe('codex-oauth')
    expect(runtime.apiKey).toBe('')
    expect(runtime.codexAuthPath).toBe(DEFAULT_CODEX_AUTH_PATH)
  })

  it('switches back to the default DeepSeek provider and model', () => {
    const initial = applyProviderPatch(settings(), 'codex-oauth')
    const next = applyProviderPatch(initial, 'api-key')

    expect(next.agents.kun.providerId).toBe(DEFAULT_MODEL_PROVIDER_ID)
    expect(next.agents.kun.model).toBe(DEFAULT_KUN_MODEL)
    expect(next.agents.kun.modelProviderAuthType).toBe('api-key')
    expect(next.agents.kun.codexAuthPath).toBe('')
  })
})
