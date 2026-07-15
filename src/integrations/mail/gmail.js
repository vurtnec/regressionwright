import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import fs from 'node:fs';
import path from 'node:path';
import { readHarnessEnv, readHarnessEnvNumber } from '../../core/env-vars.mjs';
import { consumerProjectRoot } from '../../core/paths.mjs';
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_LOOKBACK_MINUTES = 180;
function getGmailConfig(recipientEmail) {
    const env = loadProjectEnv();
    const account = selectGmailAccountForRecipient(recipientEmail, parseGmailAccounts(env.GMAIL_ACCOUNTS));
    return {
        host: account.host || env.GMAIL_IMAP_HOST || 'imap.gmail.com',
        port: Number(account.port || env.GMAIL_IMAP_PORT || 993),
        secure: account.secure ?? env.GMAIL_IMAP_SECURE !== '0',
        logger: false,
        auth: {
            user: account.user,
            pass: account.appPassword,
        },
    };
}
function loadProjectEnv() {
    const envName = readHarnessEnv('ENV', 'dev');
    const env = {};
    for (const fileName of ['.env', `.env.${envName}`, '.env.local', `.env.${envName}.local`]) {
        const filePath = path.join(consumerProjectRoot, fileName);
        if (!fs.existsSync(filePath)) {
            continue;
        }
        Object.assign(env, parseProjectEnv(fs.readFileSync(filePath, 'utf8')));
    }
    return env;
}
function parseGmailAccounts(value) {
    if (!value?.trim()) {
        throw new Error('ENVIRONMENT_ERROR: Gmail IMAP is not configured. Set GMAIL_ACCOUNTS in the project env file before running mail-dependent stages.');
    }
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch (error) {
        throw new Error(`ENVIRONMENT_ERROR: GMAIL_ACCOUNTS must be a JSON array. ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error('ENVIRONMENT_ERROR: GMAIL_ACCOUNTS must be a JSON array.');
    }
    return parsed.map((account, index) => normalizeGmailAccount(account, index));
}
export function selectGmailAccountForRecipient(recipientEmail, accounts) {
    const recipient = normalizeEmail(recipientEmail);
    const account = accounts.find(candidate => [...candidate.match, candidate.user].some(pattern => matchesEmailPattern(pattern, recipient)));
    if (!account) {
        throw new Error(`ENVIRONMENT_ERROR: No Gmail account in GMAIL_ACCOUNTS matches recipient "${recipientEmail}". ` +
            `Configured matches: ${accounts.flatMap(candidate => candidate.match).join(', ') || '(none)'}.`);
    }
    return account;
}
function normalizeGmailAccount(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`ENVIRONMENT_ERROR: GMAIL_ACCOUNTS[${index}] must be an object.`);
    }
    const account = value;
    const user = stringValue(account.user);
    const appPassword = stringValue(account.appPassword);
    const match = stringArray(account.match);
    if (!user) {
        throw new Error(`ENVIRONMENT_ERROR: GMAIL_ACCOUNTS[${index}].user is required.`);
    }
    if (!appPassword) {
        throw new Error(`ENVIRONMENT_ERROR: GMAIL_ACCOUNTS[${index}].appPassword is required.`);
    }
    return {
        match: match.length ? match : [user],
        user,
        appPassword,
        host: stringValue(account.host),
        port: account.port === undefined ? undefined : Number(account.port),
        secure: account.secure === undefined ? undefined : Boolean(account.secure),
    };
}
function parseProjectEnv(content) {
    const env = {};
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const parsed = parseProjectEnvLine(lines, index);
        if (!parsed) {
            continue;
        }
        env[parsed.key] = parsed.value;
        index = parsed.endIndex;
    }
    return env;
}
function parseProjectEnvLine(lines, startIndex) {
    const line = lines[startIndex].trim();
    if (!line || line.startsWith('#')) {
        return undefined;
    }
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
        return undefined;
    }
    const key = match[1];
    let rawValue = match[2].trim();
    if (!rawValue) {
        return { key, value: '', endIndex: startIndex };
    }
    const quote = rawValue[0];
    if (quote === '"' || quote === "'") {
        const collected = [rawValue.slice(1)];
        let endIndex = startIndex;
        while (!hasClosingQuote(collected.at(-1) || '', quote)) {
            endIndex += 1;
            if (endIndex >= lines.length) {
                throw new Error(`ENVIRONMENT_ERROR: ${key} in project env file has an unterminated quoted value.`);
            }
            collected.push(lines[endIndex]);
        }
        const last = collected[collected.length - 1];
        collected[collected.length - 1] = last.slice(0, closingQuoteIndex(last, quote));
        return {
            key,
            value: unescapeEnvValue(collected.join('\n'), quote),
            endIndex,
        };
    }
    return {
        key,
        value: stripEnvComment(rawValue).trim(),
        endIndex: startIndex,
    };
}
function hasClosingQuote(value, quote) {
    return closingQuoteIndex(value, quote) >= 0;
}
function closingQuoteIndex(value, quote) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
        if (value[index] === quote && !isEscaped(value, index)) {
            return index;
        }
    }
    return -1;
}
function isEscaped(value, index) {
    let slashCount = 0;
    for (let current = index - 1; current >= 0 && value[current] === '\\'; current -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}
function unescapeEnvValue(value, quote) {
    if (quote === "'") {
        return value.replace(/\\'/g, "'");
    }
    return value
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}
function stripEnvComment(value) {
    return value.replace(/\s+#.*$/, '');
}
function matchesEmailPattern(pattern, recipientEmail) {
    const normalizedPattern = normalizeEmail(pattern);
    if (normalizedPattern.includes('*')) {
        const regex = new RegExp(`^${normalizedPattern.split('*').map(escapeRegex).join('.*')}$`, 'i');
        return regex.test(recipientEmail);
    }
    return normalizedPattern === recipientEmail;
}
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : undefined;
}
function stringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map(item => stringValue(item)).filter((item) => Boolean(item));
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export async function waitForMail(options) {
    const deadline = Date.now() + Number(options.timeoutMs ?? readHarnessEnvNumber('EMAIL_TIMEOUT_MS', DEFAULT_TIMEOUT_MS));
    const pollMs = Number(options.pollMs ?? readHarnessEnvNumber('EMAIL_POLL_MS', DEFAULT_POLL_MS));
    let lastScanCount = 0;
    let lastReadError;
    let lastCandidateSummaries = [];
    while (Date.now() < deadline) {
        let messages;
        try {
            messages = await readRecentInboxMessages(options.after, options.recipientEmail);
            lastReadError = undefined;
            lastScanCount = messages.length;
        }
        catch (error) {
            if (!isRetryableMailReadError(error)) {
                throw error;
            }
            lastReadError = error;
            await delay(Math.min(pollMs, Math.max(deadline - Date.now(), 0)));
            continue;
        }
        const excludedUids = new Set(options.excludeUids || []);
        const candidateMessages = messages.filter(message => !excludedUids.has(message.uid));
        lastCandidateSummaries = summarizeMailCandidatesForDiagnostics(candidateMessages);
        for (const message of candidateMessages) {
            const result = options.predicate(message);
            if (result) {
                return result;
            }
        }
        await delay(pollMs);
    }
    throw new Error(`TIMEOUT: Waited for ${options.describe} sent to ${options.recipientEmail}` +
        `. Scanned ${lastScanCount} recent Gmail message(s).` +
        `${lastCandidateSummaries.length ? ` Recent candidates: ${formatMailCandidateSummaries(lastCandidateSummaries)}.` : ''}` +
        `${lastReadError ? ` Last Gmail read error: ${describeError(lastReadError)}.` : ''}`);
}
export function summarizeMailCandidatesForDiagnostics(messages) {
    return messages.slice(0, 5).map(message => ({
        uid: message.uid,
        date: message.date?.toISOString(),
        subject: trimDiagnosticText(message.subject || '(no subject)', 120),
        from: message.from.slice(0, 3),
        to: message.to.slice(0, 3),
        urlCount: message.urls.length,
    }));
}
export function formatMailCandidateSummaries(candidates) {
    return candidates.map(candidate => {
        const parts = [
            `uid=${candidate.uid}`,
            candidate.date ? `date=${candidate.date}` : undefined,
            `subject="${candidate.subject}"`,
            candidate.from.length ? `from=${candidate.from.join(',')}` : undefined,
            candidate.to.length ? `to=${candidate.to.join(',')}` : undefined,
            `urls=${candidate.urlCount}`,
        ].filter(Boolean);
        return `{${parts.join(' ')}}`;
    }).join('; ');
}
export function isRetryableMailReadError(error) {
    const message = describeError(error);
    if (/ENVIRONMENT_ERROR|GMAIL_ACCOUNTS|Gmail IMAP is not configured|No Gmail account/i.test(message)) {
        return false;
    }
    return /network|socket|TLS|timeout|ETIMEDOUT|ECONN|ECONNRESET|EPIPE|ENOTFOUND|imap|gmail|NoConnection|Connection not available/i.test(message);
}
function describeError(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
function trimDiagnosticText(value, maxLength) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}
async function readRecentInboxMessages(after, recipientEmail) {
    const client = new ImapFlow(getGmailConfig(recipientEmail));
    await client.connect();
    try {
        const since = new Date(Math.min(after.getTime(), Date.now() - lookbackMinutes() * 60_000));
        const mailboxes = await readMailboxCandidates(client);
        const messages = [];
        for (const mailbox of mailboxes) {
            messages.push(...await readRecentMailboxMessages(client, mailbox, since, after));
        }
        return messages.sort((a, b) => {
            const dateDiff = (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0);
            return dateDiff || b.uid - a.uid;
        });
    }
    finally {
        await client.logout().catch(() => undefined);
    }
}
async function readMailboxCandidates(client) {
    const mailboxes = ['INBOX'];
    let listed = [];
    try {
        listed = await client.list();
    }
    catch {
        return mailboxes;
    }
    const spam = listed.find(mailbox => {
        const specialUse = String(mailbox.specialUse || '').toLowerCase();
        const path = String(mailbox.path || '').toLowerCase();
        return specialUse.includes('junk') || /(^|[/\]])(spam|junk)$/i.test(path);
    });
    if (spam?.path) {
        mailboxes.push(spam.path);
    }
    return [...new Set(mailboxes)];
}
async function readRecentMailboxMessages(client, mailbox, since, after) {
    try {
        const lock = await client.getMailboxLock(mailbox);
        try {
            const uids = await client.search({ since }, { uid: true });
            if (!uids || uids.length === 0) {
                return [];
            }
            const latestUids = [...uids].sort((a, b) => b - a).slice(0, 50);
            const messages = [];
            for await (const message of client.fetch(latestUids, { envelope: true, source: true }, { uid: true })) {
                const parsed = await parseMessage(message);
                if (!parsed.date || parsed.date.getTime() >= after.getTime() - 30_000) {
                    messages.push(parsed);
                }
            }
            return messages;
        }
        finally {
            lock.release();
        }
    }
    catch (error) {
        if (mailbox === 'INBOX') {
            throw error;
        }
        return [];
    }
}
async function parseMessage(message) {
    if (!message.source) {
        throw new Error(`ENVIRONMENT_ERROR: Gmail message ${message.uid} did not include a readable source body.`);
    }
    const parsed = await simpleParser(message.source);
    const text = parsed.text || htmlToText(parsed.html || '');
    const html = parsed.html || '';
    return {
        uid: message.uid,
        subject: parsed.subject || '',
        date: parsed.date,
        from: addressList(parsed.from),
        to: addressList(parsed.to),
        headersText: parsed.headerLines.map(header => header.line).join('\n'),
        text,
        html,
        urls: extractUrls(`${text}\n${html}`),
    };
}
export function matchesRecipient(message, recipientEmail) {
    const expected = recipientEmail.toLowerCase();
    return message.to.length === 0 || message.to.some(email => email.toLowerCase() === expected) || messageContains(message, recipientEmail);
}
export function messageContains(message, value) {
    const needle = value.toLowerCase();
    return message.subject.toLowerCase().includes(needle) ||
        message.from.some(value => value.toLowerCase().includes(needle)) ||
        message.headersText.toLowerCase().includes(needle) ||
        message.text.toLowerCase().includes(needle) ||
        message.html.toLowerCase().includes(needle);
}
function addressList(value) {
    if (!value) {
        return [];
    }
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap(address => address.value.map(item => item.address).filter((address) => Boolean(address)));
}
function extractUrls(value) {
    return [...value.matchAll(/https?:\/\/[^\s"'<>]+/gi)].map(match => decodeHtmlEntities(match[0]));
}
export function normalizeMailText(value, options = {}) {
    const decoded = decodeHtmlEntities(value);
    if (options.preserveLines) {
        return decoded
            .replace(/\r/g, '\n')
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/ *\n+ */g, '\n')
            .trim();
    }
    return decoded.replace(/\s+/g, ' ').trim();
}
export function htmlToText(html, options = {}) {
    if (!html) {
        return '';
    }
    const text = html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|tr|table|li|ul|ol)>/gi, '\n')
        .replace(/<\/(?:td|th)>/gi, ' : ')
        .replace(/<[^>]+>/g, ' ');
    return normalizeMailText(text, options);
}
export function decodeHtmlEntities(value) {
    let decoded = value;
    for (let index = 0; index < 2; index += 1) {
        decoded = decoded
            .replace(/&amp;/gi, '&')
            .replace(/&(nbsp|ensp|emsp|thinsp);?/gi, ' ')
            .replace(/&#160;?/gi, ' ')
            .replace(/&#xA0;?/gi, ' ')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&#(\d+);?/g, (_match, code) => String.fromCodePoint(Number(code)))
            .replace(/&#x([0-9a-f]+);?/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
    }
    return decoded.replace(/\u00a0/g, ' ');
}
function lookbackMinutes() {
    return readHarnessEnvNumber('EMAIL_LOOKBACK_MINUTES', DEFAULT_LOOKBACK_MINUTES);
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
