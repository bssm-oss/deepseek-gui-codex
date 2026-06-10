import { describe, expect, it } from 'vitest'
import { OutputAccumulator } from '../src/adapters/tool/output-accumulator.js'

function createAccumulator(): OutputAccumulator {
  return new OutputAccumulator({
    maxLines: 200,
    maxBytes: 20_000,
    tempFilePrefix: 'kun-output-test'
  })
}

describe('OutputAccumulator', () => {
  it('decodes UTF-8 command output', () => {
    const output = createAccumulator()

    output.append(Buffer.from('hello\n세계', 'utf8'))
    output.finish()

    expect(output.snapshot().content).toBe('hello\n세계')
  })

  it('decodes UTF-16LE command output from Windows PowerShell pipes', () => {
    const output = createAccumulator()

    output.append(Buffer.from('Start-Process\r\n보기.html', 'utf16le'))
    output.finish()

    expect(output.snapshot().content).toBe('Start-Process\r\n보기.html')
  })

  it('decodes UTF-16LE command output without ASCII NUL bytes', () => {
    const output = createAccumulator()

    output.append(Buffer.from('테스트', 'utf16le'))
    output.finish()

    expect(output.snapshot().content).toBe('테스트')
  })
})
