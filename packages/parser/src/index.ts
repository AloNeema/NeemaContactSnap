import { parsePhoneNumberFromString } from "libphonenumber-js";
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
// The final dot-segment must be an alphabetic TLD so dotted phone numbers
// (561.555.9900) and currency amounts (500.00) never read as websites.
const urlRegex = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s,;)]*)?/gi;
const linkedInRegex = /\b(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company)\/[^\s,;)]+/i;
const phoneCandidateRegex = /(?:(?:mobile|cellular|cell|direct|office|work|phone|tel|fax|ph|[dcmotfw])[\s:.-]{1,3})?\(?\+?\d[\d\s().-]{6,}\d(?:\s*(?:x|ext\.?|extension)[\s:.]*\d+)?/gi;
const phoneLabelRegex = /^(mobile|cellular|cell|direct|office|work|phone|tel|fax|ph|[dcmotfw])[\s:.-]{1,3}/i;
const streetRegex = /\b(?:P\.?O\.?\s+Box\s+\d+|\d{1,6}\s+[A-Za-z0-9.' -]+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Highway|Hwy\.?|Court|Ct\.?|Place|Pl\.?|Circle|Cir\.?|Parkway|Pkwy\.?|Terrace|Ter\.?|Broadway|Plaza|Square|Sq\.?|Suite|Ste\.?|Floor|Fl\.?))\b[^\n|]*/i;
// City lines must start with a letter and carry a real postal-code shape so
// street lines like "1200 N. Federal Hwy, Suite 200" cannot match.
const cityStateRegex = /^([A-Z][A-Za-z .'-]+),\s*([A-Z]{2}|[A-Za-z .'-]+)\s+(\d{5}(?:-\d{4})?|[A-Z0-9][A-Z0-9 -]{2,9}\d)$/;
const headerLineRegex = /^(?:from|to|cc|bcc|sent|date|subject|reply-to|fwd?|re)\s*:/i;
const emailHeaderNameRegex = /^(?:from|reply-to)\s*:\s*"?([^"<\n]+?)"?\s*<\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*>/gim;
const bareNameEmailRegex = /^"?([^"<\n:@]+?)"?\s*<\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s*>/gim;
const signOffRegex = /^(?:thanks|thank you|many thanks|best|all the best|best regards|kind regards|warm regards|regards|sincerely|cheers|talk soon|warmly|respectfully|take care)[,!.]?$/i;
const nameLabelRegex = /^(?:contact|attn|name)\s*[:\-]\s*/i;
const credentialSuffixRegex = /,\s*(?:mba|cpa|phd|ph\.?d\.?|md|esq\.?|jd|cfa|cfp|pmp|pe|rn|jr\.?|sr\.?|ii|iii|iv)\b\.?/gi;
const nameRegex = /^\p{Lu}[\p{L}.'’-]+(?:\s+\p{Lu}[\p{L}.'’-]+){1,3}$/u;
const allCapsNameRegex = /^\p{Lu}[\p{Lu} .'’-]+$/u;
const forwardedMarkerRegex = /-*\s*(?:begin )?forwarded message\s*-*/i;
const quotedReplyLineRegex = /^(?:>|On .{4,80} wrote:?\s*$)/i;
const disposableDomainWords = ["gmail", "icloud", "outlook", "hotmail", "yahoo", "proton", "me", "aol"];

// Common English nickname groups for duplicate matching (Bob ↔ Robert).
const nicknameGroups: string[][] = [
  ["robert", "rob", "bob", "bobby"],
  ["william", "will", "bill", "billy"],
  ["michael", "mike"],
  ["james", "jim", "jimmy"],
  ["elizabeth", "liz", "beth", "lizzie"],
  ["katherine", "kate", "katie", "kathy"],
  ["thomas", "tom", "tommy"],
  ["anthony", "tony"],
  ["andrew", "andy", "drew"],
  ["christopher", "chris"],
  ["daniel", "dan", "danny"],
  ["david", "dave"],
  ["edward", "ed", "eddie"],
  ["gregory", "greg"],
  ["jeffrey", "jeff"],
  ["joseph", "joe", "joey"],
  ["jonathan", "jon"],
  ["john", "jack", "johnny"],
  ["matthew", "matt"],
  ["nicholas", "nick"],
  ["patrick", "pat"],
  ["peter", "pete"],
  ["richard", "rick", "rich"],
  ["ronald", "ron"],
  ["samuel", "sam"],
  ["steven", "steve"],
  ["stephen", "steve"],
  ["susan", "sue"],
  ["theodore", "ted"],
  ["margaret", "maggie", "meg", "peggy"],
  ["jennifer", "jen", "jenny"],
  ["rebecca", "becky"],
  ["alexander", "alex"],
  ["benjamin", "ben"],
  ["charles", "charlie", "chuck"],
  ["timothy", "tim"],
  ["kenneth", "ken"],
  ["lawrence", "larry"],
  ["donald", "don"],
  ["raymond", "ray"],
  ["frederick", "fred"],
  ["victoria", "vicky"],
  ["deborah", "deb", "debbie"],
  ["pamela", "pam"],
  ["cynthia", "cindy"],
  ["sandra", "sandy"]
];

const nicknameCanonical = new Map<string, string>();
for (const group of nicknameGroups) {
  // Merge overlapping groups (e.g. "steve" appears under both Steven and
  // Stephen) so every variant resolves to a single canonical form.
  const existing = group.map((name) => nicknameCanonical.get(name)).find(Boolean);
  const canonical = existing ?? group[0];
  for (const name of group) nicknameCanonical.set(name, canonical);
}

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
  "officer",
  "executive",
  "vp",
  "vice president",
  "head of"
];

