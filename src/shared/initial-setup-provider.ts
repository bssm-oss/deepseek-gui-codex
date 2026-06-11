import {
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_KUN_MODEL,
  DEFAULT_MODEL_PROVIDER_ID,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_SGLANG_BASE_URL,
  DEFAULT_SGLANG_MODEL,
  OLLAMA_MODEL_PROVIDER_ID,
  SGLANG_MODEL_PROVIDER_ID,
  type AppSettingsPatch,
  type AppSettingsV1,
  type ModelProviderAuthTypeV1,
  type ModelProviderProfileV1
} from './app-settings-types'
import { getModelProviderSettings } from './app-settings-provider'

function withCodexOAuthDefaults(provider: ModelProviderProfileV1): ModelProviderProfileV1 {
  return {
    ...provider,
    authType: 'codex-oauth',
    apiKey: '',
    baseUrl: provider.baseUrl.trim() || DEFAULT_CODEX_OAUTH_BASE_URL,
    codexAuthPath: provider.codexAuthPath.trim() || DEFAULT_CODEX_AUTH_PATH,
    models: provider.models.length > 0 ? provider.models : [DEFAULT_CODEX_OAUTH_MODEL]
  }
}

function withDeepSeekDefaults(provider: ModelProviderProfileV1): ModelProviderProfileV1 {
  return {
    ...provider,
    authType: 'api-key',
    baseUrl: provider.baseUrl.trim() || DEFAULT_DEEPSEEK_BASE_URL,
    codexAuthPath: ''
  }
}

function withOllamaDefaults(provider: ModelProviderProfileV1): ModelProviderProfileV1 {
  return {
    ...provider,
    authType: 'none',
    apiKey: '',
    baseUrl: provider.baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL,
    codexAuthPath: '',
    models: provider.models.length > 0 ? provider.models : [DEFAULT_OLLAMA_MODEL]
  }
}

function withSglangDefaults(provider: ModelProviderProfileV1): ModelProviderProfileV1 {
  return {
    ...provider,
    authType: 'none',
    apiKey: '',
    baseUrl: provider.baseUrl.trim() || DEFAULT_SGLANG_BASE_URL,
    codexAuthPath: '',
    models: provider.models.length > 0 ? provider.models : [DEFAULT_SGLANG_MODEL]
  }
}

function selectedProviderIdForInitialSetup(
  authType: ModelProviderAuthTypeV1,
  preferredProviderId?: string
): string {
  if (authType === 'codex-oauth') return CODEX_OAUTH_MODEL_PROVIDER_ID
  if (authType === 'api-key') return DEFAULT_MODEL_PROVIDER_ID
  if (preferredProviderId === OLLAMA_MODEL_PROVIDER_ID) return OLLAMA_MODEL_PROVIDER_ID
  return SGLANG_MODEL_PROVIDER_ID
}

function defaultNoAuthModelForProvider(providerId: string): string {
  return providerId === OLLAMA_MODEL_PROVIDER_ID ? DEFAULT_OLLAMA_MODEL : DEFAULT_SGLANG_MODEL
}

export function buildInitialSetupProviderPatch(
  settings: AppSettingsV1,
  authType: ModelProviderAuthTypeV1,
  preferredProviderId?: string
): AppSettingsPatch {
  const providerSettings = getModelProviderSettings(settings)
  const selectedProviderId = selectedProviderIdForInitialSetup(authType, preferredProviderId)
  const providers = providerSettings.providers.map((provider) => {
    if (provider.id === CODEX_OAUTH_MODEL_PROVIDER_ID) {
      return authType === 'codex-oauth' ? withCodexOAuthDefaults(provider) : provider
    }
    if (provider.id === DEFAULT_MODEL_PROVIDER_ID) {
      return authType === 'api-key' ? withDeepSeekDefaults(provider) : provider
    }
    if (provider.id === SGLANG_MODEL_PROVIDER_ID) {
      return authType === 'none' && selectedProviderId === SGLANG_MODEL_PROVIDER_ID
        ? withSglangDefaults(provider)
        : provider
    }
    if (provider.id === OLLAMA_MODEL_PROVIDER_ID) {
      return authType === 'none' && selectedProviderId === OLLAMA_MODEL_PROVIDER_ID
        ? withOllamaDefaults(provider)
        : provider
    }
    return provider
  })
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId)
  const defaultProvider = providers.find((provider) => provider.id === DEFAULT_MODEL_PROVIDER_ID)
  const defaultNoAuthModel = defaultNoAuthModelForProvider(selectedProviderId)

  return {
    provider: {
      apiKey: defaultProvider?.apiKey ?? providerSettings.apiKey,
      baseUrl: defaultProvider?.baseUrl ?? providerSettings.baseUrl,
      providers
    },
    agents: {
      kun: {
        ...settings.agents.kun,
        apiKey: '',
        baseUrl: '',
        providerId: selectedProviderId,
        model:
          authType === 'codex-oauth'
            ? selectedProvider?.models.includes(DEFAULT_CODEX_OAUTH_MODEL)
              ? DEFAULT_CODEX_OAUTH_MODEL
              : selectedProvider?.models[0] ?? DEFAULT_CODEX_OAUTH_MODEL
            : authType === 'none'
              ? selectedProvider?.models.includes(defaultNoAuthModel)
                ? defaultNoAuthModel
                : selectedProvider?.models[0] ?? defaultNoAuthModel
              : DEFAULT_KUN_MODEL,
        modelProviderAuthType: authType,
        codexAuthPath: authType === 'codex-oauth'
          ? selectedProvider?.codexAuthPath.trim() || DEFAULT_CODEX_AUTH_PATH
          : ''
      }
    }
  }
}
