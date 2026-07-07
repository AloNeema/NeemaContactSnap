import { describe, expect, it } from "vitest";
import { formatReport, scoreCorpus } from "../eval/score";

// Per-field accuracy floors over the ground-truth corpus in eval/corpus.ts.
// These are regression gates: they should be raised as the parser improves,
// never silently lowered. The report is printed so every CI run shows where
// the parser actually stands.
const accuracyFloors: Record<string, number> = {
  fullName: 0.9,
  email: 1,
  phoneCount: 0.9,
  title: 0.8,
  company: 0.8,
  website: 0.75,
  city: 1,
  state: 1,
  postalCode: 1
};

describe("parser eval corpus", () => {
  const scores = scoreCorpus();

  it("prints the accuracy report", () => {
    console.log(`\n${formatReport(scores)}\n`);
    for (const score of scores.filter((item) => item.misses.length)) {
      console.log(`${score.field} misses:\n  ${score.misses.join("\n  ")}`);
    }
    expect(scores.length).toBeGreaterThan(0);
  });

  for (const [field, floor] of Object.entries(accuracyFloors)) {
    it(`keeps ${field} accuracy at or above ${Math.round(floor * 100)}%`, () => {
      const score = scores.find((item) => item.field === field);
      expect(score, `no corpus entries exercise ${field}`).toBeDefined();
      expect(score!.accuracy, score!.misses.join("; ")).toBeGreaterThanOrEqual(floor);
    });
  }
});
