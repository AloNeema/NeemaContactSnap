// Ground-truth evaluation corpus. Each entry's `expected` values are what a
// correct parser SHOULD produce — not what the current parser produces.
// Add real-world (anonymized) samples here whenever the parser gets something
// wrong; the eval harness turns them into a per-field accuracy score.

export type CorpusExpectation = {
  fullName?: string;
  title?: string;
  company?: string;
  email?: string;
  phoneCount?: number;
  website?: string;
  city?: string;
  state?: string;
  postalCode?: string;
};

export type CorpusEntry = {
  id: string;
  text: string;
  expected: CorpusExpectation;
};

export const evalCorpus: CorpusEntry[] = [
  {
    id: "corporate-basic",
    text: `Jordan Lee
Senior Account Executive
Northstar Systems Inc.
jordan.lee@northstarsystems.com
(415) 555-0198
www.northstarsystems.com`,
    expected: {
      fullName: "Jordan Lee",
      title: "Senior Account Executive",
      company: "Northstar Systems Inc.",
      email: "jordan.lee@northstarsystems.com",
      phoneCount: 1,
      website: "https://www.northstarsystems.com"
    }
  },
  {
    id: "pipe-separated",
    text: `John Smith | Senior Loan Officer | Quick Capital Funding
D: (555) 234-5678 | C: (555) 876-5432
john@quickcapital.com | www.quickcapital.com`,
    expected: {
      fullName: "John Smith",
      title: "Senior Loan Officer",
      company: "Quick Capital Funding",
      email: "john@quickcapital.com",
      phoneCount: 2
    }
  },
  {
    id: "email-header",
    text: `From: Sarah O'Brien <sarah.obrien@quick-capitalfunding.com>
Sent: Monday, July 6, 2026 9:14 AM
To: Nick Neema
Subject: RE: Working capital application`,
    expected: {
      fullName: "Sarah O'Brien",
      email: "sarah.obrien@quick-capitalfunding.com"
    }
  },
  {
    id: "forwarded-message",
    text: `From: Nick Neema <nick@quick-capitalfunding.com>

FYI, good lead below.

---------- Forwarded message ---------
From: Dana White <dana@fundco.com>
Date: Mon, Jul 6, 2026 at 8:12 AM
Subject: Working capital inquiry
To: nick@quick-capitalfunding.com`,
    expected: {
      fullName: "Dana White",
      email: "dana@fundco.com"
    }
  },
  {
    id: "multi-phone-labels",
    text: `Avery Patel
VP, Customer Success | Atlas Labs
M: +1 646 555 0142
Office: 212.555.0177
Fax: 212.555.0101
avery@atlaslabs.io`,
    expected: {
      fullName: "Avery Patel",
      company: "Atlas Labs",
      email: "avery@atlaslabs.io",
      phoneCount: 3
    }
  },
  {
    id: "full-address",
    text: `Mina Chen
Principal Designer
Brightline Studio LLC
120 Market Street, Suite 400
San Francisco, CA 94105
United States
mina.chen@brightline.studio
M: +1 415 555 0184`,
    expected: {
      fullName: "Mina Chen",
      title: "Principal Designer",
      company: "Brightline Studio LLC",
      email: "mina.chen@brightline.studio",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      phoneCount: 1
    }
  },
  {
    id: "highway-suite-address",
    text: `Contact: Bill Perry
1200 N. Federal Hwy, Suite 200
Boca Raton, FL 33432
Ph 561.555.9900 ext. 204
bperry@floridafunding.net`,
    expected: {
      fullName: "Bill Perry",
      email: "bperry@floridafunding.net",
      city: "Boca Raton",
      state: "FL",
      postalCode: "33432",
      phoneCount: 1
    }
  },
  {
    id: "credentials-suffix",
    text: `Robert Chang, MBA, CPA
Chief Financial Officer
robert.chang@example-corp.com
Tel: 212-555-8899`,
    expected: {
      fullName: "Robert Chang",
      title: "Chief Financial Officer",
      email: "robert.chang@example-corp.com",
      phoneCount: 1
    }
  },
  {
    id: "linkedin-copy",
    text: `Jane Doe
Director of Business Development at Acme Financial Group
Greater New York City Area
jane.doe@acmefg.com`,
    expected: {
      fullName: "Jane Doe",
      title: "Director of Business Development",
      company: "Acme Financial Group",
      email: "jane.doe@acmefg.com"
    }
  },
  {
    id: "international-german",
    text: `Hans Müller
Geschäftsführer
Müller GmbH
+49 30 901820
hans.mueller@mueller-gmbh.de`,
    expected: {
      fullName: "Hans Müller",
      company: "Müller GmbH",
      email: "hans.mueller@mueller-gmbh.de",
      phoneCount: 1
    }
  },
  {
    id: "all-caps",
    text: `JOHN SMITH
CEO
ACME FUNDING LLC
john.smith@acmefunding.com
917-555-3300`,
    expected: {
      fullName: "John Smith",
      email: "john.smith@acmefunding.com",
      phoneCount: 1
    }
  },
  {
    id: "signoff-first",
    text: `Thanks!

Mike Johnson
VP of Sales
BlueRock Partners LLC
mike@bluerock.com
(303) 555-2211`,
    expected: {
      fullName: "Mike Johnson",
      title: "VP of Sales",
      company: "BlueRock Partners LLC",
      email: "mike@bluerock.com",
      phoneCount: 1
    }
  },
  {
    id: "lowercase-name",
    text: `best,
maria gonzalez
account manager
maria.gonzalez@fundingco.com
917-555-1234`,
    expected: {
      fullName: "Maria Gonzalez",
      email: "maria.gonzalez@fundingco.com",
      phoneCount: 1
    }
  },
  {
    id: "mobile-signature",
    text: `Tom Rivera
646-555-8080
Sent from my iPhone`,
    expected: {
      fullName: "Tom Rivera",
      phoneCount: 1
    }
  },
  {
    id: "broker-iso",
    text: `Marcus Bell | Funding Advisor
Velocity Business Capital
Direct: (800) 555-4141 x312
marcus.bell@velocitybizcap.com
www.velocitybizcap.com`,
    expected: {
      fullName: "Marcus Bell",
      title: "Funding Advisor",
      company: "Velocity Business Capital",
      email: "marcus.bell@velocitybizcap.com",
      phoneCount: 1,
      website: "https://www.velocitybizcap.com"
    }
  },
  {
    id: "attorney",
    text: `Rachel Stern, Esq.
Partner
Stern & Wallace LLP
1301 Avenue of the Americas
New York, NY 10019
rstern@sternwallace.com
O: (212) 555-7300`,
    expected: {
      fullName: "Rachel Stern",
      title: "Partner",
      email: "rstern@sternwallace.com",
      city: "New York",
      state: "NY",
      postalCode: "10019",
      phoneCount: 1
    }
  },
  {
    id: "disclaimer-footer",
    text: `Sam Rivera
Chief Operating Officer
Helio Partners
sam.rivera@heliopartners.com
This message is confidential and intended only for the recipient.`,
    expected: {
      fullName: "Sam Rivera",
      title: "Chief Operating Officer",
      company: "Helio Partners",
      email: "sam.rivera@heliopartners.com"
    }
  },
  {
    id: "social-links",
    text: `Taylor Morgan
Founder
Signal Works
taylor@signalworks.co
https://www.linkedin.com/in/taylormorgan
https://signalworks.co`,
    expected: {
      fullName: "Taylor Morgan",
      title: "Founder",
      email: "taylor@signalworks.co",
      website: "https://signalworks.co"
    }
  },
  {
    id: "name-email-only",
    text: `Chris Wu <chris.wu@parkstreetcapital.com>`,
    expected: {
      fullName: "Chris Wu",
      email: "chris.wu@parkstreetcapital.com"
    }
  },
  {
    id: "bullet-separated",
    text: `Elena Vasquez • Regional Sales Manager • Summit Equipment Finance
elena.v@summitef.com • C: 480-555-2299`,
    expected: {
      fullName: "Elena Vasquez",
      title: "Regional Sales Manager",
      email: "elena.v@summitef.com",
      phoneCount: 1
    }
  },
  {
    id: "reply-chain",
    text: `Works for me, let's talk Tuesday.

Priya Shah
Director of Partnerships
Orbit Group
priya@orbitgroup.com
555-201-3030

On Mon Jul 6 2026 Leo Martin <leo@orbitgroup.com> wrote:
> Can you do Tuesday?`,
    expected: {
      fullName: "Priya Shah",
      title: "Director of Partnerships",
      company: "Orbit Group",
      email: "priya@orbitgroup.com"
    }
  },
  {
    id: "domain-company-fallback",
    text: `hello@acme-capital.com
Acme Capital
555 302 9090
acme-capital.com`,
    expected: {
      company: "Acme Capital",
      email: "hello@acme-capital.com",
      phoneCount: 1
    }
  },
  {
    id: "realtor",
    text: `Linda Park
Licensed Real Estate Broker
Park Realty Group
Cell: (305) 555-6742
linda@parkrealtygroup.com
9200 Collins Avenue
Miami Beach, FL 33154`,
    expected: {
      fullName: "Linda Park",
      company: "Park Realty Group",
      email: "linda@parkrealtygroup.com",
      city: "Miami Beach",
      state: "FL",
      postalCode: "33154",
      phoneCount: 1
    }
  },
  {
    id: "no-contact-text",
    text: `Invoice #2024-0455
Due date: 07/15/2026
Amount: $12,500.00
Account 4485-9921-0034`,
    expected: {
      phoneCount: 0
    }
  }
];
