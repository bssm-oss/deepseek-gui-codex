import {
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_MODEL_PROVIDER_ID,
  type AppSettingsV1,
  type KunRuntimeSettingsV1,
  type ModelProviderAuthTypeV1,
  type ModelProviderProfilePatchV1,
  type ModelProviderProfileV1,
  type ModelProviderSettingsPatchV1,
  type ModelProviderSettingsV1
} from './app-settings-types'
import { getKunRuntimeSettings } from './app-settings-kun'
import { normalizeDeepseekBaseUrl } from './app-settings-normalizers'
import { DEFAULT_COMPOSER_MODEL_IDS } from './default-composer-models'

const DEFAULT_MODEL_PROVIDER_NAME = 'DeepSeek'
const CODEX_OAUTH_MODEL_PROVIDER_NAME = 'Codex OAuth'
const CODEX_OAUTH_MODEL_IDS = [
  DEFAULT_CODEX_OAUTH_MODEL,
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark'
] as const

export function defaultModelProviderSettings(): ModelProviderSettingsV1 {
  const defaultProvider = defaultDeepseekProviderProfile('', DEFAULT_DEEPSEEK_BASE_URL)
  return {
    apiKey: defaultProvider.apiKey,
    baseUrl: defaultProvider.baseUrl,
    providers: [defaultProvider, defaultCodexOAuthProviderProfile()]
  }
}

export function normalizeModelProviderSettings(
  input: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  const defaults = defaultModelProviderSettings()
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : defaults.apiKey
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeDeepseekBaseUrl(input.baseUrl)
      : defaults.baseUrl
  const rawProviders = Array.isArray(input?.providers) ? input.providers : []
  const providersById = new Map<string, ModelProviderProfileV1>()
  const defaultProvider = defaultDeepseekProviderProfile(apiKey, baseUrl)
  providersById.set(defaultProvider.id, defaultProvider)
  providersById.set(CODEX_OAUTH_MODEL_PROVIDER_ID, defaultCodexOAuthProviderProfile())
  for (const rawProvider of rawProviders) {
    const provider = normalizeModelProviderProfile(rawProvider)
    if (!provider) continue
    providersById.set(provider.id, provider.id === DEFAULT_MODEL_PROVIDER_ID
      ? {
          ...defaultProvider,
          ...provider,
          apiKey,
          baseUrl
        }
      : provider)
  }
  const providers = [...providersById.values()]
  return {
    apiKey,
    baseUrl,
    providers
  }
}

export function mergeModelProviderSettings(
  current: ModelProviderSettingsV1,
  patch: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings({
    ...current,
    ...(patch ?? {})
  })
}

export function getModelProviderSettings(settings: AppSettingsV1): ModelProviderSettingsV1 {
  return normalizeModelProviderSettings((settings as { provider?: ModelProviderSettingsPatchV1 }).provider)
}

export function modelProviderSettingsPatch(
  provider: ModelProviderSettingsPatchV1 | undefined
): ModelProviderSettingsPatchV1 {
  return provider ? { ...provider } : {}
}

export function resolveModelProviderApiKey(settings: AppSettingsV1): string {
  return getDefaultModelProviderProfile(settings).apiKey.trim()
}

export function resolveModelProviderBaseUrl(settings: AppSettingsV1): string {
  return normalizeDeepseekBaseUrl(getDefaultModelProviderProfile(settings).baseUrl)
}

export function getDefaultModelProviderProfile(settings: AppSettingsV1): ModelProviderProfileV1 {
  return getModelProviderProfile(settings, DEFAULT_MODEL_PROVIDER_ID)
}

export function getModelProviderProfile(
  settings: AppSettingsV1,
  providerId: string | undefined
): ModelProviderProfileV1 {
  const provider = getModelProviderSettings(settings)
  const id = normalizeProviderId(providerId || DEFAULT_MODEL_PROVIDER_ID)
  return provider.providers.find((profile) => profile.id === id) ?? provider.providers[0] ?? defaultDeepseekProviderProfile(provider.apiKey, provider.baseUrl)
}

