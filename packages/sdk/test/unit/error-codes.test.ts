import test from 'brittle'
import { ERROR_CODES as SDK_CODES } from '../../src/error-codes'
import { ERROR_CODES as DAEMON_CODES } from '@openpact/daemon'

// Catches the "added a new error on the server, forgot the mapper" bug
// class before it reaches a release. Adding or renaming a code must be
// done in lock-step with packages/daemon/src/error-codes.ts and the
// `mapHttpError` switch in packages/sdk/src/errors.ts.

test('SDK ERROR_CODES matches @openpact/daemon ERROR_CODES key-for-key', (t) => {
  t.alike(
    Object.keys(SDK_CODES).sort(),
    Object.keys(DAEMON_CODES).sort(),
    'daemon and SDK declare the same set of error codes',
  )
})

test('SDK ERROR_CODES matches @openpact/daemon ERROR_CODES value-for-value', (t) => {
  const diffs: string[] = []
  for (const key of Object.keys(SDK_CODES) as Array<keyof typeof SDK_CODES>) {
    const sdkVal = SDK_CODES[key]
    const daemonVal = (DAEMON_CODES as Record<string, string>)[key as string]
    if (sdkVal !== daemonVal) {
      diffs.push(`${String(key)}: SDK=${sdkVal} daemon=${daemonVal}`)
    }
  }
  t.is(diffs.join('\n'), '', 'wire values are identical on both sides')
})

test('every ERROR_CODES key matches its own value (typo guard)', (t) => {
  for (const [key, value] of Object.entries(SDK_CODES)) {
    t.is(value, key, `${key} uses itself as its wire value`)
  }
})
