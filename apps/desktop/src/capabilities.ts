import { parseContact, findDuplicateContacts } from "@contactsnap/parser";
import type { ImportLogEntry, ParsedContact, PrivacySettings } from "@contactsnap/shared-types";

export type DesktopPlatform = "macos" | "windows" | "linux" | "unknown";
export type PermissionResult = {
  granted: boolean;
  reason?: string;
  nextStep?: string;
};

export type DesktopRuntime = {
  platform(): DesktopPlatform;
  requestClipboardPermission(): Promise<PermissionResult>;
  readClipboardText(): Promise<string>;
  openQuickCapture(contact: ParsedContact): Promise<void>;
  saveSecureToken(provider: "google" | "microsoft", token: string): Promise<void>;
  getImportHistory(): Promise<ImportLogEntry[]>;
  saveImport(entry: ImportLogEntry): Promise<void>;
  getPrivacySettings(): Promise<PrivacySettings>;
};

export async function captureClipboard(runtime: DesktopRuntime): Promise<ParsedContact> {
  const platform = runtime.platform();
  if (!["macos", "windows"].includes(platform)) {
    throw new Error("Global hotkey clipboard capture is supported on macOS and Windows. Use manual paste on this platform.");
  }

  const settings = await runtime.getPrivacySettings();
  if (!settings.clipboardMonitoringEnabled) {
    throw new Error("Clipboard monitoring is off. Enable it in Settings, then press the capture hotkey again.");
  }

  const permission = await runtime.requestClipboardPermission();
  if (!permission.granted) {
    throw new Error(permission.nextStep ?? "Grant clipboard permission in system settings, then retry capture.");
  }

  const text = await runtime.readClipboardText();
  if (!text.trim()) {
    throw new Error("The clipboard is empty. Copy a signature or select text, then press the capture hotkey again.");
  }

  const contact = parseContact({ text, source: "clipboard" });
  const history = await runtime.getImportHistory();
  const duplicates = findDuplicateContacts(contact, history.map((entry) => entry.contact));

  if (settings.localOnlyMode || settings.askBeforeSendingToAi) {
    contact.warnings.push("AI extraction is paused until review. Continue with local parsing or approve AI extraction from the review window.");
  }

  if (duplicates.length) {
    contact.warnings.push(`Possible duplicate: ${duplicates[0].reasons.join(", ")}.`);
  }

  await runtime.openQuickCapture(contact);
  return contact;
}
