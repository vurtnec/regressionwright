import { expect, test } from '@playwright/test';
import {
  formatMailCandidateSummaries,
  isRetryableMailReadError,
  selectGmailAccountForRecipient,
  summarizeMailCandidatesForDiagnostics,
} from '../../../src/integrations/mail/gmail.js';

test.describe('Gmail account selection', () => {
  test('selects the Gmail account that matches a configured recipient alias', () => {
    const account = selectGmailAccountForRecipient('primary+quotation@example.com', [
      {
        match: ['primary@example.com', 'primary+quotation@example.com'],
        user: 'primary@example.com',
        appPassword: 'app-password-1',
      },
      {
        match: ['secondary@example.com'],
        user: 'secondary@example.com',
        appPassword: 'app-password-2',
      },
    ]);

    expect(account.user).toBe('primary@example.com');
  });

  test('selects the second Gmail account for the no-offer recipient', () => {
    const account = selectGmailAccountForRecipient('secondary@example.com', [
      {
        match: ['primary@example.com'],
        user: 'primary@example.com',
        appPassword: 'app-password-1',
      },
      {
        match: ['secondary@example.com'],
        user: 'secondary@example.com',
        appPassword: 'app-password-2',
      },
    ]);

    expect(account.appPassword).toBe('app-password-2');
  });

  test('treats dropped IMAP connections as retryable mail read errors', () => {
    expect(isRetryableMailReadError(new Error('Connection not available'))).toBe(true);
  });

  test('throws a clear error when no Gmail account matches the recipient', () => {
    expect(() =>
      selectGmailAccountForRecipient('missing@example.com', [
        {
          match: ['primary@example.com'],
          user: 'primary@example.com',
          appPassword: 'app-password-1',
        },
      ])
    ).toThrow(/No Gmail account.*missing@example\.com/);
  });

  test('formats recent message diagnostics without body content', () => {
    const diagnostics = summarizeMailCandidatesForDiagnostics([
      {
        uid: 42,
        subject: 'Workflow Invitation for WF-000001',
        date: new Date('2026-06-18T09:45:53Z'),
        from: ['noreply@example.test'],
        to: ['recipient@example.test'],
        headersText: '',
        text: 'body text should not be included',
        html: '',
        urls: ['https://example.test/login?t=token'],
      },
    ]);

    const formatted = formatMailCandidateSummaries(diagnostics);
    expect(formatted).toContain('uid=42');
    expect(formatted).toContain('Workflow Invitation for WF-000001');
    expect(formatted).toContain('urls=1');
    expect(formatted).not.toContain('body text should not be included');
  });
});
