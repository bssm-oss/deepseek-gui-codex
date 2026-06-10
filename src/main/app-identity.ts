import { app } from 'electron'

/**
 * Product name shown outside the app. Keep it aligned with:
 *   - package.json#productName
 *   - electron-builder.config.cjs#productName
 *   - tray menu and tooltip
 * Windows taskbar, system tray, and notification center labels all come from
 * this string. Packaged builds also write it into VERSIONINFO.
 */
export const APP_PRODUCT_NAME = 'DeepSeek GUI'

/**
 * Call this as early as possible in the main process to set the public app
 * name. `app.setName()` overrides `app.getName()` before package.json#name and
 * affects default BrowserWindow titles, notifications, tray labels, and every
 * other place that reads `app.getName()`.
 *
 * `app.setAppUserModelId()` is Windows-only, so main/index.ts calls it in the
 * win32 branch instead of doing it here.
 */
export function configureAppIdentity(): void {
  app.setName(APP_PRODUCT_NAME)
}
