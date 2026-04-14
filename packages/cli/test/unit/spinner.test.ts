import test from 'brittle'
import { spinner, Spinner } from '../../src/lib/spinner'

// All tests run under brittle, where stdout is not a TTY by default.
// That means the spinner takes the non-animated path. We exercise both
// branches by toggling process.stdout.isTTY in test.

function captureStdout(t: any): { written: string; restore: () => void } {
  const out = { written: '', restore: () => {} }
  const orig = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: any) => {
    out.written += String(chunk)
    return true
  }) as typeof process.stdout.write
  out.restore = () => {
    process.stdout.write = orig
  }
  t.teardown(out.restore)
  return out
}

test('spinner factory returns a Spinner', (t) => {
  const s = spinner('hi')
  t.ok(s instanceof Spinner)
})

test('non-TTY: start emits a single line and no animation', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  process.stdout.isTTY = false
  t.teardown(() => {
    process.stdout.isTTY = wasTty
  })

  const s = spinner('summoning…').start()
  s.stop()
  t.ok(cap.written.includes('summoning…'))
  t.absent(cap.written.includes('\r'), 'no carriage return in non-TTY mode')
})

test('non-TTY: succeed prints final line with brand symbol', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  process.stdout.isTTY = false
  t.teardown(() => {
    process.stdout.isTTY = wasTty
  })

  const s = spinner('working').start()
  s.succeed('done')
  t.ok(cap.written.includes('done'))
})

test('non-TTY: fail prints final line with cross', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  process.stdout.isTTY = false
  t.teardown(() => {
    process.stdout.isTTY = wasTty
  })

  const s = spinner('working').start()
  s.fail('boom')
  t.ok(cap.written.includes('❌'))
  t.ok(cap.written.includes('boom'))
})

test('CI env: spinner stays in non-TTY path even if isTTY true', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  const wasCi = process.env.CI
  process.stdout.isTTY = true
  process.env.CI = '1'
  t.teardown(() => {
    process.stdout.isTTY = wasTty
    if (wasCi === undefined) delete process.env.CI
    else process.env.CI = wasCi
  })

  const s = spinner('hi').start()
  s.stop()
  t.absent(cap.written.includes('\r'), 'no animation under CI')
})

test('start is idempotent', (t) => {
  captureStdout(t)
  const wasTty = process.stdout.isTTY
  process.stdout.isTTY = false
  t.teardown(() => {
    process.stdout.isTTY = wasTty
  })

  const s = spinner('x')
  t.execution(() => {
    s.start()
    s.start()
    s.stop()
  })
})

test('stop without start is a no-op', (t) => {
  captureStdout(t)
  const s = spinner('x')
  t.execution(() => s.stop())
})

test('update changes the active text (non-TTY)', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  process.stdout.isTTY = false
  t.teardown(() => {
    process.stdout.isTTY = wasTty
  })

  const s = spinner('first').start()
  s.update('second')
  s.succeed()
  // succeed() defaults to current text, which is now 'second'
  t.ok(cap.written.includes('second'))
})

test('TTY: render writes a carriage return + frame', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  const wasCi = process.env.CI
  process.stdout.isTTY = true
  delete process.env.CI
  t.teardown(() => {
    process.stdout.isTTY = wasTty
    if (wasCi !== undefined) process.env.CI = wasCi
  })

  const s = spinner('animating').start()
  s.stop()
  t.ok(cap.written.includes('\r'))
  t.ok(cap.written.includes('animating'))
})

test('TTY: succeed clears the line and prints final', (t) => {
  const cap = captureStdout(t)
  const wasTty = process.stdout.isTTY
  const wasCi = process.env.CI
  process.stdout.isTTY = true
  delete process.env.CI
  t.teardown(() => {
    process.stdout.isTTY = wasTty
    if (wasCi !== undefined) process.env.CI = wasCi
  })

  const s = spinner('working').start()
  s.succeed('ready')
  t.ok(cap.written.includes('\x1b[K'), 'clear-line escape emitted')
  t.ok(cap.written.includes('ready'))
})
