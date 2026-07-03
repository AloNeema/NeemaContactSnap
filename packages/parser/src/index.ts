import type {
  DuplicateMatch,
  FieldEvidence,
  ParseContactInput,
  ParsedAddress,
  ParsedContact,
  ParsedPhone,
  PhoneType
} from "@contactsnap/shared-types";

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s,;)]*/gi;
const linkedInRegex = /\b(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[^\s,;)]+/i;
const phoneRegex = /(?:(?:mobile|cell|m|direct|office|work|phone|tel|t|fax|f)[\s:.-]*)?(?:\+?\d[\d\s().-]{7,}\d)(?:\s*(?:x|ext\.?)\s*\d+)?/gi;
const streetRegex = /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Suite|Ste\.?|Floor|Fl\.?)\b[^\n]*/i;
const cityStateRegex = /\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2}|[A-Za-z .'-]+)\s+([A-Z0-9][A-Z0-9 -]{2,10})\b/;
const disposableDomainWords = ["gmail", "icloud", "outlook", "hotmail", "yahoo", "proton", "me", "aol"];

const titleWords = [
  "chief",
  "ceo",
  "cto",
  "cfo",
  "coo",
  "founder",
  "president",
  "director",
  "manager",
  "lead",
  "principal",
  "partner",
  "engineer",
  "designer",
  "sales",
  "marketing",
  "operations",
  "account",
  "consultant",
  "advisor",
  "associate",
  "vp",
  "vice president",
  "head of"
];

const companySuffixes = [
  "inc",
  "inc.",
  "llc",
  "l.l.c.",
  "ltd",
  "ltd.",
  "corp",
  "corp.",
  "corporation",
  "company",
  "co.",
  "group",
  "partners",
  "studios",
  "labs",
  "systems",
  "solutions",
  "capital",
  "ventures"
];

export function parseContact(input: ParseContactInput): ParsedContact {
  const sourceText = input.text.trim();
  const warnings: string[] = [];
  const fieldEvidence: Record<string, FieldEvidence> = {};
  const fieldConfidence: Record<string, number> = {};

  if (!sourceText) {
    return emptyContact(input.text, input.source, ["No contact text was provided."]);
  }

  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isDisclaimerLine(line));

  const emails = unique(sourceText.match(emailRegex) ?? []).map((email) => email.toLowerCase());
  const urls = unique(sourceText.match(urlRegex) ?? []).map(cleanUrl);
  const linkedinUrl = urls.find((url) => linkedInRegex.test(url));
  const website = urls.find((url) => !url.includes("@") && !/linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com/i.test(url));
  const phones = extractPhones(sourceText);
  const address = extractAddress(lines);
  const fullName = extractName(lines, emails);
  const { firstName, lastName } = splitName(fullName);
  const title = extractTitle(lines, fullName);
  const company = extractCompany(lines, emails, title, fullName);
  const sourceEmailDomain = emails[0]?.split("@")[1];

  addEvidence(sourceText, fieldEvidence, fieldConfidence, "emails", emails.join(", "), emails[0] ?? "", emails.length ? 0.98 : 0, "Matched a valid email address pattern.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "phones", phones.map((phone) => phone.value).join(", "), phones[0]?.evidence ?? "", phones.length ? phoneAggregateConfidence(phones) : 0, "Matched phone-like numbers and classified labels such as mobile, office, or fax.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "fullName", fullName, fullName, fullNameConfidence(fullName, emails), "Selected the strongest person-name line or inferred it from the email local part.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "title", title, title, title ? titleConfidence(title) : 0, "Matched a job-title keyword on a short signature line.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "company", company, company, company ? companyConfidence(company, emails) : 0, "Selected an organization-looking line or inferred the company from the email domain.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "website", website, website, website ? 0.86 : 0, "Matched a URL that was not a social profile.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "linkedinUrl", linkedinUrl, linkedinUrl, linkedinUrl ? 0.94 : 0, "Matched a LinkedIn profile or company URL.");
  if (address) {
    addEvidence(sourceText, fieldEvidence, fieldConfidence, "address", Object.values(address).filter(Boolean).join(", "), Object.values(address).filter(Boolean).join(", "), addressConfidence(address), "Matched a street line and city/state/postal line.");
  }

  if (!emails.length) warnings.push("No email address was detected. Add one before saving to avoid creating an unusable contact.");
  if (!fullName) warnings.push("No confident person name was detected. Review the name field before saving.");
  if (detectMultipleContacts(sourceText).length > 1) warnings.push("Multiple contacts may be present. Choose one contact or create each separately before saving.");

  const confidenceValues = Object.values(fieldConfidence).filter((value) => value > 0);
  const confidence = confidenceValues.length
    ? round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
    : 0.25;

  return {
    fullName,
    firstName,
    lastName,
    title,
    company,
    emails,
    phones,
    website,
    linkedinUrl,
    address,
    notes: buildNotes(lines),
    sourceText,
    source: input.source ?? "unknown",
    sourceEmailDomain,
    dateCaptured: new Date().toISOString(),
    confidence,
    fieldConfidence,
    fieldEvidence,
    warnings
  };
}