export function listModelProviderModelIds(settings: AppSettingsV1): string[] {
  const ids = new Set<string>()
  for (const provider of getModelProviderSettings(settings).providers) {
    for (const model of provider.models) {
      const trimmed = model.trim()
      if (trimmed) ids.add(trimmed)
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

export function resolveKunRuntimeSettings(settings: AppSettingsV1): KunRuntimeSettingsV1 {
  const runtime = getKunRuntimeSettings(settings)
  const provider = getModelProviderProfile(settings, runtime.providerId)
  const runtimeApiKey = runtime.apiKey?.trim() ?? ''
  const runtimeBaseUrl = runtime.baseUrl?.trim() ?? ''
  const authType = runtimeApiKey ? 'api-key' : provider.authType
  const providerBaseUrl = provider.baseUrl.trim() || (
    authType === 'codex-oauth' ? DEFAULT_CODEX_OAUTH_BASE_URL : DEFAULT_DEEPSEEK_BASE_URL
  )

  return {
    ...runtime,
    modelProviderAuthType: authType,
    codexAuthPath: authType === 'codex-oauth'
      ? provider.codexAuthPath.trim() || DEFAULT_CODEX_AUTH_PATH
      : '',
    apiKey: authType === 'api-key' ? runtimeApiKey || provider.apiKey.trim() : '',
    baseUrl:
      runtimeBaseUrl && runtimeBaseUrl !== DEFAULT_DEEPSEEK_BASE_URL
        ? normalizeProviderBaseUrl(runtimeBaseUrl, authType)
        : normalizeProviderBaseUrl(providerBaseUrl, authType)
  }
}

function defaultDeepseekProviderProfile(apiKey: string, baseUrl: string): ModelProviderProfileV1 {
  return {
    id: DEFAULT_MODEL_PROVIDER_ID,
    name: DEFAULT_MODEL_PROVIDER_NAME,
    authType: 'api-key',
    apiKey: apiKey.trim(),
    baseUrl: normalizeDeepseekBaseUrl(baseUrl),
    codexAuthPath: '',
    models: DEFAULT_COMPOSER_MODEL_IDS.filter((id) => id !== 'auto')
  }
}

function defaultCodexOAuthProviderProfile(): ModelProviderProfileV1 {
  return {
    id: CODEX_OAUTH_MODEL_PROVIDER_ID,
    name: CODEX_OAUTH_MODEL_PROVIDER_NAME,
    authType: 'codex-oauth',
    apiKey: '',
    baseUrl: DEFAULT_CODEX_OAUTH_BASE_URL,
    codexAuthPath: DEFAULT_CODEX_AUTH_PATH,
    models: [...CODEX_OAUTH_MODEL_IDS]
  }
}

function normalizeModelProviderProfile(
  input: ModelProviderProfilePatchV1 | undefined
): ModelProviderProfileV1 | null {
  const id = normalizeProviderId(input?.id)
  if (!id) return null
  const name = typeof input?.name === 'string' && input.name.trim() ? input.name.trim() : id
  const authType = normalizeProviderAuthType(input?.authType, id)
  const baseUrl =
    typeof input?.baseUrl === 'string' && input.baseUrl.trim()
      ? normalizeProviderBaseUrl(input.baseUrl, authType)
      : authType === 'codex-oauth'
        ? DEFAULT_CODEX_OAUTH_BASE_URL
        : DEFAULT_DEEPSEEK_BASE_URL
  const models = normalizeProviderModels(input?.models)
  return {
    id,
    name,
    authType,
    apiKey: authType === 'api-key' && typeof input?.apiKey === 'string' ? input.apiKey.trim() : '',
    baseUrl,
    codexAuthPath: authType === 'codex-oauth'
      ? typeof input?.codexAuthPath === 'string' && input.codexAuthPath.trim()
        ? input.codexAuthPath.trim()
        : DEFAULT_CODEX_AUTH_PATH
      : '',
    models: models.length > 0
      ? models
      : authType === 'codex-oauth'
        ? [...CODEX_OAUTH_MODEL_IDS]
        : []
  }
}

function normalizeProviderAuthType(value: unknown, id: string): ModelProviderAuthTypeV1 {
  if (value === 'codex-oauth') return 'codex-oauth'
  if (id === CODEX_OAUTH_MODEL_PROVIDER_ID) return 'codex-oauth'
  return 'api-key'
}

function normalizeProviderBaseUrl(baseUrl: string, authType: ModelProviderAuthTypeV1): string {
  if (authType === 'codex-oauth') {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    return trimmed || DEFAULT_CODEX_OAUTH_BASE_URL
  }
  return normalizeDeepseekBaseUrl(baseUrl)
}

function normalizeProviderModels(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const ids = new Set<string>()
  for (const model of models) {
    if (typeof model !== 'string') continue
    const trimmed = model.trim()
    if (trimmed) ids.add(trimmed)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function normalizeProviderId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    : ''
}
