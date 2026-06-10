import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { markdownLivePreviewTestInternals } from './markdown-live-preview'

describe('markdown live preview', () => {
  it('keeps markdown concealment stable while text is selected', () => {
    const state = EditorState.create({
      doc: '**Bold** text',
      selection: EditorSelection.range(2, 6)
    })

    const lines = markdownLivePreviewTestInternals.collectRevealLinesFromState(state, true)

    expect(lines.size).toBe(0)
  })

  it('reveals source marks on the caret line only when the editor is focused', () => {
    const state = EditorState.create({
      doc: '**Bold** text',
      selection: EditorSelection.cursor(4)
    })

    const focusedLines = markdownLivePreviewTestInternals.collectRevealLinesFromState(state, true)
    const blurredLines = markdownLivePreviewTestInternals.collectRevealLinesFromState(state, false)

    expect([...focusedLines]).toEqual([1])
    expect(blurredLines.size).toBe(0)
  })

  it('does not treat a visible closing fence as a new code block opener', () => {
    const state = EditorState.create({
      doc: [
        '```python',
        'python("hello world")',
        '```',
        '',
        '아',
        'nihao'
      ].join('\n')
    })
    const closingFence = state.doc.line(3)

    const ranges = markdownLivePreviewTestInternals.collectMarkdownCodeBlockRangesFromState(
      state,
      closingFence.from,
      state.doc.length,
      new Set()
    )

    expect(ranges).toHaveLength(1)
    expect(ranges[0]).toMatchObject({
      from: state.doc.line(1).from,
      to: closingFence.to,
      block: {
        language: 'python',
        code: 'python("hello world")'
      }
    })
  })

  it('does not leak code block ranges into following prose', () => {
    const state = EditorState.create({
      doc: [
        '```python',
        'python("hello world")',
        '```',
        '',
        '아',
        'nihao'
      ].join('\n')
    })
    const proseLine = state.doc.line(5)

    const ranges = markdownLivePreviewTestInternals.collectMarkdownCodeBlockRangesFromState(
      state,
      proseLine.from,
      state.doc.length,
      new Set()
    )

    expect(ranges).toHaveLength(0)
  })

  it('keeps prose between adjacent language-less fences out of code blocks', () => {
    const state = EditorState.create({
      doc: [
        '현대 텍스트 보완은 대부분 **자기회귀 언어 모델**에 기반합니다.',
        '',
        '```',
        'P(w1, w2, ..., wn) = ∏ P(wt | w1, w2, ..., wt-1)',
        '```',
        '',
        '안녕하세요',
        '',
        '```',
        '입력: [나] [는] [딥] [러] [닝] [을] [좋아한다]',
        '마스크: 1 0 0 0 0 0 0',
        '```'
      ].join('\n')
    })
    const firstClosingFence = state.doc.line(5)

    const ranges = markdownLivePreviewTestInternals.collectMarkdownCodeBlockRangesFromState(
      state,
      firstClosingFence.from,
      state.doc.length,
      new Set()
    )

    expect(ranges).toHaveLength(2)
    expect(ranges.map((range) => range.block)).toEqual([
      {
        language: '',
        code: 'P(w1, w2, ..., wn) = ∏ P(wt | w1, w2, ..., wt-1)'
      },
      {
        language: '',
        code: '입력: [나] [는] [딥] [러] [닝] [을] [좋아한다]\n마스크: 1 0 0 0 0 0 0'
      }
    ])
  })
})