export function detectMultipleContacts(text: string): ParsedContact[] {
  const chunks = text
    .split(/\n\s*(?:-{3,}|_{3,}|={3,})\s*\n|(?=\n[A-Z][a-z]+ [A-Z][a-z]+(?:\s*\n)(?:[^\n@]+)?\n?[A-Z0-9._%+-]+@)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 8);

  const likelyChunks = chunks.filter((chunk) => (chunk.match(emailRegex) ?? []).length || (chunk.match(phoneRegex) ?? []).length);
  if (likelyChunks.length <= 1) return [];
  return likelyChunks.map((chunk) => parseContact({ text: chunk, source: "unknown" }));
}

export function findDuplicateContacts(candidate: ParsedContact, existing: ParsedContact[]): DuplicateMatch[] {
  return existing
    .map((contact) => {
      const reasons: string[] = [];
      let score = 0;
      const candidateEmails = new Set(candidate.emails.map(normalizeEmail));
      const contactEmails = new Set(contact.emails.map(normalizeEmail));
      if ([...candidateEmails].some((email) => contactEmails.has(email))) {
        score += 0.7;
        reasons.push("matching email");
      }

      const candidatePhones = new Set(candidate.phones.map((phone) => normalizePhone(phone.value)).filter(Boolean));
      const contactPhones = new Set(contact.phones.map((phone) => normalizePhone(phone.value)).filter(Boolean));
      if ([...candidatePhones].some((phone) => contactPhones.has(phone))) {
        score += 0.25;
        reasons.push("matching phone");
      }

      if (candidate.fullName && contact.fullName && normalizeName(candidate.fullName) === normalizeName(contact.fullName)) {
        score += candidate.company && contact.company && normalizeName(candidate.company) === normalizeName(contact.company) ? 0.25 : 0.12;
        reasons.push("matching name");
      }

      if (candidate.sourceEmailDomain && contact.sourceEmailDomain && candidate.sourceEmailDomain === contact.sourceEmailDomain) {
        score += 0.08;
        reasons.push("matching email domain");
      }

      const normalizedScore = round(Math.min(score, 1));
      return {
        contact,
        score: normalizedScore,
        reasons,
        recommendedAction: normalizedScore >= 0.85 ? "update" : normalizedScore >= 0.62 ? "merge" : "create_new"
      } satisfies DuplicateMatch;
    })
    .filter((match) => match.score >= 0.55)
    .sort((a, b) => b.score - a.score);
}

function extractPhones(text: string): ParsedPhone[] {
  return unique(text.match(phoneRegex) ?? [])
    .map((raw) => {
      const type = inferPhoneType(raw);
      const value = normalizePhoneDisplay(raw);
      return { type, value, confidence: scorePhone(raw, type), evidence: raw.trim() };
    })
    .filter((phone) => normalizePhone(phone.value).length >= 10);
}

function inferPhoneType(raw: string): PhoneType {
  const value = raw.toLowerCase();
  if (/\b(mobile|cell|cellular|m)\b/.test(value)) return "mobile";
  if (/\b(fax|f)\b/.test(value)) return "fax";
  if (/\b(office|work|direct|phone|tel|t)\b/.test(value)) return "office";
  return "unknown";
}

function normalizePhoneDisplay(raw: string): string {
  return raw.replace(/^(mobile|cell|m|direct|office|work|phone|tel|t|fax|f)[\s:.-]*/i, "").replace(/\s+/g, " ").trim();
}

function extractAddress(lines: string[]): ParsedAddress | undefined {
  const streetLine = lines.find((line) => streetRegex.test(line));
  const cityStateLine = lines.find((line) => !streetRegex.test(line) && cityStateRegex.test(line));
  if (!streetLine && !cityStateLine) return undefined;

  const cityMatch = cityStateLine?.match(cityStateRegex);
  return {
    street: streetLine,
    city: cityMatch?.[1],
    state: cityMatch?.[2],
    postalCode: cityMatch?.[3],
    country: inferCountry(lines)
  };
}

function extractName(lines: string[], emails: string[]): string | undefined {
  const candidates = lines.filter((line) => {
    if (line.length > 48 || line.includes("@") || /https?:|www\.|linkedin\.com/i.test(line)) return false;
    if (/[0-9]/.test(line) || isTitleLine(line) || isCompanyLine(line)) return false;
    return /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(line);
  });

  if (candidates[0]) return candidates[0];
  const emailLocal = emails[0]?.split("@")[0].replace(/[._-]+/g, " ");
  if (emailLocal && /^[a-z]+ [a-z]+$/i.test(emailLocal)) {
    return titleCase(emailLocal);
  }
  return undefined;
}

function splitName(fullName?: string): { firstName?: string; lastName?: string } {
  if (!fullName) return {};
  const parts = fullName.split(/\s+/);
  return { firstName: parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : undefined };
}

