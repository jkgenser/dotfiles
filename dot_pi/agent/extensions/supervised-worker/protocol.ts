import { StringDecoder } from "node:string_decoder"

export const DEFAULT_MAX_JSONL_BUFFER_BYTES = 4 * 1024 * 1024

/** Strict LF-delimited UTF-8 decoder for Pi's RPC protocol. */
export class JsonlDecoder {
  private readonly decoder = new StringDecoder("utf8")
  private readonly maxBufferBytes: number
  private buffer = ""

  constructor(maxBufferBytes = DEFAULT_MAX_JSONL_BUFFER_BYTES) {
    this.maxBufferBytes = maxBufferBytes
  }

  push(chunk: Buffer | Uint8Array | string): string[] {
    this.buffer +=
      typeof chunk === "string"
        ? chunk
        : this.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    return this.drain(false)
  }

  end(): string[] {
    this.buffer += this.decoder.end()
    return this.drain(true)
  }

  private drain(flush: boolean): string[] {
    const lines: string[] = []

    while (true) {
      const newline = this.buffer.indexOf("\n")
      if (newline === -1) break

      let line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (line.endsWith("\r")) line = line.slice(0, -1)
      lines.push(line)
    }

    if (Buffer.byteLength(this.buffer, "utf8") > this.maxBufferBytes) {
      throw new Error(
        `RPC JSONL record exceeded ${this.maxBufferBytes} buffered bytes without a newline`,
      )
    }

    if (flush && this.buffer.length > 0) {
      lines.push(this.buffer.endsWith("\r") ? this.buffer.slice(0, -1) : this.buffer)
      this.buffer = ""
    }

    return lines
  }
}

export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== "object" || Array.isArray(message)) return ""
  const value = message as { role?: unknown; content?: unknown }
  if (value.role !== "assistant") return ""
  if (typeof value.content === "string") return value.content
  if (!Array.isArray(value.content)) return ""

  return value.content
    .filter(
      (part): part is { type: "text"; text: string } =>
        Boolean(
          part &&
            typeof part === "object" &&
            !Array.isArray(part) &&
            (part as { type?: unknown }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string",
        ),
    )
    .map((part) => part.text)
    .join("\n")
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.length <= maxBytes) return value

  let end = Math.max(0, maxBytes)
  let truncated = bytes.subarray(0, end).toString("utf8")
  while (truncated.endsWith("�") && end > 0) {
    end -= 1
    truncated = bytes.subarray(0, end).toString("utf8")
  }
  return `${truncated}\n\n[Truncated: ${bytes.length - end} bytes omitted.]`
}

export function appendTailUtf8(current: string, chunk: string, maxBytes: number): string {
  const combined = Buffer.from(current + chunk, "utf8")
  if (combined.length <= maxBytes) return combined.toString("utf8")
  return combined.subarray(combined.length - maxBytes).toString("utf8")
}
