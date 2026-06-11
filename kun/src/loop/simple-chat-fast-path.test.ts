import { describe, expect, it } from 'vitest'
import { shouldUseSimpleChatFastPath } from './agent-loop.js'

const base = {
  mode: 'agent' as const,
  hasGuiPlan: false,
  attachmentCount: 0,
  activeSkillCount: 0,
  hasActiveGoal: false,
  hasTodos: false
}

describe('shouldUseSimpleChatFastPath', () => {
  it('uses the no-tool fast path for short greetings and simple small talk', () => {
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕' })).toBe(true)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕, 한 문장으로 대답해줘.' })).toBe(true)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: 'hello briefly' })).toBe(true)
  })

  it('keeps tools available for task-like prompts and stateful turns', () => {
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: 'README를 읽고 요약해줘' })).toBe(false)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕', mode: 'plan' })).toBe(false)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕', hasActiveGoal: true })).toBe(false)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕', hasTodos: true })).toBe(false)
    expect(shouldUseSimpleChatFastPath({ ...base, prompt: '안녕', attachmentCount: 1 })).toBe(false)
  })
})
