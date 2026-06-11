import {
  CODEX_OAUTH_MODEL_PROVIDER_ID,
  DEFAULT_CODEX_AUTH_PATH,
  DEFAULT_CODEX_OAUTH_BASE_URL,
  DEFAULT_CODEX_OAUTH_MODEL,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_KUN_MODEL,
  DEFAULT_KUN_MODEL_PROVIDER_ID,
  DEFAULT_KUN_PROVIDER_MODEL,
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
const CODEX_OAUTH_MODEL_PROVIDER_NAME = 'ChatGPT'
const MLX_LM_MODEL_PROVIDER_NAME = 'Turbo Engine: MLX-LM'
const SGLANG_MODEL_PROVIDER_NAME = 'Turbo Engine: SGLang'
const OLLAMA_MODEL_PROVIDER_NAME = 'Gemma (Ollama)'
const CODEX_OAUTH_MODEL_IDS = [
  DEFAULT_CODEX_OAUTH_MODEL,
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark'
] as const

export function defaultModelProviderSettings(): ModelProviderSettingsV1 {
  const deepseekProvider = defaultDeepseekProviderProfile('', DEFAULT_DEEPSEEK_BASE_URL)
  return {
    apiKey: deepseekProvider.apiKey,
    baseUrl: deepseekProvider.baseUrl,
    providers: [
      defaultMlxLmProviderProfile(),
      defaultSglangProviderProfile(),
      defaultOllamaProviderProfile(),
      deepseekProvider,
      defaultCodexOAuthProviderProfile()
    ]
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
  providersById.set(MLX_LM_MODEL_PROVIDER_ID, defaultMlxLmProviderProfile())
  providersById.set(SGLANG_MODEL_PROVIDER_ID, defaultSglangProviderProfile())
  providersById.set(OLLAMA_MODEL_PROVIDER_ID, defaultOllamaProviderProfile())
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
  const id = normalizeProviderId(providerId || DEFAULT_KUN_MODEL_PROVIDER_ID)
  return provider.providers.find((profile) => profile.id === id) ?? provider.providers[0] ?? defaultDeepseekProviderProfile(provider.apiKey, provider.baseUrl)
}

export function defaultModelForProviderProfile(
  profile: ModelProviderProfileV1 | undefined
): string {
  if (!profile) return DEFAULT_KUN_PROVIDER_MODEL
  if (profile.id === CODEX_OAUTH_MODEL_PROVIDER_ID) {
    return profile.models.includes(DEFAULT_CODEX_OAUTH_MODEL)
      ? DEFAULT_CODEX_OAUTH_MODEL
      : profile.models[0] ?? DEFAULT_CODEX_OAUTH_MODEL
  }
  if (profile.id === MLX_LM_MODEL_PROVIDER_ID) {
    return profile.models.includes(DEFAULT_MLX_LM_MODEL)
      ? DEFAULT_MLX_LM_MODEL
      : profile.models[0] ?? DEFAULT_MLX_LM_MODEL
  }
  if (profile.id === SGLANG_MODEL_PROVIDER_ID) {
    return profile.models.includes(DEFAULT_SGLANG_MODEL)
      ? DEFAULT_SGLANG_MODEL
      : profile.models[0] ?? DEFAULT_SGLANG_MODEL
  }
  if (profile.id === OLLAMA_MODEL_PROVIDER_ID) {
    return profile.models.includes(DEFAULT_OLLAMA_MODEL)
      ? DEFAULT_OLLAMA_MODEL
      : profile.models[0] ?? DEFAULT_OLLAMA_MODEL
  }
  if (profile.id === DEFAULT_MODEL_PROVIDER_ID) return DEFAULT_KUN_MODEL
  return profile.models[0] ?? DEFAULT_KUN_PROVIDER_MODEL
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
    authType === 'codex-oauth'
      ? DEFAULT_CODEX_OAUTH_BASE_URL
      : authType === 'none'
        ? defaultNoAuthProviderBaseUrl(provider.id)
        : DEFAULT_DEEPSEEK_BASE_URL
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
        ? normalizeProviderBaseUrl(runtimeBaseUrl, authType, provider.id)
        : normalizeProviderBaseUrl(providerBaseUrl, authType, provider.id)
  }
}

export function hasKunRuntimeModelCredentials(
  settings: AppSettingsV1,
  fallbackApiKey = ''
): boolean {
  const runtime = resolveKunRuntimeSettings(settings)
  if (runtime.modelProviderAuthType === 'codex-oauth') {
    return Boolean(runtime.codexAuthPath.trim())
  }
  if (runtime.modelProviderAuthType === 'none') {
    return Boolean(runtime.baseUrl.trim())
  }
  return Boolean(runtime.apiKey.trim() || fallbackApiKey.trim())
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

function defaultMlxLmProviderProfile(): ModelProviderProfileV1 {
  return {
    id: MLX_LM_MODEL_PROVIDER_ID,
    name: MLX_LM_MODEL_PROVIDER_NAME,
    authType: 'none',
    apiKey: '',
    baseUrl: DEFAULT_MLX_LM_BASE_URL,
    codexAuthPath: '',
    models: [DEFAULT_MLX_LM_MODEL]
  }
}

function defaultSglangProviderProfile(): ModelProviderProfileV1 {
  return {
    id: SGLANG_MODEL_PROVIDER_ID,
    name: SGLANG_MODEL_PROVIDER_NAME,
    authType: 'none',
    apiKey: '',
    baseUrl: DEFAULT_SGLANG_BASE_URL,
    codexAuthPath: '',
    models: [DEFAULT_SGLANG_MODEL]
  }
}

function defaultOllamaProviderProfile(): ModelProviderProfileV1 {
  return {
    id: OLLAMA_MODEL_PROVIDER_ID,
    name: OLLAMA_MODEL_PROVIDER_NAME,
    authType: 'none',
    apiKey: '',
    baseUrl: DEFAULT_OLLAMA_BASE_URL,
    codexAuthPath: '',
    models: [DEFAULT_OLLAMA_MODEL]
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
      ? normalizeProviderBaseUrl(input.baseUrl, authType, id)
      : authType === 'codex-oauth'
        ? DEFAULT_CODEX_OAUTH_BASE_URL
        : authType === 'none'
          ? defaultNoAuthProviderBaseUrl(id)
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
        : authType === 'none'
          ? defaultNoAuthProviderModels(id)
          : []
  }
}

function normalizeProviderAuthType(value: unknown, id: string): ModelProviderAuthTypeV1 {
  if (value === 'codex-oauth') return 'codex-oauth'
  if (value === 'none') return 'none'
  if (id === CODEX_OAUTH_MODEL_PROVIDER_ID) return 'codex-oauth'
  if (id === MLX_LM_MODEL_PROVIDER_ID) return 'none'
  if (id === SGLANG_MODEL_PROVIDER_ID) return 'none'
  if (id === OLLAMA_MODEL_PROVIDER_ID) return 'none'
  return 'api-key'
}

function normalizeProviderBaseUrl(
  baseUrl: string,
  authType: ModelProviderAuthTypeV1,
  providerId: string
): string {
  if (authType === 'codex-oauth') {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    return trimmed || DEFAULT_CODEX_OAUTH_BASE_URL
  }
  if (authType === 'none') {
    const trimmed = baseUrl.trim().replace(/\/+$/, '')
    return trimmed || defaultNoAuthProviderBaseUrl(providerId)
  }
  return normalizeDeepseekBaseUrl(baseUrl)
}

function defaultNoAuthProviderBaseUrl(providerId: string): string {
  if (providerId === OLLAMA_MODEL_PROVIDER_ID) return DEFAULT_OLLAMA_BASE_URL
  if (providerId === SGLANG_MODEL_PROVIDER_ID) return DEFAULT_SGLANG_BASE_URL
  return DEFAULT_MLX_LM_BASE_URL
}

function defaultNoAuthProviderModels(providerId: string): string[] {
  if (providerId === OLLAMA_MODEL_PROVIDER_ID) return [DEFAULT_OLLAMA_MODEL]
  if (providerId === SGLANG_MODEL_PROVIDER_ID) return [DEFAULT_SGLANG_MODEL]
  return [DEFAULT_MLX_LM_MODEL]
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
