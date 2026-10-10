import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Journal } from "../src/journal.js";

const tmp = () => join(mkdtempSync(join(tmpdir(), "perpad-")), "j.jsonl");

describe("journal", () => {
  it("chains entries and resumes across restarts", () => {
    const p = tmp();
    const j = new Journal(p);
    j.append("tick", { a: 1 });
    j.append("thought", { text: "hold" });
    const again = new Journal(p);
    expect(again.append("action", { x: 1 }).seq).toBe(3);
    expect(Journal.verify(Journal.read(p))).toBeNull();
  });
  it("detects edited history", () => {
    const p = tmp();
    const j = new Journal(p);
    j.append("action", { pnl: -100 });
    j.append("action", { pnl: 5 });
    writeFileSync(p, readFileSync(p, "utf8").replace("-100", "100"));
    expect(Journal.verify(Journal.read(p))).toBe(1);
    expect(() => new Journal(p)).toThrow(/corrupt/);
  });
  it("detects deleted entries", () => {
    const p = tmp();
    const j = new Journal(p);
    for (let i = 0; i < 3; i++) j.append("tick", i);
    const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
    writeFileSync(p, [lines[0], lines[2]].join("\n") + "\n");
    expect(Journal.verify(Journal.read(p))).not.toBeNull();
  });
});
