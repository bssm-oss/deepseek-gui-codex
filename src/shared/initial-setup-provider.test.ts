import { describe, expect, it } from 'vitest'
import {
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_KUN_MODEL,
  DEFAULT_MODEL_PROVIDER_ID,
  DEFAULT_MLX_LM_BASE_URL,
  DEFAULT_MLX_LM_MODEL,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_SGLANG_BASE_URL,
  DEFAULT_SGLANG_MODEL,
  MLX_LM_MODEL_PROVIDER_ID,
  OLLAMA_MODEL_PROVIDER_ID,
  SGLANG_MODEL_PROVIDER_ID,
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

function applyProviderPatch(settings: AppSettingsV1, authType: 'api-key' | 'codex-oauth' | 'none'): AppSettingsV1 {
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

  it('selects local Gemma through MLX-LM by default without an API key', () => {
    const next = applyProviderPatch(settings(), 'none')
    const runtime = resolveKunRuntimeSettings(next)
    const mlxLmProvider = next.provider.providers.find((provider) =>
      provider.id === MLX_LM_MODEL_PROVIDER_ID
    )

    expect(next.agents.kun.providerId).toBe(MLX_LM_MODEL_PROVIDER_ID)
    expect(next.agents.kun.model).toBe(DEFAULT_MLX_LM_MODEL)
    expect(mlxLmProvider).toMatchObject({
      authType: 'none',
      apiKey: '',
      baseUrl: DEFAULT_MLX_LM_BASE_URL,
      codexAuthPath: '',
      models: [DEFAULT_MLX_LM_MODEL]
    })
    expect(runtime.modelProviderAuthType).toBe('none')
    expect(runtime.apiKey).toBe('')
    expect(runtime.baseUrl).toBe(DEFAULT_MLX_LM_BASE_URL)
  })

  it('can still select local Gemma through SGLang without an API key', () => {
    const initial = settings()
    const patch = buildInitialSetupProviderPatch(initial, 'none', SGLANG_MODEL_PROVIDER_ID)
    const next = normalizeAppSettings({
      ...initial,
      ...patch,
      provider: {
        ...initial.provider,
        ...(patch.provider ?? {})
      },
      agents: patch.agents
        ? {
            ...initial.agents,
            ...patch.agents,
            kun: {
              ...initial.agents.kun,
              ...(patch.agents.kun ?? {})
            }
          }
        : initial.agents
    } as AppSettingsV1)
    const runtime = resolveKunRuntimeSettings(next)
    const sglangProvider = next.provider.providers.find((provider) =>
      provider.id === SGLANG_MODEL_PROVIDER_ID
    )

    expect(next.agents.kun.providerId).toBe(SGLANG_MODEL_PROVIDER_ID)
    expect(next.agents.kun.model).toBe(DEFAULT_SGLANG_MODEL)
    expect(sglangProvider).toMatchObject({
      authType: 'none',
      apiKey: '',
      baseUrl: DEFAULT_SGLANG_BASE_URL,
      codexAuthPath: '',
      models: [DEFAULT_SGLANG_MODEL]
    })
    expect(runtime.modelProviderAuthType).toBe('none')
    expect(runtime.apiKey).toBe('')
    expect(runtime.baseUrl).toBe(DEFAULT_SGLANG_BASE_URL)
  })

  it('can still select local Gemma through Ollama without an API key', () => {
    const initial = settings()
    const patch = buildInitialSetupProviderPatch(initial, 'none', OLLAMA_MODEL_PROVIDER_ID)
    const next = normalizeAppSettings({
      ...initial,
      ...patch,
      provider: {
        ...initial.provider,
        ...(patch.provider ?? {})
      },
      agents: patch.agents
        ? {
            ...initial.agents,
            ...patch.agents,
            kun: {
              ...initial.agents.kun,
              ...(patch.agents.kun ?? {})
            }
          }
        : initial.agents
    } as AppSettingsV1)
    const runtime = resolveKunRuntimeSettings(next)
    const ollamaProvider = next.provider.providers.find((provider) =>
      provider.id === OLLAMA_MODEL_PROVIDER_ID
    )

    expect(next.agents.kun.providerId).toBe(OLLAMA_MODEL_PROVIDER_ID)
    expect(next.agents.kun.model).toBe(DEFAULT_OLLAMA_MODEL)
    expect(ollamaProvider).toMatchObject({
      authType: 'none',
      apiKey: '',
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      codexAuthPath: '',
      models: [DEFAULT_OLLAMA_MODEL]
    })
    expect(runtime.modelProviderAuthType).toBe('none')
    expect(runtime.apiKey).toBe('')
    expect(runtime.baseUrl).toBe(DEFAULT_OLLAMA_BASE_URL)
  })
})
