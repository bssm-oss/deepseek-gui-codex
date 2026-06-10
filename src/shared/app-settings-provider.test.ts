import { describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  hasKunRuntimeModelCredentials,
  resolveKunRuntimeSettings,
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  type AppSettingsV1
} from './app-settings'

function settings(): AppSettingsV1 {
  return {
    version: 1,
    locale: 'en',
    theme: 'system',
    uiFontScale: 'small',
    provider: {
      ...defaultModelProviderSettings(),
      providers: [
        ...defaultModelProviderSettings().providers,
        {
          id: 'custom',
          name: 'Custom Provider',
          authType: 'api-key',
          apiKey: 'sk-custom',
          baseUrl: 'https://custom.example/v1',
          codexAuthPath: '',
          models: ['custom-model']
        }
      ]
    },
    agents: {
      kun: {
        ...defaultKunRuntimeSettings(),
        providerId: 'custom',
        model: 'custom-model'
      }
    },
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

describe('model provider settings', () => {
  it('resolves Kun runtime credentials from the selected provider', () => {
    const runtime = resolveKunRuntimeSettings(settings())

    expect(runtime.apiKey).toBe('sk-custom')
    expect(runtime.baseUrl).toBe('https://custom.example/v1')
  })

  it('treats Codex OAuth as configured without a DeepSeek API key', () => {
    const next = settings()
    next.provider.apiKey = ''
    next.provider.baseUrl = 'https://api.deepseek.com'
    next.provider.providers = defaultModelProviderSettings().providers
    next.agents.kun = {
      ...defaultKunRuntimeSettings(),
      providerId: CODEX_OAUTH_MODEL_PROVIDER_ID,
      modelProviderAuthType: 'codex-oauth',
      codexAuthPath: '~/.codex/auth.json'
    }

    expect(hasKunRuntimeModelCredentials(next)).toBe(true)
  })
})
