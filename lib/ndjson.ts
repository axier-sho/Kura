/**
 * Read an NDJSON (newline-delimited JSON) response body, invoking `onValue` for
 * each parsed object as it streams in. Buffers partial lines that span chunk
 * boundaries (and multibyte characters, via the streaming decoder).
 *
 * Used by the upload and organize panels to render live per-item progress from
 * their streaming POST endpoints.
 */
export async function readNdjsonStream<T>(
  res: Response,
  onValue: (value: T) => void,
): Promise<void> {
  if (!res.body) throw new Error("レスポンスボディがありません。");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) onValue(JSON.parse(line) as T);
      }
    }
    const tail = buffer.trim();
    if (tail) onValue(JSON.parse(tail) as T);
  } finally {
    // Always release the body's lock — even if JSON.parse or onValue throws
    // mid-stream — so the reader doesn't leave the stream permanently locked.
    reader.releaseLock();
  }
}
