import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Archive,
  Check,
  Clipboard,
  Cloud,
  FileText,
  History,
  KeyRound,
  Merge,
  Moon,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sparkles,
  Sun,
  UserPlus
} from "lucide-react";
import { detectMultipleContacts, findDuplicateContacts, parseContact } from "@contactsnap/parser";
import type { DuplicateMatch, ImportLogEntry, IntegrationProvider, ParsedContact, PrivacySettings, ProviderSaveError } from "@contactsnap/shared-types";
import { Button, Field, Input, Meter, StatusPill, Textarea } from "@contactsnap/ui";
import "./styles.css";

const exampleText = `Mina Chen
Principal Designer
Brightline Studio LLC
120 Market Street, Suite 400
San Francisco, CA 94105
United States
mina.chen@brightline.studio
M: +1 415 555 0184
https://www.linkedin.com/in/minachen
brightline.studio`;

type ViewName = "capture" | "history" | "settings";
type Destination = "google" | "microsoft" | "both";
type SaveMode = "create" | "update";
type SaveState = "idle" | "parsing" | "saving";

const storageKeys = {
  history: "contactsnap.history",
  privacy: "contactsnap.privacy",
  connections: "contactsnap.connections"
} as const;

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function loadStoredArray<T>(key: string): T[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode); the app still works in-memory.
  }
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [sourceText, setSourceText] = useState(exampleText);
  const [contact, setContact] = useState<ParsedContact>(() => parseContact({ text: exampleText, source: "manual_paste" }));
  const [history, setHistory] = useState<ImportLogEntry[]>(() => loadStoredArray<ImportLogEntry>(storageKeys.history));
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => loadStored(storageKeys.privacy, {
    aiExtractionEnabled: false,
    askBeforeSendingToAi: true,
    clipboardMonitoringEnabled: false,
    localOnlyMode: true
  }));
  const [{ google: googleConnected, microsoft: microsoftConnected }, setConnections] = useState(() => loadStored(storageKeys.connections, { google: false, microsoft: false }));
  const setGoogleConnected = (value: boolean | ((current: boolean) => boolean)) =>
    setConnections((current) => ({ ...current, google: typeof value === "function" ? value(current.google) : value }));
  const setMicrosoftConnected = (value: boolean | ((current: boolean) => boolean)) =>
    setConnections((current) => ({ ...current, microsoft: typeof value === "function" ? value(current.microsoft) : value }));
  const [selectedView, setSelectedView] = useState<ViewName>("capture");
  const [destination, setDestination] = useState<Destination>("both");
  const [saveMode, setSaveMode] = useState<SaveMode>("create");
  const [selectedEvidence, setSelectedEvidence] = useState("emails");
  const [status, setStatus] = useState<SaveState>("idle");
  const [errors, setErrors] = useState<ProviderSaveError[]>([]);
  const [notice, setNotice] = useState("");

  const activeHistory = useMemo(() => history.filter((entry) => !entry.undoneAt), [history]);
  const duplicateMatches = useMemo(() => findDuplicateContacts(contact, activeHistory.map((entry) => entry.contact)), [contact, activeHistory]);
  const multipleContacts = useMemo(() => detectMultipleContacts(sourceText), [sourceText]);
  const topDuplicate = duplicateMatches[0];

  useEffect(() => persist(storageKeys.history, history), [history]);
  useEffect(() => persist(storageKeys.privacy, privacy), [privacy]);
  useEffect(() => persist(storageKeys.connections, { google: googleConnected, microsoft: microsoftConnected }), [googleConnected, microsoftConnected]);

  function parseText(text: string) {
    setStatus("parsing");
    setErrors([]);
    setNotice("");
    window.setTimeout(() => {
      const parsed = parseContact({ text, source: "manual_paste" });
      setContact(parsed);
      setSelectedEvidence(Object.keys(parsed.fieldEvidence)[0] ?? "emails");
      setSaveMode("create");
      setStatus("idle");
      if (!privacy.localOnlyMode && privacy.askBeforeSendingToAi) {
        setNotice("AI parsing is enabled but this MVP is using the local parser until an AI provider is configured and approved.");
      }
    }, 120);
  }

  function runParse() {
    parseText(sourceText);
  }

  function updateContact<K extends keyof ParsedContact>(field: K, value: ParsedContact[K]) {
    setContact((current) => ({ ...current, [field]: value }));
  }

  function selectDetectedContact(detected: ParsedContact) {
    setContact(detected);
    setSelectedEvidence(Object.keys(detected.fieldEvidence)[0] ?? "emails");
    setSaveMode("create");
    setNotice(`Reviewing ${detected.fullName ?? detected.emails[0] ?? "selected contact"}. Save, then pick the next person.`);
  }

  function destinationProviders(value: Destination): IntegrationProvider[] {
    return value === "both" ? ["google", "microsoft"] : [value];
  }

  function validateProviderReadiness(providers: IntegrationProvider[]): ProviderSaveError[] {
    const providerErrors: ProviderSaveError[] = [];
    providers.forEach((provider) => {
      if (provider === "google" && !googleConnected) {
        providerErrors.push({
          provider,
          code: "not_connected",
          message: "Google Contacts is not connected.",
          nextStep: "Open Settings, connect Google Contacts, then try Save Contact again."
        });
      }
      if (provider === "microsoft" && !microsoftConnected) {
        providerErrors.push({
          provider,
          code: "not_connected",
          message: "Outlook Contacts is not connected.",
          nextStep: "Open Settings, connect Outlook Contacts, then try Save Contact again."
        });
      }
    });
    return providerErrors;
  }

  function saveContact() {
    const providers = destinationProviders(destination);
    const readinessErrors = validateProviderReadiness(providers);
    setErrors(readinessErrors);
    setNotice("");
    if (readinessErrors.length) return;

    setStatus("saving");
    window.setTimeout(() => {
      const mergedContact = saveMode === "update" && topDuplicate ? mergeContacts(topDuplicate.contact, contact) : contact;
      const entry: ImportLogEntry = {
        id: crypto.randomUUID(),
        contact: mergedContact,
        source: contact.source ?? "manual_paste",
        savedTo: providers,
        action: saveMode === "update" ? "updated" : "created",
        providerIds: Object.fromEntries(providers.map((provider) => [provider, `${provider}_${Date.now()}`])),
        createdAt: new Date().toISOString(),
        undoAvailable: true
      };
      setHistory((current) => [entry, ...current]);
      setStatus("idle");
      setSelectedView("history");
      setNotice(saveMode === "update" ? "Existing contact update queued in the import log." : "Contact creation queued in the import log.");
    }, 450);
  }

  function undoLast() {
    setHistory((current) => {
      const index = current.findIndex((entry) => entry.undoAvailable && !entry.undoneAt);
      if (index < 0) return current;
      return current.map((entry, entryIndex) => entryIndex === index ? { ...entry, undoneAt: new Date().toISOString(), undoAvailable: false } : entry);
    });
  }

  return (
    <main className={`app ${theme}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <strong>ContactSnap AI</strong>
            <span>Capture console</span>
          </div>
        </div>
        <nav>
          <button className={selectedView === "capture" ? "active" : ""} onClick={() => setSelectedView("capture")}><Clipboard size={18} />Capture</button>
          <button className={selectedView === "history" ? "active" : ""} onClick={() => setSelectedView("history")}><History size={18} />History</button>
          <button className={selectedView === "settings" ? "active" : ""} onClick={() => setSelectedView("settings")}><Shield size={18} />Settings</button>
        </nav>
        <div className="connection-stack">
          <Connection label="Google" connected={googleConnected} onClick={() => setGoogleConnected((value) => !value)} />
          <Connection label="Outlook" connected={microsoftConnected} onClick={() => setMicrosoftConnected((value) => !value)} />
        </div>
        <Button icon={theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>{selectedView === "capture" ? "Review Contact" : selectedView === "history" ? "Import History" : "Settings"}</h1>
            <p>{contact.fullName ?? "Unresolved contact"} {contact.company ? `at ${contact.company}` : ""}</p>
          </div>
          <div className="topbar-actions">
            <StatusPill tone={privacy.localOnlyMode ? "good" : "warn"}>{privacy.localOnlyMode ? "Local parser" : "AI requested"}</StatusPill>
            <StatusPill tone={topDuplicate ? "warn" : "good"}>{topDuplicate ? "Review duplicate" : "No duplicate"}</StatusPill>
          </div>
        </header>

        {notice ? <div className="notice info"><strong>{notice}</strong></div> : null}

        {selectedView === "capture" ? (
          <CaptureView
            sourceText={sourceText}
            setSourceText={setSourceText}
            contact={contact}
            updateContact={updateContact}
            runParse={runParse}
            parseText={parseText}
            duplicateMatches={duplicateMatches}
            multipleContacts={multipleContacts}
            selectDetectedContact={selectDetectedContact}
            destination={destination}
            setDestination={setDestination}
            saveMode={saveMode}
            setSaveMode={setSaveMode}
            saveContact={saveContact}
            selectedEvidence={selectedEvidence}
            setSelectedEvidence={setSelectedEvidence}
            status={status}
            errors={errors}
          />
        ) : null}
        {selectedView === "history" ? <HistoryView history={history} undoLast={undoLast} /> : null}
        {selectedView === "settings" ? (
          <SettingsView
            privacy={privacy}
            setPrivacy={setPrivacy}
            googleConnected={googleConnected}
            microsoftConnected={microsoftConnected}
            setGoogleConnected={setGoogleConnected}
            setMicrosoftConnected={setMicrosoftConnected}
          />
        ) : null}
      </section>
    </main>
  );
}

function CaptureView(props: {
  sourceText: string;
  setSourceText: (value: string) => void;
  contact: ParsedContact;
  updateContact: <K extends keyof ParsedContact>(field: K, value: ParsedContact[K]) => void;
  runParse: () => void;
  parseText: (text: string) => void;
  duplicateMatches: DuplicateMatch[];
  multipleContacts: ParsedContact[];
  selectDetectedContact: (contact: ParsedContact) => void;
  destination: Destination;
  setDestination: (value: Destination) => void;
  saveMode: SaveMode;
  setSaveMode: (value: SaveMode) => void;
  saveContact: () => void;
  selectedEvidence: string;
  setSelectedEvidence: (value: string) => void;
  status: SaveState;
  errors: ProviderSaveError[];
}) {
  const { contact } = props;
  const selected = contact.fieldEvidence[props.selectedEvidence];
  const hasExtractedFields = Object.keys(contact.fieldEvidence).length > 0;

  function updatePhone(type: "mobile" | "office", value: string) {
    const phones = contact.phones.filter((phone) => phone.type !== type);
    if (value.trim()) {
      phones.push({ type, value: value.trim(), confidence: 1, evidence: "Edited by you" });
    }
    props.updateContact("phones", phones);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    // Parse after the paste lands in the textarea so the new value is used.
    window.setTimeout(() => props.parseText(target.value), 0);
  }

  return (
    <div className="capture-grid production">
      <section className="input-panel">
        <div className="panel-heading">
          <h2>Source Text</h2>
          <Button icon={<Search size={16} />} onClick={props.runParse} tone="primary" disabled={props.status !== "idle"}>
            {props.status === "parsing" ? "Parsing..." : "Parse"}
          </Button>
        </div>
        <SourcePreview text={props.sourceText} activeLine={selected?.sourceLine} />
        <Textarea value={props.sourceText} onChange={(event) => props.setSourceText(event.target.value)} onPaste={handlePaste} rows={8} />
        {!props.sourceText.trim() ? (
          <div className="empty compact">Paste an email signature, business card OCR, or profile block to start extraction.</div>
        ) : null}
        {props.multipleContacts.length > 1 ? (
          <div className="notice warn">
            <strong>{props.multipleContacts.length} people found</strong>
            <span>Pick one to review and save, then come back for the next.</span>
            <div className="segmented">
              {props.multipleContacts.map((item, index) => (
                <button key={item.emails[0] ?? index} onClick={() => props.selectDetectedContact(item)}>
                  {item.fullName ?? item.emails[0] ?? `Contact ${index + 1}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="review-panel">
        <div className="panel-heading">
          <h2>Extracted Contact</h2>
          <div className="confidence"><Meter value={contact.confidence} />{Math.round(contact.confidence * 100)}%</div>
        </div>

        {!hasExtractedFields ? (
          <div className="empty compact">No confident fields yet. Paste contact text and run Parse.</div>
        ) : (
          <EvidenceRail contact={contact} selectedEvidence={props.selectedEvidence} setSelectedEvidence={props.setSelectedEvidence} />
        )}

        <div className="form-grid">
          <Field label="Full name"><Input value={contact.fullName ?? ""} onFocus={() => props.setSelectedEvidence("fullName")} onChange={(event) => props.updateContact("fullName", event.target.value)} /></Field>
          <Field label="Title"><Input value={contact.title ?? ""} onFocus={() => props.setSelectedEvidence("title")} onChange={(event) => props.updateContact("title", event.target.value)} /></Field>
          <Field label="Company"><Input value={contact.company ?? ""} onFocus={() => props.setSelectedEvidence("company")} onChange={(event) => props.updateContact("company", event.target.value)} /></Field>
          <Field label="Email"><Input value={contact.emails[0] ?? ""} onFocus={() => props.setSelectedEvidence("emails")} onChange={(event) => props.updateContact("emails", event.target.value ? [event.target.value] : [])} /></Field>
          <Field label="Mobile"><Input value={contact.phones.find((phone) => phone.type === "mobile")?.value ?? ""} onFocus={() => props.setSelectedEvidence("phones")} onChange={(event) => updatePhone("mobile", event.target.value)} /></Field>
          <Field label="Office"><Input value={contact.phones.find((phone) => phone.type === "office")?.value ?? ""} onFocus={() => props.setSelectedEvidence("phones")} onChange={(event) => updatePhone("office", event.target.value)} /></Field>
          <Field label="Website"><Input value={contact.website ?? ""} onFocus={() => props.setSelectedEvidence("website")} onChange={(event) => props.updateContact("website", event.target.value)} /></Field>
          <Field label="LinkedIn"><Input value={contact.linkedinUrl ?? ""} onFocus={() => props.setSelectedEvidence("linkedinUrl")} onChange={(event) => props.updateContact("linkedinUrl", event.target.value)} /></Field>
        </div>

        {contact.address ? (
          <div className="address-strip" onMouseEnter={() => props.setSelectedEvidence("address")}>
            <Archive size={16} />
            <span>{[contact.address.street, contact.address.city, contact.address.state, contact.address.postalCode, contact.address.country].filter(Boolean).join(", ")}</span>
          </div>
        ) : null}

        {selected ? (
          <div className="why-panel">
            <div><FileText size={16} /><strong>Why we extracted this</strong></div>
            <p>{selected.rationale}</p>
            <small>Source line {selected.sourceLine ?? "unknown"}: {selected.evidence}</small>
          </div>
        ) : null}

        {contact.warnings.map((warning) => (
          <div className="notice" key={warning}>{warning}</div>
        ))}

        <DuplicateReview duplicate={props.duplicateMatches[0]} saveMode={props.saveMode} setSaveMode={props.setSaveMode} />
        <ErrorList errors={props.errors} />

        <div className="save-bar">
          <div className="segmented">
            {(["google", "microsoft", "both"] as const).map((value) => (
              <button className={props.destination === value ? "selected" : ""} key={value} onClick={() => props.setDestination(value)}>{value}</button>
            ))}
          </div>
          <Button icon={<Save size={16} />} tone="primary" onClick={props.saveContact} disabled={props.status !== "idle" || !contact.emails.length}>
            {props.status === "saving" ? "Saving..." : props.saveMode === "update" ? "Update Contact" : "Save Contact"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function SourcePreview({ text, activeLine }: { text: string; activeLine?: number }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="source-preview" aria-label="Highlighted source text">
      {lines.map((line, index) => (
        <div className={activeLine === index + 1 ? "active" : ""} key={`${index}-${line}`}>
          <span>{index + 1}</span>
          <code>{line || " "}</code>
        </div>
      ))}
    </div>
  );
}

function EvidenceRail({ contact, selectedEvidence, setSelectedEvidence }: { contact: ParsedContact; selectedEvidence: string; setSelectedEvidence: (value: string) => void }) {
  return (
    <div className="evidence-grid">
      {Object.entries(contact.fieldEvidence).map(([field, evidence]) => (
        <button className={selectedEvidence === field ? "selected" : ""} key={field} onClick={() => setSelectedEvidence(field)}>
          <span>{field}</span>
          <strong>{evidence.value}</strong>
          <small>{Math.round(evidence.confidence * 100)}% confidence</small>
        </button>
      ))}
    </div>
  );
}

function DuplicateReview({ duplicate, saveMode, setSaveMode }: { duplicate?: DuplicateMatch; saveMode: SaveMode; setSaveMode: (value: SaveMode) => void }) {
  if (!duplicate) return null;
  return (
    <div className="merge-panel">
      <div>
        <Merge size={16} />
        <strong>{Math.round(duplicate.score * 100)}% possible existing contact</strong>
      </div>
      <p>{duplicate.reasons.join(", ")}. Recommended action: {duplicate.recommendedAction.replace("_", " ")}.</p>
      <div className="segmented two">
        <button className={saveMode === "update" ? "selected" : ""} onClick={() => setSaveMode("update")}>update existing</button>
        <button className={saveMode === "create" ? "selected" : ""} onClick={() => setSaveMode("create")}>create new</button>
      </div>
    </div>
  );
}

function ErrorList({ errors }: { errors: ProviderSaveError[] }) {
  if (!errors.length) return null;
  return (
    <div className="error-list">
      {errors.map((error) => (
        <div className="notice error" key={`${error.provider}-${error.code}`}>
          <div><AlertTriangle size={16} /><strong>{error.message}</strong></div>
          <span>{error.nextStep}</span>
        </div>
      ))}
    </div>
  );
}

function HistoryView({ history, undoLast }: { history: ImportLogEntry[]; undoLast: () => void }) {
  const active = history.filter((entry) => !entry.undoneAt);
  return (
    <section className="history-view">
      <div className="panel-heading">
        <h2>Recent Imports</h2>
        <Button icon={<RotateCcw size={16} />} onClick={undoLast} disabled={!active.length}>Undo last</Button>
      </div>
      <div className="history-list">
        {history.length ? history.map((entry) => (
          <article className={entry.undoneAt ? "undone" : ""} key={entry.id}>
            <div className="avatar">{entry.action === "updated" ? <RefreshCcw size={18} /> : <UserPlus size={18} />}</div>
            <div>
              <strong>{entry.contact.fullName ?? entry.contact.emails[0] ?? "Unnamed contact"}</strong>
              <span>{entry.action} in {entry.savedTo.join(" + ")}</span>
            </div>
            <div className="history-meta">
              <span>{entry.undoneAt ? "undone" : entry.contact.company ?? entry.contact.sourceEmailDomain ?? "Unknown company"}</span>
              <small>{new Date(entry.createdAt).toLocaleString()}</small>
            </div>
          </article>
        )) : <div className="empty">No saved contacts yet. Parsed contacts appear here after Google or Outlook saves succeed.</div>}
      </div>
    </section>
  );
}

function SettingsView(props: {
  privacy: PrivacySettings;
  setPrivacy: React.Dispatch<React.SetStateAction<PrivacySettings>>;
  googleConnected: boolean;
  microsoftConnected: boolean;
  setGoogleConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setMicrosoftConnected: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <section className="settings-view">
      <div className="settings-grid">
        <ToggleCard icon={<Sparkles />} title="AI extraction" detail="Send text only after user approval and provider setup." checked={props.privacy.aiExtractionEnabled} onChange={(checked) => props.setPrivacy((value) => ({ ...value, aiExtractionEnabled: checked, localOnlyMode: !checked }))} />
        <ToggleCard icon={<Shield />} title="Ask before AI" detail="Require review before text leaves this device." checked={props.privacy.askBeforeSendingToAi} onChange={(checked) => props.setPrivacy((value) => ({ ...value, askBeforeSendingToAi: checked }))} />
        <ToggleCard icon={<Clipboard />} title="Clipboard monitor" detail="Read clipboard only after permission and a hotkey action." checked={props.privacy.clipboardMonitoringEnabled} onChange={(checked) => props.setPrivacy((value) => ({ ...value, clipboardMonitoringEnabled: checked }))} />
        <ToggleCard icon={<KeyRound />} title="Local-only mode" detail="Use deterministic parsing and keep raw source local." checked={props.privacy.localOnlyMode} onChange={(checked) => props.setPrivacy((value) => ({ ...value, localOnlyMode: checked, aiExtractionEnabled: !checked }))} />
        <ToggleCard icon={<Cloud />} title="Google Contacts" detail="Uses OAuth with contacts.readwrite scope." checked={props.googleConnected} onChange={props.setGoogleConnected} />
        <ToggleCard icon={<Cloud />} title="Outlook Contacts" detail="Uses Microsoft Graph Contacts.ReadWrite." checked={props.microsoftConnected} onChange={props.setMicrosoftConnected} />
      </div>
    </section>
  );
}

function ToggleCard({ icon, title, detail, checked, onChange }: { icon: React.ReactNode; title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className="toggle-card" onClick={() => onChange(!checked)}>
      <span>{icon}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
      <span className={`switch ${checked ? "on" : ""}`}><Check size={14} /></span>
    </button>
  );
}

function Connection({ label, connected, onClick }: { label: string; connected: boolean; onClick: () => void }) {
  return (
    <button className="connection" onClick={onClick}>
      <span>{label}</span>
      <StatusPill tone={connected ? "good" : "neutral"}>{connected ? "Connected" : "Off"}</StatusPill>
    </button>
  );
}

// Merge field by field: a sparse new parse must never erase data already on
// the existing contact (ParsedContact materializes every key, so a plain
// spread would overwrite populated fields with undefined).
function mergeContacts(existing: ParsedContact, incoming: ParsedContact): ParsedContact {
  return {
    ...existing,
    fullName: incoming.fullName ?? existing.fullName,
    firstName: incoming.firstName ?? existing.firstName,
    lastName: incoming.lastName ?? existing.lastName,
    title: incoming.title ?? existing.title,
    company: incoming.company ?? existing.company,
    website: incoming.website ?? existing.website,
    linkedinUrl: incoming.linkedinUrl ?? existing.linkedinUrl,
    address: incoming.address ?? existing.address,
    notes: incoming.notes ?? existing.notes,
    sourceText: incoming.sourceText,
    source: incoming.source ?? existing.source,
    sourceEmailDomain: incoming.sourceEmailDomain ?? existing.sourceEmailDomain,
    dateCaptured: incoming.dateCaptured,
    confidence: incoming.confidence,
    fieldConfidence: incoming.fieldConfidence,
    fieldEvidence: incoming.fieldEvidence,
    emails: Array.from(new Set([...existing.emails, ...incoming.emails])),
    phones: [...existing.phones, ...incoming.phones].filter((phone, index, phones) => phones.findIndex((item) => item.value === phone.value) === index),
    warnings: incoming.warnings
  };
}

createRoot(document.getElementById("root")!).render(<App />);
