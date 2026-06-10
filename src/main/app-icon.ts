import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeImage } from 'electron'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve a Vite/Rollup asset URL to a real filesystem path.
 *
 * electron-vite uses Rollup for main-process assets. Unlike renderer imports,
 * main-process `?url` imports return paths relative to the main bundle in both
 * dev and packaged builds, such as `'chunks/deepseek-XXXX.png'`. The main bundle
 * is emitted to `out/main/`, so runtime `__dirname = out/main/` and the asset is
 * at `out/main/chunks/deepseek-XXXX.png`.
 *
 * In packaged builds `__dirname` is inside `app.asar`, but Node's
 * `fs.readFileSync` can read asar paths transparently. No `asarUnpack` or
 * `app.isPackaged` branch is needed.
 *
 * `baseDir` is a parameter so tests can pass a controlled root instead of
 * depending on runtime `__dirname`. Production calls use the default value.
 */
export function resolveAppIconPath(source: string, baseDir: string = __dirname): string {
  if (source.startsWith('data:')) return source
  if (/^[a-zA-Z]:[\\/]/.test(source) || source.startsWith('\\\\')) return source
  // Vite ?url imports can return a leading slash in dev, such as '/chunks/...'.
  // On Windows path.isAbsolute('/foo') is true, but that path does not point at
  // d:\chunks\...; the file lives under the main bundle output. Strip this
  // leading slash before checking absoluteness. Real Windows absolute paths
  // with drive letters or UNC prefixes do not start this way and pass through.
  const normalized = source.replace(/^\/+/, '')
  return isAbsolute(normalized) ? normalized : join(baseDir, normalized)
}

/**
 * Load the app icon by reading a buffer first and then passing it to
 * `nativeImage.createFromBuffer()`.
 *
 * The old implementation used `nativeImage.createFromPath(source)`, which uses
 * Chromium's native image loader. It cannot read Vite dev server URLs or files
 * inside `app.asar`, even though Node `fs` can. That made `appIcon` empty and
 * produced a NULL NotifyIconData.hIcon on Windows. Reading the buffer first
 * routes through Electron's own API and avoids that native-loader limitation.
 */
export function createAppIcon(source: string): Electron.NativeImage {
  if (source.startsWith('data:')) {
    return nativeImage.createFromDataURL(source)
  }

  const absolute = resolveAppIconPath(source)
  try {
    return nativeImage.createFromBuffer(readFileSync(absolute))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      '[deepseek-gui] failed to load app icon from',
      absolute,
      '-',
      message
    )
    return nativeImage.createEmpty()
  }
}

/**
 * Pick the tray image. Prefer the tray-optimized primary image, usually a
 * smaller and simpler silhouette that stays clear at 16x16 / 24x24. Fall back
 * to the main app icon so a missing tray asset never shows Electron's default
 * placeholder.
 *
 * This stays separate because:
 *   - it is a pure two-input/one-output function that can be tested with fake
 *     NativeImage instances without creating a real Tray
 *   - `pickTrayIcon` communicates the tray-first intent better than an inline
 *     ternary expression
 */
export function pickTrayIcon(
  primary: Electron.NativeImage,
  fallback: Electron.NativeImage
): Electron.NativeImage {
  return primary.isEmpty() ? fallback : primary
}
