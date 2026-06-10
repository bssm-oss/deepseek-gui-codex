import type { WriteEditorSelectionState } from '../components/write/WriteMarkdownEditor'

export const WRITE_QUOTE_ORIGINAL_START = '[인용 원문]'
export const WRITE_QUOTE_ORIGINAL_END = '[/인용 원문]'
export const WRITE_CONTEXT_HEADING = '[쓰기 컨텍스트]'
export const WRITE_QUOTE_HEADING = '[인용 조각]'

const WRITE_ASSISTANT_INTERACTION_RULE =
  '상호작용 제한: 현재 GUI는 request_user_input의 HTTP 응답을 제출할 수 없습니다. 추가 정보가 필요하면 request_user_input을 호출하지 말고 일반 텍스트로 사용자에게 질문하세요.'

export type WriteQuotedSelection = {
  id: string
  text: string
  sourceTitle: string
  sourceFilePath: string
  lineStart?: number
  lineEnd?: number
  charCount: number
  createdAt: string
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '')
}

function basenameFromPath(value: string): string {
  const normalized = normalizePath(value)
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

export function relativeWritePath(workspaceRoot: string, filePath: string): string {
  const root = normalizePath(workspaceRoot)
  const file = normalizePath(filePath)
  const prefix = `${root}/`
  if (root && file.startsWith(prefix)) return file.slice(prefix.length)
  return basenameFromPath(filePath)
}

export function quotedSelectionFromEditor(
  selection: WriteEditorSelectionState,
  filePath: string,
  workspaceRoot: string,
  now = Date.now()
): WriteQuotedSelection | null {
  const text = selection.text.trim()
  if (!text || selection.charCount <= 0) return null
  const first = selection.ranges[0]
  const last = selection.ranges[selection.ranges.length - 1]
  return {
    id: `quote-${now}-${Math.random().toString(36).slice(2)}`,
    text,
    sourceTitle: relativeWritePath(workspaceRoot, filePath),
    sourceFilePath: filePath,
    ...(first ? { lineStart: first.startLine } : {}),
    ...(last ? { lineEnd: last.endLine } : {}),
    charCount: selection.charCount,
    createdAt: new Date(now).toISOString()
  }
}

export function formatWriteQuotedSelectionForPrompt(selection: WriteQuotedSelection): string {
  if (selection.lineStart != null && selection.lineEnd != null) {
    return [
      `[인용 조각] ${selection.sourceTitle}(라인 ${selection.lineStart}-${selection.lineEnd}, ${selection.charCount}자) 경로: ${selection.sourceFilePath}`,
      WRITE_QUOTE_ORIGINAL_START,
      selection.text,
      WRITE_QUOTE_ORIGINAL_END
    ].join('\n')
  }
  return [
    `[인용 조각] ${selection.sourceTitle}(${selection.charCount}자) 경로: ${selection.sourceFilePath}`,
    WRITE_QUOTE_ORIGINAL_START,
    selection.text,
    WRITE_QUOTE_ORIGINAL_END
  ].join('\n')
}

type WritePromptContext = {
  workspaceRoot?: string
  activeFilePath?: string | null
}

export type WritePromptDisplayContext = {
  workspaceRoot?: string
  activeFile?: string
  lines: string[]
}

export type WritePromptDisplayQuote = {
  sourceTitle: string
  sourceFilePath?: string
  lineStart?: number
  lineEnd?: number
  charCount?: number
  text: string
}

export type WritePromptDisplay = {
  userInput: string
  context: WritePromptDisplayContext | null
  quotes: WritePromptDisplayQuote[]
}

export function composeWritePrompt(
  input: string,
  selections: WriteQuotedSelection[],
  context: WritePromptContext = {}
): string {
  const body = input.trim()
  const contextLines: string[] = []
  contextLines.push(WRITE_ASSISTANT_INTERACTION_RULE)
  if (context.workspaceRoot?.trim()) {
    contextLines.push(`작업공간: ${context.workspaceRoot.trim()}`)
  }
  if (context.activeFilePath?.trim()) {
    contextLines.push(`현재 파일: ${relativeWritePath(context.workspaceRoot ?? '', context.activeFilePath)}`)
  }
  const contextText = contextLines.length > 0
    ? `${WRITE_CONTEXT_HEADING}\n${contextLines.join('\n')}`
    : ''
  const quoteText = selections.map(formatWriteQuotedSelectionForPrompt).join('\n\n')
  return [contextText, quoteText, body].filter(Boolean).join('\n\n')
}

function parseContextBlock(text: string): WritePromptDisplayContext {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  let workspaceRoot: string | undefined
  let activeFile: string | undefined

  for (const line of lines) {
    const workspaceMatch = line.match(/^작업공간:\s*(.+)$/)
    if (workspaceMatch?.[1]) {
      workspaceRoot = workspaceMatch[1].trim()
      continue
    }
    const fileMatch = line.match(/^현재 파일:\s*(.+)$/)
    if (fileMatch?.[1]) {
      activeFile = fileMatch[1].trim()
    }
  }

  return {
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(activeFile ? { activeFile } : {}),
    lines
  }
}

function splitFirstSection(text: string): { head: string; rest: string } {
  const separator = text.search(/\n{2,}/)
  if (separator < 0) return { head: text.trim(), rest: '' }
  return {
    head: text.slice(0, separator).trim(),
    rest: text.slice(separator).trimStart()
  }
}

function parseQuoteHeader(header: string): Omit<WritePromptDisplayQuote, 'text'> {
  const body = header.replace(WRITE_QUOTE_HEADING, '').trim()
  const pathSplit = body.match(/^(.*?)\s*경로:\s*(.+)$/)
  const titleAndMeta = (pathSplit?.[1] ?? body).trim()
  const sourceFilePath = pathSplit?.[2]?.trim()
  const metaMatch = titleAndMeta.match(/^(.*?)(?:\(라인\s*(\d+)[-–—](\d+),\s*(\d+)자\)|\((\d+)자\))$/)
  const sourceTitle = (metaMatch?.[1] ?? titleAndMeta).trim()
  const lineStart = metaMatch?.[2] ? Number.parseInt(metaMatch[2], 10) : undefined
  const lineEnd = metaMatch?.[3] ? Number.parseInt(metaMatch[3], 10) : undefined
  const charCountText = metaMatch?.[4] ?? metaMatch?.[5]
  const charCount = charCountText ? Number.parseInt(charCountText, 10) : undefined

  return {
    sourceTitle,
    ...(sourceFilePath ? { sourceFilePath } : {}),
    ...(Number.isFinite(lineStart) ? { lineStart } : {}),
    ...(Number.isFinite(lineEnd) ? { lineEnd } : {}),
    ...(Number.isFinite(charCount) ? { charCount } : {})
  }
}

function consumeQuoteSection(text: string): { quote: WritePromptDisplayQuote | null; rest: string } {
  if (!text.startsWith(WRITE_QUOTE_HEADING)) return { quote: null, rest: text }
  const firstLineEnd = text.indexOf('\n')
  if (firstLineEnd < 0) return { quote: null, rest: text }

  const header = text.slice(0, firstLineEnd).trim()
  let rest = text.slice(firstLineEnd + 1).trimStart()
  if (!rest.startsWith(WRITE_QUOTE_ORIGINAL_START)) {
    return { quote: null, rest: text }
  }

  rest = rest.slice(WRITE_QUOTE_ORIGINAL_START.length).trimStart()
  const originalEnd = rest.indexOf(WRITE_QUOTE_ORIGINAL_END)
  if (originalEnd < 0) return { quote: null, rest: text }

  const quotedText = rest.slice(0, originalEnd).trim()
  const afterQuote = rest.slice(originalEnd + WRITE_QUOTE_ORIGINAL_END.length).trimStart()
  return {
    quote: {
      ...parseQuoteHeader(header),
      text: quotedText
    },
    rest: afterQuote
  }
}

export function parseWritePromptForDisplay(text: string): WritePromptDisplay | null {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized.includes(WRITE_CONTEXT_HEADING) && !normalized.includes(WRITE_QUOTE_HEADING)) {
    return null
  }

  let rest = normalized
  let context: WritePromptDisplayContext | null = null
  const quotes: WritePromptDisplayQuote[] = []

  if (rest.startsWith(WRITE_CONTEXT_HEADING)) {
    rest = rest.slice(WRITE_CONTEXT_HEADING.length).trimStart()
    const contextSection = splitFirstSection(rest)
    context = parseContextBlock(contextSection.head)
    rest = contextSection.rest
  }

  while (rest.startsWith(WRITE_QUOTE_HEADING)) {
    const consumed = consumeQuoteSection(rest)
    if (!consumed.quote) break
    quotes.push(consumed.quote)
    rest = consumed.rest
  }

  if (!context && quotes.length === 0) return null

  return {
    userInput: rest.trim(),
    context,
    quotes
  }
}
