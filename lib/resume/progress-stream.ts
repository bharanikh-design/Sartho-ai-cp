/*
 * The import's progress, as it comes off the wire.
 *
 * Newline-delimited JSON, read from a stream. Chunks arrive on whatever
 * boundary the network hands over, which is almost never a line ending: a
 * single event can be split across two reads, and two events can turn up in
 * one. A partial line is therefore carried forward rather than parsed, and the
 * remainder is flushed at the end — a reader that assumes one chunk is one
 * message loses events at exactly the moment the document is largest.
 */

export type ImportEvent =
  | { stage: "extracted"; characters: number; sample: string }
  | { stage: "reading" }
  | { stage: "saving"; roles: number; claims: number }
  | { stage: "done"; importId: string; rolesCreated: number; evidenceCreated: number; evidenceSkipped: number }
  | { stage: "error"; error: string };

export async function readProgressEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ImportEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = (flush: boolean) => {
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as ImportEvent);
      newline = buffer.indexOf("\n");
    }
    if (flush) {
      const tail = buffer.trim();
      buffer = "";
      if (tail) onEvent(JSON.parse(tail) as ImportEvent);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain(false);
    }
    buffer += decoder.decode();
    drain(true);
  } finally {
    reader.releaseLock();
  }
}
