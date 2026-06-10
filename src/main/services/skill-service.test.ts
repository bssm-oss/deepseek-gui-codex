import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  defaultClawSettings,
  defaultKeyboardShortcuts,
  defaultKunRuntimeSettings,
  defaultModelProviderSettings,
  defaultScheduleSettings,
  defaultWriteSettings,
  type AppSettingsV1
} from '../../shared/app-settings'
import { listGuiSkills } from './skill-service'

describe('skill-service', () => {
  let tempRoot = ''

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'gui-skills-'))
  })

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('discovers project Codex skills from the active workspace', async () => {
    const workspaceRoot = join(tempRoot, 'workspace')
    const skillRoot = join(workspaceRoot, '.codex', 'skills', 'openspec-apply-change')
    await mkdir(skillRoot, { recursive: true })
    await writeFile(join(skillRoot, 'SKILL.md'), [
      '---',
      'name: openspec-apply-change',
      'description: Implement tasks from an OpenSpec change.',
      '---',
      '',
      'Implement tasks from an OpenSpec change.'
    ].join('\n'), 'utf8')

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.skills).toContainEqual(expect.objectContaining({
      id: 'openspec-apply-change',
      name: 'Openspec Apply Change',
      description: 'Implement tasks from an OpenSpec change.',
      scope: 'project'
    }))
  })

  it('keeps legacy SKILL.md entries with Chinese frontmatter names distinct', async () => {
    const workspaceRoot = join(tempRoot, 'workspace-cn')
    const skillRoot = join(workspaceRoot, '.agents', 'skills')
    const tddRoot = join(skillRoot, 'tdd')
    const reviewRoot = join(skillRoot, 'code-review')
    await mkdir(tddRoot, { recursive: true })
    await mkdir(reviewRoot, { recursive: true })
    await writeFile(join(tddRoot, 'SKILL.md'), [
      '---',
      'name: 테스트 주도 개발(TDD)',
      'description: 실패 테스트를 먼저 쓰고 구현을 진행합니다.',
      '---',
      '',
      '# TDD',
      '',
      '먼저 실패 테스트를 작성한 뒤 구현합니다.'
    ].join('\n'), 'utf8')
    await writeFile(join(reviewRoot, 'SKILL.md'), [
      '---',
      'name: 코드 리뷰',
      'description: 회귀 위험을 점검합니다.',
      '---',
      '',
      '# Review',
      '',
      '정확성과 테스트에 집중합니다.'
    ].join('\n'), 'utf8')

    const result = await listGuiSkills(createSettings(workspaceRoot), workspaceRoot)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const projectSkills = result.skills.filter((skill) => skill.root.startsWith(skillRoot))
    expect(projectSkills).toHaveLength(2)
    expect(projectSkills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'tdd',
        name: '테스트 주도 개발(TDD)',
        description: '실패 테스트를 먼저 쓰고 구현을 진행합니다.'
      }),
      expect.objectContaining({
        id: 'code-review',
        name: '코드 리뷰',
        description: '회귀 위험을 점검합니다.'
      })
    ]))
    expect(projectSkills.map((skill) => skill.id)).not.toContain('skill')
  })

  function createSettings(workspaceRoot: string): AppSettingsV1 {
    return {
      version: 1,
      locale: 'en',
      theme: 'system',
      uiFontScale: 'small',
      provider: defaultModelProviderSettings(),
      agents: { kun: defaultKunRuntimeSettings() },
      workspaceRoot,
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
})