const titleWordRegex = new RegExp(`\\b(?:${titleWords.join("|")})\\b`, "i");

// A company line must END with one of these tokens. Substring matching caused
// lines like "Subject: RE: Working capital application" to become companies.
const companySuffixRegex = /\b(?:inc|llc|l\.l\.c|ltd|corp|corporation|company|co|gmbh|ag|plc|sa|sas|bv|oy|ab|srl|pty|kk|group|partners|studios?|labs?|systems|solutions|capital|ventures|holdings|advisors|associates|agency|bank|financial|funding|consulting|technologies|tech|software|media)\.?$/i;

// Weighted overall confidence: missing required fields drag the score down so
// non-contact text can no longer score high off incidental matches.
const confidenceWeights: Record<string, number> = {
  fullName: 0.3,
  emails: 0.3,
  phones: 0.2,
  company: 0.1,
  title: 0.1
};

export function parseContact(input: ParseContactInput): ParsedContact {
  const sourceText = input.text.trim();
  const warnings: string[] = [];
  const fieldEvidence: Record<string, FieldEvidence> = {};
  const fieldConfidence: Record<string, number> = {};

  if (!sourceText) {
    return emptyContact(input.text, input.source, ["No contact text was provided."]);
  }

  const headerName = extractHeaderName(sourceText);
  const segments = toSegments(sourceText);

  const emails = orderEmails(unique(sourceText.match(emailRegex) ?? []).map((email) => email.toLowerCase()), headerName?.email);
  const phones = extractPhones(sourceText);
  const urls = extractUrls(sourceText);
  const linkedinUrl = urls.find((url) => linkedInRegex.test(url));
  const website = urls.find((url) => !/linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com/i.test(url));
  const address = extractAddress(segments);
  const fullName = headerName?.name ?? extractName(segments, emails);
  const { firstName, lastName } = splitName(fullName);
  const { title, companyHint, titleSourceSegment } = extractTitle(segments, fullName);
  const company = extractCompany(segments, emails, titleSourceSegment, fullName, companyHint);
  const sourceEmailDomain = emails[0]?.split("@")[1];

  addEvidence(sourceText, fieldEvidence, fieldConfidence, "emails", emails.join(", "), emails[0] ?? "", emails.length ? 0.98 : 0, "Matched a valid email address pattern.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "phones", phones.map((phone) => phone.value).join(", "), phones[0]?.evidence ?? "", phones.length ? phoneAggregateConfidence(phones) : 0, "Matched and validated phone numbers, then classified labels such as mobile, office, or fax.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "fullName", fullName, fullName, fullNameConfidence(fullName, emails, Boolean(headerName?.name)), headerName?.name ? "Took the display name from an email header." : "Selected the strongest person-name line or inferred it from the email local part.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "title", title, title, title ? titleConfidence(title) : 0, "Matched a job-title keyword on a short signature line.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "company", company, company, company ? companyConfidence(company, emails) : 0, "Selected an organization-looking line or inferred the company from the email domain.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "website", website, website, website ? 0.86 : 0, "Matched a URL that was not a social profile.");
  addEvidence(sourceText, fieldEvidence, fieldConfidence, "linkedinUrl", linkedinUrl, linkedinUrl, linkedinUrl ? 0.94 : 0, "Matched a LinkedIn profile or company URL.");
  if (address) {
    addEvidence(sourceText, fieldEvidence, fieldConfidence, "address", Object.values(address).filter(Boolean).join(", "), Object.values(address).filter(Boolean).join(", "), addressConfidence(address), "Matched a street line and city/state/postal line.");
  }

  if (!emails.length) warnings.push("No email address was detected. Add one before saving to avoid creating an unusable contact.");
  if (!fullName) warnings.push("No confident person name was detected. Review the name field before saving.");
  if (countLikelyContacts(sourceText) > 1) warnings.push("Multiple contacts may be present. Choose one contact or create each separately before saving.");

  const confidence = round(
    Object.entries(confidenceWeights).reduce((sum, [field, weight]) => sum + weight * (fieldConfidence[field] ?? 0), 0)
  );

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
    notes: buildNotes(segments),
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
  const likelyChunks = splitContactChunks(text);
  if (likelyChunks.length <= 1) return [];
  return likelyChunks.map((chunk) => parseContact({ text: chunk, source: "unknown" }));
}

function splitContactChunks(text: string): string[] {
  const chunks = text
    .split(/\n\s*(?:-{3,}|_{3,}|={3,})\s*\n|(?=\n[A-Z][a-z]+ [A-Z][a-z]+(?:\s*\n)(?:[^\n@]+)?\n?[A-Z0-9._%+-]+@)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 8);
  return chunks.filter((chunk) => (chunk.match(emailRegex) ?? []).length || (chunk.match(phoneCandidateRegex) ?? []).length);
}

// Cheap chunk count used inside parseContact for the multi-contact warning,
// so parseContact and detectMultipleContacts are no longer mutually recursive.
function countLikelyContacts(text: string): number {
  return splitContactChunks(text).length;
}

export function findDuplicateContacts(candidate: ParsedContact, existing: ParsedContact[]): DuplicateMatch[] {
  return existing
    .map((contact) => {
      const reasons: string[] = [];
      let score = 0;
      const candidateEmails = new Set(candidate.emails.map(normalizeEmail));
      const contactEmails = new Set(contact.emails.map(normalizeEmail));
      if ([...candidateEmails].some((email) => contactEmails.has(email))) {
        // An exact email match is the strongest identity signal and should
        // recommend updating the existing contact on its own.
        score += 0.85;
        reasons.push("matching email");
      }

      const candidatePhones = new Set(candidate.phones.map((phone) => normalizePhone(phone.value)).filter(Boolean));
      const contactPhones = new Set(contact.phones.map((phone) => normalizePhone(phone.value)).filter(Boolean));
      if ([...candidatePhones].some((phone) => contactPhones.has(phone))) {
        score += 0.25;
        reasons.push("matching phone");
      }

      if (candidate.fullName && contact.fullName && personNamesMatch(candidate.fullName, contact.fullName)) {
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

// Nickname-aware, typo-tolerant person-name comparison for duplicate matching.
export function personNamesMatch(a: string, b: string): boolean {
  if (normalizeName(a) === normalizeName(b)) return true;
  const aParts = a.toLowerCase().split(/\s+/).map(normalizeName).filter(Boolean);
  const bParts = b.toLowerCase().split(/\s+/).map(normalizeName).filter(Boolean);
  if (aParts.length < 2 || bParts.length < 2) return false;
  const [aFirst, aLast] = [aParts[0], aParts[aParts.length - 1]];
  const [bFirst, bLast] = [bParts[0], bParts[bParts.length - 1]];
  const lastMatch = aLast === bLast || withinOneEdit(aLast, bLast);
  if (!lastMatch) return false;
  const aCanon = nicknameCanonical.get(aFirst) ?? aFirst;
  const bCanon = nicknameCanonical.get(bFirst) ?? bFirst;
  if (aCanon === bCanon || withinOneEdit(aCanon, bCanon)) return true;
  // Initial vs full first name: "J Smith" ↔ "Jordan Smith".
  return (aFirst.length === 1 || bFirst.length === 1) && aFirst[0] === bFirst[0];
}

// Single-typo tolerance, only for names long enough that one edit is unlikely
// to turn one real name into a different real name (Dan/Don must not match).
function withinOneEdit(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function extractHeaderName(text: string): { name: string; email: string } | undefined {
  // In a forwarded email the interesting person is the original sender, whose
  // From: line follows the "Forwarded message" marker — not the forwarder.
  const forwardedMarker = text.match(forwardedMarkerRegex);
  const searchText = forwardedMarker ? text.slice((forwardedMarker.index ?? 0) + forwardedMarker[0].length) : text;
  for (const regex of [emailHeaderNameRegex, bareNameEmailRegex]) {
    regex.lastIndex = 0;
    const match = regex.exec(searchText);
    if (!match) continue;
    if (/^on\b/i.test(match[1])) continue;
    const name = cleanNameCandidate(match[1]);
    if (name && nameRegex.test(name)) {
      return { name, email: match[2].toLowerCase() };
    }
  }
  return undefined;
}

function orderEmails(emails: string[], headerEmail?: string): string[] {
  if (!headerEmail || !emails.includes(headerEmail)) return emails;
  return [headerEmail, ...emails.filter((email) => email !== headerEmail)];
}

// Split lines and pipe/bullet-separated segments so signatures like
// "John Smith | Senior Loan Officer | Quick Capital Funding" classify per part.
function toSegments(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isDisclaimerLine(line) && !headerLineRegex.test(line) && !quotedReplyLineRegex.test(line))
    .flatMap((line) => line.split(/\s*[|•·]\s*|\s+[–—]\s+/))
    .map((segment) => segment.trim())
    .filter(Boolean);
}

// Emails are blanked out first so local parts ("sarah.obrien@…") and domains
// that only appear inside an address can never be misread as websites.
function extractUrls(text: string): string[] {
  const textWithoutEmails = text.replace(emailRegex, " ");
  return unique(textWithoutEmails.match(urlRegex) ?? [])
    .map(cleanUrl)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function extractPhones(text: string): ParsedPhone[] {
  const results: ParsedPhone[] = [];
  const seen = new Set<string>();
  for (const raw of unique(text.match(phoneCandidateRegex) ?? [])) {
    const labelMatch = raw.match(phoneLabelRegex);
    const label = labelMatch?.[1]?.toLowerCase();
    const numberText = raw.replace(phoneLabelRegex, "").trim();
    const parsed = parsePhoneNumberFromString(numberText, "US");
    if (!parsed || !parsed.isPossible()) continue;
    const key = parsed.number;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = phoneTypeFromLabel(label);
    results.push({
      type,
      value: parsed.country === "US" ? parsed.formatNational() : parsed.formatInternational(),
      confidence: round((parsed.isValid() ? 0.9 : 0.6) + (type === "unknown" ? 0 : 0.05)),
      evidence: raw.trim()
    });
  }
  return results;
}

function phoneTypeFromLabel(label?: string): PhoneType {
  if (!label) return "unknown";
  if (["mobile", "cell", "cellular", "m", "c"].includes(label)) return "mobile";
  if (["fax", "f"].includes(label)) return "fax";
  if (["office", "work", "direct", "phone", "tel", "ph", "d", "o", "t", "w"].includes(label)) return "office";
  return "unknown";
}

function extractAddress(segments: string[]): ParsedAddress | undefined {
  const streetIndex = segments.findIndex((segment) => streetRegex.test(segment));
  const streetLine = streetIndex >= 0 ? segments[streetIndex].match(streetRegex)?.[0] : undefined;
  // Only look for the city/state/postal line after the street line, so suite
  // numbers on the street line can never be misread as a state and ZIP.
  const citySearchSpace = streetIndex >= 0 ? segments.slice(streetIndex + 1) : segments;
  const cityStateLine = citySearchSpace.find((segment) => cityStateRegex.test(segment));
  if (!streetLine && !cityStateLine) return undefined;

  const cityMatch = cityStateLine?.match(cityStateRegex);
  return {
    street: streetLine,
    city: cityMatch?.[1],
    state: cityMatch?.[2],
    postalCode: cityMatch?.[3],
    country: inferCountry(segments)
  };
}

function cleanNameCandidate(value: string): string {
  return value
    .replace(nameLabelRegex, "")
    .replace(credentialSuffixRegex, "")
    .replace(/[,\s]+$/, "")
    .trim();
}

function extractName(segments: string[], emails: string[]): string | undefined {
  for (const segment of segments) {
    if (segment.length > 48 || segment.includes("@") || /https?:|www\.|linkedin\.com/i.test(segment)) continue;
    if (/[0-9]/.test(segment) || signOffRegex.test(segment)) continue;
    let cleaned = cleanNameCandidate(segment);
    if (!cleaned || isTitleLine(cleaned) || isCompanyLine(cleaned)) continue;
    // ALL-CAPS signatures ("JOHN SMITH") — normalize case before matching,
    // since nameRegex alone cannot tell all-caps from normal capitalization.
    if (cleaned.includes(" ") && allCapsNameRegex.test(cleaned)) {
      cleaned = titleCase(cleaned);
    }
    if (nameRegex.test(cleaned)) return cleaned;
  }

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

function extractTitle(segments: string[], fullName?: string): { title?: string; companyHint?: string; titleSourceSegment?: string } {
  const line = segments.find((segment) => segment !== fullName && segment.length < 80 && isTitleLine(segment));
  if (!line) return {};
  // LinkedIn-style "Director of Business Development at Acme Financial Group"
  const atSplit = line.split(/\s+at\s+/i);
  if (atSplit.length === 2 && titleWordRegex.test(atSplit[0])) {
    return { title: atSplit[0].trim(), companyHint: atSplit[1].trim(), titleSourceSegment: line };
  }
  return { title: line, titleSourceSegment: line };
}

function extractCompany(segments: string[], emails: string[], titleSourceSegment?: string, fullName?: string, companyHint?: string): string | undefined {
  const companyLine = segments.find((segment) => segment !== titleSourceSegment && segment !== fullName && isCompanyLine(segment));
  if (companyLine) return companyLine;
  if (companyHint) return companyHint;
  const domain = emails[0]?.split("@")[1]?.split(".")[0];
  if (domain && !disposableDomainWords.includes(domain)) return titleCase(domain.replace(/[-_]+/g, " "));
  return undefined;
}

function isTitleLine(line: string): boolean {
  if (/\d{3,}/.test(line) || line.includes("@") || /https?:|www\./i.test(line)) return false;
  return titleWordRegex.test(line);
}

function isCompanyLine(line: string): boolean {
  if (line.length > 60 || line.includes("@") || /https?:|www\./i.test(line) || /©|copyright/i.test(line)) return false;
  return companySuffixRegex.test(line);
}

function isDisclaimerLine(line: string): boolean {
  return /confidential|intended recipient|privileged|unsubscribe|legal notice|please consider the environment/i.test(line);
}

function buildNotes(segments: string[]): string | undefined {
  const useful = segments.filter((segment) => /assistant|calendar|timezone|pronouns|booking/i.test(segment));
  return useful.length ? useful.join("\n") : undefined;
}

function phoneAggregateConfidence(phones: ParsedPhone[]): number {
  return round(phones.reduce((sum, phone) => sum + phone.confidence, 0) / phones.length);
}

function fullNameConfidence(fullName: string | undefined, emails: string[], fromHeader: boolean): number {
  if (!fullName) return 0;
  if (fromHeader) return 0.95;
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
  return companySuffixRegex.test(company) ? 0.84 : 0.72;
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

function inferCountry(segments: string[]): string | undefined {
  return segments.find((segment) => /^(United States|USA|Canada|United Kingdom|UK|Australia|Germany|France)$/i.test(segment));
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
  normalizePhone,
  personNamesMatch
};
