import { describe, expect, it } from "vitest";
import { findDuplicateContacts, parseContact, personNamesMatch } from "../src/index";

describe("real-world formats", () => {
  it("extracts the display name and email from a From: header", () => {
    const contact = parseContact({
      text: `From: Sarah O'Brien <sarah.obrien@quick-capitalfunding.com>
Sent: Monday, July 6, 2026 9:14 AM
To: Nick Neema
Subject: RE: Working capital application`,
      source: "email_signature"
    });
    expect(contact.fullName).toBe("Sarah O'Brien");
    expect(contact.lastName).toBe("O'Brien");
    expect(contact.emails[0]).toBe("sarah.obrien@quick-capitalfunding.com");
    expect(contact.company).not.toContain("Subject");
    expect(contact.website).toBeUndefined();
  });

  it("parses pipe-separated signature lines", () => {
    const contact = parseContact({
      text: `John Smith | Senior Loan Officer | Quick Capital Funding
D: (555) 234-5678 | C: (555) 876-5432
john@quickcapital.com | www.quickcapital.com`
    });
    expect(contact.fullName).toBe("John Smith");
    expect(contact.title).toBe("Senior Loan Officer");
    expect(contact.company).toBe("Quick Capital Funding");
    expect(contact.phones.map((phone) => phone.type)).toEqual(expect.arrayContaining(["office", "mobile"]));
  });

  it("keeps leading parentheses on phone numbers and classifies D:/C: labels", () => {
    const contact = parseContact({ text: "Anna Kim\nD: (415) 555-0100\nanna@kimlaw.com" });
    expect(contact.phones[0].value).toBe("(415) 555-0100");
    expect(contact.phones[0].type).toBe("office");
  });

  it("does not extract dotted phone numbers or amounts as websites", () => {
    const contact = parseContact({
      text: `Contact: Bill Perry
1200 N. Federal Hwy, Suite 200
Boca Raton, FL 33432
Ph 561.555.9900 ext. 204
bperry@floridafunding.net`
    });
    expect(contact.website).toBeUndefined();
    expect(contact.fullName).toBe("Bill Perry");
    expect(contact.phones[0].value).toContain("(561) 555-9900");
    expect(contact.address?.street).toContain("1200 N. Federal Hwy");
    expect(contact.address?.city).toBe("Boca Raton");
    expect(contact.address?.state).toBe("FL");
    expect(contact.address?.postalCode).toBe("33432");
  });

  it("rejects account numbers and invoice text with near-zero confidence", () => {
    const contact = parseContact({
      text: `Invoice #2024-0455
Due date: 07/15/2026
Amount: $12,500.00
Account 4485-9921-0034`
    });
    expect(contact.phones).toHaveLength(0);
    expect(contact.title).toBeUndefined();
    expect(contact.website).toBeUndefined();
    expect(contact.confidence).toBeLessThan(0.3);
  });

  it("handles non-ASCII names and international companies", () => {
    const contact = parseContact({
      text: `Hans Müller
Geschäftsführer
Müller GmbH
+49 30 901820
hans.mueller@mueller-gmbh.de`
    });
    expect(contact.fullName).toBe("Hans Müller");
    expect(contact.company).toBe("Müller GmbH");
    expect(contact.phones[0].value).toBe("+49 30 901820");
  });

  it("strips credential suffixes from names", () => {
    const contact = parseContact({
      text: `Robert Chang, MBA, CPA
Chief Financial Officer
robert.chang@example-corp.com
Tel: 212-555-8899`
    });
    expect(contact.fullName).toBe("Robert Chang");
    expect(contact.title).toBe("Chief Financial Officer");
  });

  it("splits LinkedIn-style 'title at company' lines", () => {
    const contact = parseContact({
      text: `Jane Doe
Director of Business Development at Acme Financial Group
jane.doe@acmefg.com`
    });
    expect(contact.title).toBe("Director of Business Development");
    expect(contact.company).toBe("Acme Financial Group");
  });

  it("ignores sign-off lines when picking a name", () => {
    const contact = parseContact({
      text: `Best Regards

Mike Johnson
VP of Sales
BlueRock Partners LLC
mike@bluerock.com`
    });
    expect(contact.fullName).toBe("Mike Johnson");
    expect(contact.company).toBe("BlueRock Partners LLC");
  });

  it("does not treat lines containing suffix words mid-sentence as companies", () => {
    const contact = parseContact({
      text: "Please review the working capital application we discussed.\njordan@example.com"
    });
    expect(contact.company).not.toContain("working capital");
  });

  it("prefers the original sender in a forwarded email", () => {
    const contact = parseContact({
      text: `From: Nick Neema <nick@quick-capitalfunding.com>
To: Team

FYI, good lead below.

---------- Forwarded message ---------
From: Dana White <dana@fundco.com>
Date: Mon, Jul 6, 2026 at 8:12 AM
Subject: Working capital inquiry
To: nick@quick-capitalfunding.com`
    });
    expect(contact.fullName).toBe("Dana White");
    expect(contact.emails[0]).toBe("dana@fundco.com");
  });

  it("ignores quoted reply lines and 'On ... wrote:' attributions", () => {
    const contact = parseContact({
      text: `Sounds good, see you then.

Priya Shah
Director of Partnerships
priya@orbitgroup.com

On Mon Jul 6 2026 Leo Martin <leo@orbitgroup.com> wrote:
> Leo Martin
> Head of Product`
    });
    expect(contact.fullName).toBe("Priya Shah");
    expect(contact.title).toBe("Director of Partnerships");
  });

  it("normalizes ALL-CAPS names", () => {
    const contact = parseContact({
      text: `JOHN SMITH
CEO
john.smith@acme-funding.com`
    });
    expect(contact.fullName).toBe("John Smith");
  });
});

describe("personNamesMatch", () => {
  it("matches nicknames with the same last name", () => {
    expect(personNamesMatch("Bob Smith", "Robert Smith")).toBe(true);
    expect(personNamesMatch("Mike Johnson", "Michael Johnson")).toBe(true);
    expect(personNamesMatch("Nick Neema", "Nicholas Neema")).toBe(true);
  });

  it("tolerates a single typo in long names but not short ones", () => {
    expect(personNamesMatch("Jordan Smith", "Jordon Smith")).toBe(true);
    expect(personNamesMatch("Dan Brown", "Don Brown")).toBe(false);
  });

  it("matches a first initial against a full first name", () => {
    expect(personNamesMatch("J Smith", "Jordan Smith")).toBe(true);
  });

  it("rejects different people", () => {
    expect(personNamesMatch("Bob Smith", "Robert Jones")).toBe(false);
    expect(personNamesMatch("Jane Doe", "Joan Roe")).toBe(false);
  });

  it("feeds duplicate detection", () => {
    const candidate = parseContact({ text: "Bob Smith\nAcme Capital\nbob@acmecap.com\n(415) 555-0100" });
    const matches = findDuplicateContacts(candidate, [
      parseContact({ text: "Robert Smith\nAcme Capital\nrobert.smith@acmecap.com\n(415) 555-0100" })
    ]);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].reasons).toContain("matching name");
  });
});
