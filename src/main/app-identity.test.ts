import { beforeEach, describe, expect, it, vi } from 'vitest'

const setName = vi.fn()
const setAppUserModelId = vi.fn()

vi.mock('electron', () => ({
  app: {
    setName,
    setAppUserModelId
  }
}))

describe('app identity bootstrap', () => {
  beforeEach(() => {
    setName.mockReset()
    setAppUserModelId.mockReset()
    vi.resetModules()
  })

  it('calls app.setName with the project productName', async () => {
    const { configureAppIdentity, APP_PRODUCT_NAME } = await import('./app-identity')
    configureAppIdentity()
    expect(setName).toHaveBeenCalledTimes(1)
    expect(setName).toHaveBeenCalledWith(APP_PRODUCT_NAME)
    expect(APP_PRODUCT_NAME).toBe('DeepSeek GUI')
  })

  it('does not call app.setAppUserModelId (caller responsibility on win32)', async () => {
    // main/index.ts still calls setAppUserModelId from the win32 branch.
    // This test only checks that configureAppIdentity does not duplicate it.
    const { configureAppIdentity } = await import('./app-identity')
    configureAppIdentity()
    expect(setAppUserModelId).not.toHaveBeenCalled()
  })
})
