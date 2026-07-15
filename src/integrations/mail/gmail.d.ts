export type ParsedInboxMessage = {
    uid: number;
    subject: string;
    date?: Date;
    from: string[];
    to: string[];
    headersText: string;
    text: string;
    html: string;
    urls: string[];
};
export type MailWaitOptions = {
    recipientEmail: string;
    after: Date;
    timeoutMs?: number;
    pollMs?: number;
    excludeUids?: number[];
};
export type MailCandidateDiagnostic = {
    uid: number;
    date?: string;
    subject: string;
    from: string[];
    to: string[];
    urlCount: number;
};
export type GmailAccountConfig = {
    match: string[];
    user: string;
    appPassword: string;
    host?: string;
    port?: number;
    secure?: boolean;
};
export declare function selectGmailAccountForRecipient(recipientEmail: string, accounts: GmailAccountConfig[]): GmailAccountConfig;
export declare function waitForMail<T>(options: MailWaitOptions & {
    describe: string;
    predicate: (message: ParsedInboxMessage) => T | undefined;
}): Promise<T>;
export declare function summarizeMailCandidatesForDiagnostics(messages: ParsedInboxMessage[]): MailCandidateDiagnostic[];
export declare function formatMailCandidateSummaries(candidates: MailCandidateDiagnostic[]): string;
export declare function isRetryableMailReadError(error: unknown): boolean;
export declare function matchesRecipient(message: ParsedInboxMessage, recipientEmail: string): boolean;
export declare function messageContains(message: ParsedInboxMessage, value: string): boolean;
export declare function normalizeMailText(value: string, options?: {
    preserveLines?: boolean;
}): string;
export declare function htmlToText(html: string | false, options?: {
    preserveLines?: boolean;
}): string;
export declare function decodeHtmlEntities(value: string): string;
