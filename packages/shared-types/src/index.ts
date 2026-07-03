export type CaptureSource =
  | "clipboard"
  | "manual_paste"
  | "email_signature"
  | "business_card"
  | "linkedin_profile"
  | "unknown";

export type ParseContactInput = {
  text: string;
  source?: CaptureSource;
};

export type PhoneType = "mobile" | "office" | "fax" | "unknown";

export type ParsedPhone = {
  type: PhoneType;
  value: string;
  confidence: number;
  evidence?: string;
};

export type ParsedAddress = {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type FieldEvidence = {
  value: string;
  confidence: number;
  evidence: string;
  sourceLine?: number;
  startOffset?: number;
  endOffset?: number;
  rationale: string;
};

export type ParsedContact = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  emails: string[];
  phones: ParsedPhone[];
  website?: string;
  linkedinUrl?: string;
  address?: ParsedAddress;
  notes?: string;
  sourceText: string;
  source?: CaptureSource;
  sourceEmailDomain?: string;
  dateCaptured: string;
  confidence: number;
  fieldConfidence: Record<string, number>;
  fieldEvidence: Record<string, FieldEvidence>;
  warnings: string[];
};

export type DuplicateMatch = {
  contact: ParsedContact;
  score: number;
  reasons: string[];
  recommendedAction: "merge" | "update" | "create_new";
};

export type IntegrationProvider = "google" | "microsoft" | "crm";

export type SaveContactResult = {
  provider: IntegrationProvider;
  id: string;
  url?: string;
  created: boolean;
  duplicate?: DuplicateMatch;
};

export type ProviderSaveError = {
  provider: IntegrationProvider;
  code:
    | "not_connected"
    | "missing_scope"
    | "token_expired"
    | "network_error"
    | "duplicate_requires_review"
    | "provider_rejected"
    | "unknown";
  message: string;
  nextStep: string;
};

export type ImportLogEntry = {
  id: string;
  contact: ParsedContact;
  source: CaptureSource;
  savedTo: IntegrationProvider[];
  action: "created" | "updated" | "merged" | "reviewed";
  providerIds: Partial<Record<IntegrationProvider, string>>;
  createdAt: string;
  undoAvailable: boolean;
  undoneAt?: string;
};

export type ContactDestinationSettings = {
  googleConnected: boolean;
  microsoftConnected: boolean;
  defaultDestination: "google" | "microsoft" | "both" | "review_only";
};

export type PrivacySettings = {
  aiExtractionEnabled: boolean;
  askBeforeSendingToAi: boolean;
  clipboardMonitoringEnabled: boolean;
  localOnlyMode: boolean;
};
