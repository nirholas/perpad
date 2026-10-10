import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type EntryKind = "thought" | "action" | "result" | "risk_denied" | "error" | "tick";

export interface JournalEntry {
  seq: number;
  ts: string;
  kind: EntryKind;
  data: unknown;
  prev: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

export function hashEntry(e: Omit<JournalEntry, "hash">): string {
  return createHash("sha256").update(`${e.seq}|${e.ts}|${e.kind}|${JSON.stringify(e.data)}|${e.prev}`).digest("hex");
}

/**
 * Append-only decision log. Every entry commits to the previous one by hash, so
 * editing or deleting history is detectable by anyone who reads the file.
 */
export class Journal {
  private seq = 0;
  private prev = GENESIS;

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path)) {
      const entries = Journal.read(path);
      const bad = Journal.verify(entries);
      if (bad !== null) throw new Error(`journal ${path} is corrupt at seq ${bad}`);
      const last = entries.at(-1);
      if (last) {
        this.seq = last.seq;
        this.prev = last.hash;
      }
    }
  }

  append(kind: EntryKind, data: unknown, now: Date = new Date()): JournalEntry {
    const base = { seq: this.seq + 1, ts: now.toISOString(), kind, data, prev: this.prev };
    const entry: JournalEntry = { ...base, hash: hashEntry(base) };
    appendFileSync(this.path, JSON.stringify(entry) + "\n");
    this.seq = entry.seq;
    this.prev = entry.hash;
    return entry;
  }

  static read(path: string): JournalEntry[] {
    return readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as JournalEntry);
  }

  /** Returns the seq of the first broken entry, or null when the chain is intact. */
  static verify(entries: JournalEntry[]): number | null {
    let prev = GENESIS;
    for (const [i, e] of entries.entries()) {
      const { hash, ...rest } = e;
      if (e.seq !== i + 1 || e.prev !== prev || hashEntry(rest) !== hash) return e.seq;
      prev = hash;
    }
    return null;
  }
}
