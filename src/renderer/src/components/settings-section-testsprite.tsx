import { useState, type ReactElement } from 'react'
import {
  DEFAULT_TESTSPRITE_MCP_ARGS,
  DEFAULT_TESTSPRITE_MCP_COMMAND,
  DEFAULT_TESTSPRITE_TIMEOUT_MS,
  TESTSPRITE_DOCS_URL,
  normalizeTestSpriteSettings
} from '@shared/app-settings'
import { ExternalLink, RotateCcw } from 'lucide-react'
import {
  InlineNoticeView,
  SecretInput,
  SettingsCard,
  SettingRow,
  Toggle
} from './settings-controls'

export function TestSpriteSettingsSection({ ctx }: { ctx: Record<string, any> }): ReactElement {
  const {
    t,
    form,
    update,
    selectControlClass,
    splitSettingsList,
    listSettingsText
  } = ctx
  const [showApiKey, setShowApiKey] = useState(false)
  const testSprite = normalizeTestSpriteSettings(form.testSprite)
  const configured = testSprite.enabled && testSprite.apiKey.trim().length > 0
  const apiKeyLooksValid =
    !testSprite.apiKey.trim() || testSprite.apiKey.trim().startsWith('sk-user-')
  const argsText = listSettingsText(testSprite.args)

  const updateTestSprite = (patch: Partial<typeof testSprite>): void => {
    update({ testSprite: patch })
  }

  const resetMcpCommand = (): void => {
    updateTestSprite({
      command: DEFAULT_TESTSPRITE_MCP_COMMAND,
      args: [...DEFAULT_TESTSPRITE_MCP_ARGS],
      timeoutMs: DEFAULT_TESTSPRITE_TIMEOUT_MS
    })
  }

  const openDocs = (): void => {
    if (typeof window.dsGui?.openExternal === 'function') {
      void window.dsGui.openExternal(TESTSPRITE_DOCS_URL)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard title={t('testSpriteSection')}>
        <SettingRow
          title={t('testSpriteEnabled')}
          description={t('testSpriteEnabledDesc')}
          control={
            <div className="flex items-center justify-between gap-3">
              <span
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${
                  configured
                    ? 'border-emerald-400/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200'
                    : 'border-ds-border bg-ds-main/60 text-ds-muted'
                }`}
              >
                {configured ? t('testSpriteConfigured') : t('testSpriteNotConfigured')}
              </span>
              <Toggle
                checked={testSprite.enabled}
                onChange={(enabled) => updateTestSprite({ enabled })}
              />
            </div>
          }
        />
        <SettingRow
          title={t('testSpriteApiKey')}
          description={t('testSpriteApiKeyDesc')}
          wideControl
          control={
            <div className="space-y-2">
              <SecretInput
                value={testSprite.apiKey}
                onChange={(apiKey) => updateTestSprite({ apiKey })}
                visible={showApiKey}
                onToggleVisibility={() => setShowApiKey((value) => !value)}
                placeholder={t('testSpriteApiKeyPlaceholder')}
                autoComplete="off"
                invalid={testSprite.enabled && !apiKeyLooksValid}
                showLabel={t('showSecret')}
                hideLabel={t('hideSecret')}
              />
              {testSprite.enabled && !apiKeyLooksValid ? (
                <InlineNoticeView
                  notice={{
                    tone: 'info',
                    message: t('testSpriteApiKeyFormatHint')
                  }}
                />
              ) : null}
            </div>
          }
        />
        <SettingRow
          title={t('testSpritePromptPrefix')}
          description={t('testSpritePromptPrefixDesc')}
          wideControl
          control={
            <textarea
              value={testSprite.promptPrefix}
              onChange={(event) => updateTestSprite({ promptPrefix: event.target.value })}
              rows={5}
              className={`${selectControlClass} resize-y leading-6`}
              placeholder={t('testSpritePromptPrefixPlaceholder')}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title={t('testSpriteMcpSection')}>
        <SettingRow
          title={t('testSpriteCommand')}
          description={t('testSpriteCommandDesc')}
          control={
            <input
              className={selectControlClass}
              value={testSprite.command}
              onChange={(event) => updateTestSprite({ command: event.target.value })}
              placeholder={DEFAULT_TESTSPRITE_MCP_COMMAND}
            />
          }
        />
        <SettingRow
          title={t('testSpriteArgs')}
          description={t('testSpriteArgsDesc')}
          wideControl
          control={
            <textarea
              className={`${selectControlClass} min-h-[96px] resize-y font-mono leading-6`}
              value={argsText}
              onChange={(event) => updateTestSprite({ args: splitSettingsList(event.target.value) })}
              spellCheck={false}
            />
          }
        />
        <SettingRow
          title={t('testSpriteTimeout')}
          description={t('testSpriteTimeoutDesc')}
          control={
            <input
              className={selectControlClass}
              type="number"
              min={5000}
              max={600000}
              step={5000}
              value={testSprite.timeoutMs}
              onChange={(event) => updateTestSprite({ timeoutMs: Number(event.target.value) })}
            />
          }
        />
        <SettingRow
          title={t('testSpriteMcpPreview')}
          description={t('testSpriteMcpPreviewDesc')}
          wideControl
          control={
            <div className="space-y-3">
              <pre className="overflow-x-auto rounded-xl border border-ds-border bg-ds-main/75 px-3 py-2.5 text-[12px] leading-5 text-ds-muted">
                {`${testSprite.command} ${testSprite.args.join(' ')}`}
              </pre>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={resetMcpCommand}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ds-border bg-ds-card px-3 py-1.5 text-[12px] font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover hover:text-ds-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {t('testSpriteResetCommand')}
                </button>
                <button
                  type="button"
                  onClick={openDocs}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ds-border bg-ds-card px-3 py-1.5 text-[12px] font-medium text-ds-muted shadow-sm transition hover:bg-ds-hover hover:text-ds-ink"
                >
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {t('testSpriteDocs')}
                </button>
              </div>
            </div>
          }
        />
      </SettingsCard>
    </div>
  )
}
