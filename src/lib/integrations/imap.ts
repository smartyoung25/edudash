// Legacy IMAP module retained only as a stub for backwards-compatible imports.
// Actual mail polling now lives in ./gmail.ts (Gmail REST API, Workers-compatible).
export { pollMailbox, updateMailStatus } from "./gmail";
export type { MailSyncResult } from "./gmail";
