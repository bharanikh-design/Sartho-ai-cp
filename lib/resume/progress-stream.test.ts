import { describe, expect, it } from "vitest";
import { readProgressEvents, type ImportEvent } from "./progress-stream";

/*
 * Every test here hands the reader a chunking the network could plausibly
 * produce. The events are always the same; only where the breaks fall changes.
 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]) {
  const seen: ImportEvent[] = [];
  await readProgressEvents(streamOf(chunks), (event) => seen.push(event));
  return seen;
}

const extracted = '{"stage":"extracted","characters":12043,"sample":"BHARANI"}';
const reading = '{"stage":"reading"}';
const saving = '{"stage":"saving","roles":6,"claims":34}';

describe("readProgressEvents", () => {
  it("reads one event per line", async () => {
    const seen = await collect([`${extracted}\n`, `${reading}\n`]);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading"]);
  });

  it("reads several events arriving in one chunk", async () => {
    const seen = await collect([`${extracted}\n${reading}\n${saving}\n`]);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading", "saving"]);
  });

  it("carries a line split across two chunks", async () => {
    const half = Math.floor(extracted.length / 2);
    const seen = await collect([extracted.slice(0, half), `${extracted.slice(half)}\n`]);
    expect(seen).toEqual([{ stage: "extracted", characters: 12043, sample: "BHARANI" }]);
  });

  it("splits a line one byte at a time without losing it", async () => {
    const seen = await collect([...`${saving}\n`]);
    expect(seen).toEqual([{ stage: "saving", roles: 6, claims: 34 }]);
  });

  it("flushes a final event that never got its newline", async () => {
    const seen = await collect([`${extracted}\n`, reading]);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading"]);
  });

  it("ignores blank lines and stray whitespace", async () => {
    const seen = await collect([`\n${extracted}\n\n  \n${reading}\n`]);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading"]);
  });

  it("survives a multi-byte character split across a chunk boundary", async () => {
    // "résumé" encodes é as two bytes; the split lands between them.
    const line = '{"stage":"error","error":"résumé"}\n';
    const bytes = new TextEncoder().encode(line);
    const cut = line.indexOf("é") + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });

    const seen: ImportEvent[] = [];
    await readProgressEvents(stream, (event) => seen.push(event));
    expect(seen).toEqual([{ stage: "error", error: "résumé" }]);
  });

  it("reports nothing for an empty stream", async () => {
    expect(await collect([])).toEqual([]);
  });
});