function extractTitle(lines: string[], fullName?: string): string | undefined {
  return lines.find((line) => line !== fullName && isTitleLine(line) && line.length < 80);
}

function extractCompany(lines: string[], emails: string[], title?: string, fullName?: string): string | undefined {
  const companyLine = lines.find((line) => line !== title && line !== fullName && isCompanyLine(line));
  if (companyLine) return companyLine;
  const domain = emails[0]?.split("@")[1]?.split(".")[0];
  if (domain && !disposableDomainWords.includes(domain)) return titleCase(domain.replace(/[-_]+/g, " "));
  return undefined;
}

function isTitleLine(line: string): boolean {
  const lower = line.toLowerCase();
  return titleWords.some((word) => lower.includes(word));
}

function isCompanyLine(line: string): boolean {
  const lower = line.toLowerCase();
  return companySuffixes.some((suffix) => lower.split(/\s+/).includes(suffix)) || /©|copyright/i.test(line) === false && /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z&]+){0,4}\b/.test(line) && /labs|studio|group|systems|solutions/i.test(line);
}

function isDisclaimerLine(line: string): boolean {
  return /confidential|intended recipient|privileged|unsubscribe|legal notice|please consider the environment/i.test(line);
}

function buildNotes(lines: string[]): string | undefined {
  const useful = lines.filter((line) => /assistant|calendar|timezone|pronouns|booking/i.test(line));
  return useful.length ? useful.join("\n") : undefined;
}

function phoneAggregateConfidence(phones: ParsedPhone[]): number {
  return round(phones.reduce((sum, phone) => sum + phone.confidence, 0) / phones.length);
}

function scorePhone(raw: string, type: PhoneType): number {
  const digits = normalizePhone(raw);
  const hasCountry = raw.trim().startsWith("+");
  const plausibleLength = digits.length >= 10 && digits.length <= 15;
  return round((plausibleLength ? 0.68 : 0.42) + (type === "unknown" ? 0 : 0.14) + (hasCountry ? 0.08 : 0));
}

function fullNameConfidence(fullName: string | undefined, emails: string[]): number {
  if (!fullName) return 0;
  const emailLocal = emails[0]?.split("@")[0]?.replace(/[._-]+/g, " ").toLowerCase();
  const exactEmailHint = emailLocal && normalizeName(emailLocal) === normalizeName(fullName);
  return exactEmailHint ? 0.9 : 0.8;
}

function titleConfidence(title: string): number {
  return title.split(/\s+/).length <= 8 ? 0.78 : 0.66;
}

function companyConfidence(company: string, emails: string[]): number {
  const domain = emails[0]?.split("@")[1]?.split(".")[0]?.replace(/[-_]+/g, " ");
  if (domain && normalizeName(company).includes(normalizeName(domain))) return 0.82;
  return companySuffixes.some((suffix) => company.toLowerCase().includes(suffix.replace(".", ""))) ? 0.84 : 0.72;
}

function addressConfidence(address: ParsedAddress): number {
  let score = 0.48;
  if (address.street) score += 0.14;
  if (address.city) score += 0.1;
  if (address.state) score += 0.08;
  if (address.postalCode) score += 0.08;
  if (address.country) score += 0.06;
  return round(score);
}

function inferCountry(lines: string[]): string | undefined {
  return lines.find((line) => /United States|USA|Canada|United Kingdom|UK|Australia|Germany|France/i.test(line));
}

function addEvidence(
  sourceText: string,
  fieldEvidence: Record<string, FieldEvidence>,
  fieldConfidence: Record<string, number>,
  field: string,
  value: string | undefined,
  evidence: string | undefined,
  confidence: number,
  rationale: string
): void {
  if (!value) return;
  fieldConfidence[field] = confidence;
  const located = locateEvidence(sourceText, evidence ?? value);
  fieldEvidence[field] = { value, evidence: evidence ?? value, confidence, rationale, ...located };
}

function locateEvidence(sourceText: string, evidence: string): Pick<FieldEvidence, "sourceLine" | "startOffset" | "endOffset"> {
  const startOffset = evidence ? sourceText.toLowerCase().indexOf(evidence.toLowerCase()) : -1;
  if (startOffset < 0) return {};
  const sourceLine = sourceText.slice(0, startOffset).split(/\r?\n/).length;
  return { sourceLine, startOffset, endOffset: startOffset + evidence.length };
}

function emptyContact(sourceText: string, source: ParseContactInput["source"], warnings: string[]): ParsedContact {
  return {
    emails: [],
    phones: [],
    sourceText,
    source: source ?? "unknown",
    dateCaptured: new Date().toISOString(),
    confidence: 0,
    fieldConfidence: {},
    fieldEvidence: {},
    warnings
  };
}

function cleanUrl(url: string): string {
  const trimmed = url.replace(/[),.;]+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizePhoneDisplayForSearch(value: string): string {
  return normalizePhone(value);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export const internals = {
  normalizePhone: normalizePhoneDisplayForSearch
};
