import { parseContact } from "../src/index";
import { evalCorpus } from "./corpus";
import type { CorpusEntry } from "./corpus";

export type FieldScore = {
  field: string;
  correct: number;
  total: number;
  accuracy: number;
  misses: string[];
};

type Extractor = (entry: CorpusEntry) => { expected: unknown; actual: unknown } | undefined;

const extractors: Record<string, Extractor> = {
  fullName: (entry) => pick(entry, "fullName", (contact) => contact.fullName),
  title: (entry) => pick(entry, "title", (contact) => contact.title),
  company: (entry) => pick(entry, "company", (contact) => contact.company),
  email: (entry) => pick(entry, "email", (contact) => contact.emails[0]),
  phoneCount: (entry) => pick(entry, "phoneCount", (contact) => contact.phones.length),
  website: (entry) => pick(entry, "website", (contact) => contact.website),
  city: (entry) => pick(entry, "city", (contact) => contact.address?.city),
  state: (entry) => pick(entry, "state", (contact) => contact.address?.state),
  postalCode: (entry) => pick(entry, "postalCode", (contact) => contact.address?.postalCode)
};

const parsedCache = new Map<string, ReturnType<typeof parseContact>>();

function parsedFor(entry: CorpusEntry) {
  let parsed = parsedCache.get(entry.id);
  if (!parsed) {
    parsed = parseContact({ text: entry.text });
    parsedCache.set(entry.id, parsed);
  }
  return parsed;
}

function pick(entry: CorpusEntry, field: keyof CorpusEntry["expected"], read: (contact: ReturnType<typeof parseContact>) => unknown) {
  if (!(field in entry.expected)) return undefined;
  return { expected: entry.expected[field], actual: read(parsedFor(entry)) };
}

export function scoreCorpus(): FieldScore[] {
  return Object.entries(extractors).map(([field, extract]) => {
    let correct = 0;
    let total = 0;
    const misses: string[] = [];
    for (const entry of evalCorpus) {
      const comparison = extract(entry);
      if (!comparison) continue;
      total += 1;
      if (comparison.actual === comparison.expected) {
        correct += 1;
      } else {
        misses.push(`${entry.id}: expected ${JSON.stringify(comparison.expected)}, got ${JSON.stringify(comparison.actual)}`);
      }
    }
    return { field, correct, total, accuracy: total ? correct / total : 1, misses };
  });
}

export function formatReport(scores: FieldScore[]): string {
  const lines = ["field        correct/total  accuracy", "-".repeat(40)];
  for (const score of scores) {
    lines.push(`${score.field.padEnd(12)} ${String(score.correct).padStart(3)}/${String(score.total).padEnd(3)}        ${(score.accuracy * 100).toFixed(0)}%`);
  }
  const overallCorrect = scores.reduce((sum, score) => sum + score.correct, 0);
  const overallTotal = scores.reduce((sum, score) => sum + score.total, 0);
  lines.push("-".repeat(40));
  lines.push(`overall      ${overallCorrect}/${overallTotal}        ${((overallCorrect / overallTotal) * 100).toFixed(0)}%`);
  return lines.join("\n");
}
