import { describe, expect, it } from "vitest";
import { detectMultipleContacts, findDuplicateContacts, parseContact } from "../src/index";
import { sampleSignatures } from "../seed/signatures";

describe("parseContact", () => {
  it("extracts email addresses", () => {
    const contact = parseContact({ text: sampleSignatures.simpleCorporate, source: "email_signature" });
    expect(contact.emails).toEqual(["jordan.lee@northstarsystems.com"]);
    expect(contact.sourceEmailDomain).toBe("northstarsystems.com");
    expect(contact.fieldEvidence.emails.rationale).toContain("email address");
    expect(contact.fieldEvidence.emails.sourceLine).toBe(4);
  });

  it("extracts and classifies phone numbers", () => {
    const contact = parseContact({ text: sampleSignatures.multiplePhones });
    expect(contact.phones.map((phone) => phone.type)).toEqual(expect.arrayContaining(["mobile", "office", "fax"]));
    expect(contact.phones).toHaveLength(3);
  });

  it("parses first and last name", () => {
    const contact = parseContact({ text: sampleSignatures.simpleCorporate });
    expect(contact.fullName).toBe("Jordan Lee");
    expect(contact.firstName).toBe("Jordan");
    expect(contact.lastName).toBe("Lee");
  });

  it("detects title and company", () => {
    const contact = parseContact({ text: sampleSignatures.simpleCorporate });
    expect(contact.title).toBe("Senior Account Executive");
    expect(contact.company).toBe("Northstar Systems Inc.");
  });

  it("parses address fields", () => {
    const contact = parseContact({ text: sampleSignatures.address });
    expect(contact.address?.street).toContain("120 Market Street");
    expect(contact.address?.city).toBe("San Francisco");
    expect(contact.address?.state).toBe("CA");
    expect(contact.address?.postalCode).toBe("94105");
  });

  it("detects duplicate contacts", () => {
    const candidate = parseContact({ text: sampleSignatures.simpleCorporate });
    const matches = findDuplicateContacts(candidate, [
      parseContact({ text: "Jordan Lee\nNorthstar Systems Inc.\njordan.lee@northstarsystems.com\n415-555-0198" })
    ]);
    expect(matches[0].score).toBeGreaterThanOrEqual(0.8);
    expect(matches[0].reasons).toContain("matching email");
    expect(matches[0].recommendedAction).toBe("update");
  });

  it("detects multiple contacts", () => {
    const contacts = detectMultipleContacts(sampleSignatures.twoPeople);
    expect(contacts).toHaveLength(2);
    expect(contacts.map((contact) => contact.emails[0])).toEqual(["priya@orbitgroup.com", "leo@orbitgroup.com"]);
  });

  it("handles empty input", () => {
    const contact = parseContact({ text: "" });
    expect(contact.confidence).toBe(0);
    expect(contact.warnings[0]).toContain("No contact text");
  });

  it("infers company from domain when name is missing", () => {
    const contact = parseContact({ text: sampleSignatures.missingName });
    expect(contact.company).toBe("Acme Capital");
    expect(contact.emails[0]).toBe("hello@acme-capital.com");
  });

  it("uses weaker duplicate scores for name-only collisions", () => {
    const candidate = parseContact({ text: "Jordan Lee\nOrbit Group\njordan@orbit.example\n555-111-2222" });
    const matches = findDuplicateContacts(candidate, [
      parseContact({ text: "Jordan Lee\nAnother Company\njordan@another.example\n555-333-4444" })
    ]);
    expect(matches).toHaveLength(0);
  });

  it("adds actionable warnings for invalid input", () => {
    const contact = parseContact({ text: "Call the office next week" });
    expect(contact.warnings.join(" ")).toContain("before saving");
  });
});
