const assert = require("node:assert");

function toContainMatchObject(received, expected) {
  let pass = false;
  for (const each of received) {
    try {
      assert.deepStrictEqual(checkObjectEquality(each, expected), true);
      pass = true;
    } catch {
      // ignore
    }

    if (pass) break;
  }

  if (!pass) {
    throw new Error(`expected
${JSON.stringify(received, null, 2)}
to include an object matching
${JSON.stringify(expected, null, 2)}`);
  }
}

function checkObjectEquality(received, expected) {
  if (!received) {
    return false;
  }
  return Object.keys(expected).every((key) => {
    if (Array.isArray(expected[key])) {
      if (!Array.isArray(received[key])) return false;

      for (const entry of expected[key]) {
        const hasEntry = received[key].some(
          (receivedEntry) =>
            receivedEntry === entry ||
            checkObjectEquality(receivedEntry, entry),
        );
        if (!hasEntry) {
          return false;
        }
      }
      return true;
    } else if (typeof expected[key] === "object" && expected[key] !== null) {
      return checkObjectEquality(received[key], expected[key]);
    }
    return received[key] === expected[key];
  });
}

function toBeDateLike(received) {
  const pass =
    received instanceof Date ||
    (typeof received === "string" && !!Date.parse(received));
  if (!pass) {
    throw new Error(`expected ${received} to be date-like`);
  }
}

// Add custom matchers to assert
assert.toContainMatchObject = toContainMatchObject;
assert.toBeDateLike = toBeDateLike;

module.exports = assert;
