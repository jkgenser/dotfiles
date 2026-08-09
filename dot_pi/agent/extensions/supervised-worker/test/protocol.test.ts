import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  appendTailUtf8,
  extractAssistantText,
  JsonlDecoder,
  truncateUtf8,
} from "../protocol.ts"

describe("JsonlDecoder", () => {
  it("decodes strict LF records split across UTF-8 chunks", () => {
    const decoder = new JsonlDecoder()
    const bytes = Buffer.from('{"text":"héllo"}\n{"ok":true}\r\n', "utf8")
    const split = bytes.indexOf(Buffer.from("é")) + 1

    assert.deepEqual(decoder.push(bytes.subarray(0, split)), [])
    assert.deepEqual(decoder.push(bytes.subarray(split)), [
      '{"text":"héllo"}',
      '{"ok":true}',
    ])
    assert.deepEqual(decoder.end(), [])
  })

  it("decodes CRLF-delimited records without retaining the carriage return", () => {
    const decoder = new JsonlDecoder()
    assert.deepEqual(decoder.push('{"a":1}\r\n{"b":2}\r\n'), [
      '{"a":1}',
      '{"b":2}',
    ])
    assert.deepEqual(decoder.end(), [])
  })

  it("flushes a final unterminated record", () => {
    const decoder = new JsonlDecoder()
    assert.deepEqual(decoder.push('{"ok":'), [])
    assert.deepEqual(decoder.push("true}"), [])
    assert.deepEqual(decoder.end(), ['{"ok":true}'])
  })

  it("rejects an oversized unterminated record", () => {
    const decoder = new JsonlDecoder(4)
    assert.throws(() => decoder.push("12345"), /exceeded 4 buffered bytes/)
  })
})

describe("extractAssistantText", () => {
  it("joins assistant text blocks and ignores tool calls", () => {
    assert.equal(
      extractAssistantText({
        role: "assistant",
        content: [
          { type: "text", text: "first" },
          { type: "toolCall", name: "read", arguments: {} },
          { type: "text", text: "second" },
        ],
      }),
      "first\nsecond",
    )
  })

  it("rejects non-assistant and malformed messages", () => {
    assert.equal(extractAssistantText({ role: "user", content: "hello" }), "")
    assert.equal(extractAssistantText(null), "")
  })
})

describe("UTF-8 bounds", () => {
  it("truncates without ending on a replacement character", () => {
    const result = truncateUtf8("ab😀cd", 4)
    assert.match(result, /^ab\n\n\[Truncated:/)
    assert.equal(result.includes("�"), false)
  })

  it("keeps only the requested stderr tail", () => {
    assert.equal(appendTailUtf8("1234", "5678", 4), "5678")
  })
})
