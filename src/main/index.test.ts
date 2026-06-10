import { beforeEach, describe, expect, it, vi } from 'vitest'

// nativeImage is the unit under test; stub only the four methods createAppIcon uses.
const createFromBuffer = vi.fn()
const createFromPath = vi.fn()
const createFromDataURL = vi.fn()
const createEmpty = vi.fn()

vi.mock('electron', () => ({
  nativeImage: {
    createFromBuffer,
    createFromPath,
    createFromDataURL,
    createEmpty
  }
}))

// node:fs is stubbed too. vi.hoisted keeps the mock functions available before
// vi.mock factories run, so later assertions can control fsMock.readFileSync.
const fsMock = vi.hoisted(() => ({
  readFileSync: vi.fn()
}))

vi.mock('node:fs', () => fsMock)

// PNG signature: 89 50 4E 47 0D 0A 1A 0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

type AppIconModule = typeof import('./app-icon')

/**
 * electron-vite uses Rollup for main-process assets. ?url imports return paths
 * relative to the main bundle, such as 'chunks/deepseek-XXXX.png', in both dev
 * and packaged builds. The main bundle is emitted to out/main/, so runtime
 * __dirname is out/main/. resolveAppIconPath only needs to join the relative
 * path to baseDir; production uses __dirname and tests pass a controlled root.
 */
describe('app icon loader', () => {
  let mod: AppIconModule

  beforeEach(async () => {
    vi.resetModules()
    createFromBuffer.mockReset()
    createFromPath.mockReset()
    createFromDataURL.mockReset()
    createEmpty.mockReset()
    fsMock.readFileSync.mockReset()
    // Make the mock return a non-undefined NativeImage placeholder.
    createFromBuffer.mockReturnValue({ isEmpty: () => false } as unknown as Electron.NativeImage)
    createEmpty.mockReturnValue({ isEmpty: () => true } as unknown as Electron.NativeImage)
    mod = await import('./app-icon')
  })

  describe('resolveAppIconPath', () => {
    it('joins a relative source with the provided baseDir', () => {
      const resolved = mod.resolveAppIconPath('chunks/deepseek-XXXX.png', '/app/bundle')
      // Path separators differ by platform, so avoid hard-coding them.
      expect(resolved.replace(/\\/g, '/')).toBe('/app/bundle/chunks/deepseek-XXXX.png')
    })

    it('strips a leading slash before joining with baseDir (dev mode quirk)', () => {
      // Vite ?url imports can return '/chunks/deepseek-XXXX.png' in dev.
      // On Windows path.isAbsolute('/foo') is true, but the file still lives
      // under the main bundle output, so strip the leading slash first.
      const resolved = mod.resolveAppIconPath('/chunks/deepseek-XXXX.png', 'd:\\app\\bundle')
      expect(resolved.replace(/\\/g, '/')).toBe('d:/app/bundle/chunks/deepseek-XXXX.png')
    })

    it('passes an absolute source through unchanged', () => {
      const absolute = 'C:\\Users\\me\\app.asar\\deepseek.png'
      expect(mod.resolveAppIconPath(absolute, '/ignored')).toBe(absolute)
    })

    it('passes a data: URL through unchanged', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
      expect(mod.resolveAppIconPath(dataUrl, '/ignored')).toBe(dataUrl)
    })
  })

  describe('createAppIcon', () => {
    it('decodes a data: URL via nativeImage.createFromDataURL', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
      mod.createAppIcon(dataUrl)
      expect(createFromDataURL).toHaveBeenCalledTimes(1)
      expect(createFromDataURL).toHaveBeenCalledWith(dataUrl)
      expect(createFromBuffer).not.toHaveBeenCalled()
      expect(createFromPath).not.toHaveBeenCalled()
      expect(createEmpty).not.toHaveBeenCalled()
    })

    it('reads the file via readFileSync and passes the buffer to createFromBuffer', () => {
      const pngBytes = Buffer.concat([PNG_MAGIC, Buffer.alloc(2048, 0xab)])
      fsMock.readFileSync.mockReturnValue(pngBytes)

      const icon = mod.createAppIcon('chunks/deepseek-XXXX.png')

      // Key negative assertion: createFromPath must never be called.
      // The old implementation could not read dev server URLs or asar files,
      // which caused the tray icon to disappear on Windows.
      expect(createFromPath).not.toHaveBeenCalled()
      expect(fsMock.readFileSync).toHaveBeenCalledTimes(1)
      const [calledPath] = fsMock.readFileSync.mock.calls[0] as [string]
      expect(calledPath.replace(/\\/g, '/')).toContain('chunks/deepseek-XXXX.png')

      expect(createFromBuffer).toHaveBeenCalledTimes(1)
      const buffer = createFromBuffer.mock.calls[0]?.[0] as Buffer
      expect(Buffer.isBuffer(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(0)
      expect(buffer.subarray(0, 8).equals(PNG_MAGIC)).toBe(true)
      expect(createEmpty).not.toHaveBeenCalled()
      expect(icon).toBeDefined()
    })

    it('falls back to nativeImage.createEmpty when readFileSync throws', () => {
      fsMock.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file')
      })

      // Intentionally point at a missing path.
      const icon = mod.createAppIcon('chunks/missing.png')

      expect(createEmpty).toHaveBeenCalledTimes(1)
      expect(createFromBuffer).not.toHaveBeenCalled()
      expect(createFromPath).not.toHaveBeenCalled()
      expect(icon).toBeDefined()
    })
  })

  describe('pickTrayIcon', () => {
    function fakeImage(empty: boolean): Electron.NativeImage {
      return { isEmpty: () => empty } as unknown as Electron.NativeImage
    }

    it('returns the primary (tray) icon when both are non-empty', () => {
      const tray = fakeImage(false)
      const main = fakeImage(false)
      expect(mod.pickTrayIcon(tray, main)).toBe(tray)
    })

    it('falls back to the main app icon when the tray icon is empty', () => {
      const tray = fakeImage(true)
      const main = fakeImage(false)
      expect(mod.pickTrayIcon(tray, main)).toBe(main)
    })

    it('returns the fallback when both are empty — the function does not silently promote primary', () => {
      // When both inputs are empty, return fallback. It is functionally
      // equivalent to returning primary here, but preserving the rule makes the
      // caller's behavior easier to reason about.
      const tray = fakeImage(true)
      const main = fakeImage(true)
      expect(mod.pickTrayIcon(tray, main)).toBe(main)
    })
  })
})
