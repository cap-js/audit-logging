function toContainMatchObject(received, expected) {
  let pass = false
  for (const each of received) {
    try {
      expect(each).toMatchObject(expected)
      pass = true
    } catch {
      // ignore
    }

    if (pass) break
  }

  const message = () => `expected
${JSON.stringify(received, null, 2)}
to include an object matching
${JSON.stringify(expected, null, 2)}`

  return { pass, message }
}

expect.extend({ toContainMatchObject })
