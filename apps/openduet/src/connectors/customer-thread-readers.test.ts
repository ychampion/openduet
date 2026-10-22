import { describe, expect, test } from 'bun:test';
import { customerThreadSnapshot } from '../responsibilities/thread.ts';
import { EmailConnector } from './email.ts';
import { GmailApiTransport } from './gmail.ts';
import type { EmailConnection, MailMessage } from './mail-transport.ts';
import { OutlookMailTransport } from './outlook-mail.ts';

const access = { token: async () => 'fixture-token', renew: async () => 'fixture-token' };
const source = (reply = false) =>
  [
    `From: ${reply ? 'Priya <priya@example.test>' : 'Avery <avery@example.test>'}`,
    `To: ${reply ? 'avery@example.test' : 'priya@example.test'}`,
    `Message-ID: <${reply ? 'reply' : 'outgoing'}@example.test>`,
    `Date: Fri, 23 Oct 2026 ${reply ? '10' : '08'}:00:00 +0000`,
    'Subject: Pilot',
    ...(reply
      ? ['In-Reply-To: <outgoing@example.test>', 'References: <outgoing@example.test>']
      : []),
    'Content-Type: text/plain; charset=utf-8',
    '',
    reply ? 'Yes, Tuesday works.' : 'Can you confirm the pilot date?',
  ].join('\r\n');
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('native complete customer conversation reads', () => {
  test('Gmail reads the full provider thread including an archived customer reply', async () => {
    const requests: URL[] = [];
    const fetcher = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push(url);
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer fixture-token');
      if (url.pathname.endsWith('/threads/thread1'))
        return json({ messages: [{ id: 'outgoing' }, { id: 'reply', labelIds: ['ARCHIVED'] }] });
      if (url.searchParams.get('format') === 'metadata') return json({ threadId: 'thread1' });
      return json({
        raw: Buffer.from(source(url.pathname.endsWith('/reply'))).toString('base64url'),
      });
    }) as typeof fetch;
    const transport = new GmailApiTransport({
      base: 'https://mail.example.test/users/me',
      from: 'avery@example.test',
      access,
      fetcher,
    });
    const messages = await transport.thread('outgoing');
    expect(messages).toHaveLength(2);
    expect(
      customerThreadSnapshot(messages ?? [], 'avery@example.test', 'priya@example.test'),
    ).toMatchObject({ replied: true });
    expect(requests.some((url) => url.pathname.endsWith('/threads/thread1'))).toBe(true);
  });

  test('Gmail refuses a partial or oversized conversation instead of claiming no reply', async () => {
    for (const mode of ['missing-message', 'too-many'] as const) {
      const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/threads/thread1'))
          return json({
            messages:
              mode === 'too-many'
                ? Array.from({ length: 51 }, (_, i) => ({ id: `m${i}` }))
                : [{ id: 'gone' }],
          });
        if (url.searchParams.get('format') === 'metadata') return json({ threadId: 'thread1' });
        return new Response(null, { status: 404 });
      }) as typeof fetch;
      const transport = new GmailApiTransport({
        base: 'https://mail.example.test/users/me',
        from: 'avery@example.test',
        access,
        fetcher,
      });
      await expect(transport.thread('outgoing')).rejects.toThrow();
    }
  });

  test('Graph reads the entire mailbox conversation, including a reply moved out of Inbox', async () => {
    const requests: URL[] = [];
    const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(String(input));
      requests.push(url);
      if (url.pathname.endsWith('/messages') && url.searchParams.has('$filter')) {
        expect(url.searchParams.get('$filter')).toBe("conversationId eq 'conversation''1'");
        return json({ value: [{ id: 'outgoing' }, { id: 'reply', parentFolderId: 'archive' }] });
      }
      if (url.searchParams.get('$select') === 'conversationId')
        return json({ conversationId: "conversation'1" });
      return new Response(source(url.pathname.endsWith('/reply/$value')), {
        headers: { 'content-type': 'message/rfc822' },
      });
    }) as typeof fetch;
    const transport = new OutlookMailTransport({
      base: 'https://graph.example.test/me',
      from: 'avery@example.test',
      access,
      fetcher,
    });
    const messages = await transport.thread('outgoing');
    expect(messages).toHaveLength(2);
    expect(
      customerThreadSnapshot(messages ?? [], 'avery@example.test', 'priya@example.test').replied,
    ).toBe(true);
    expect(requests.every((url) => !url.pathname.includes('/mailFolders/'))).toBe(true);
  });

  test('Graph refuses truncated, unreadable or oversized conversations', async () => {
    for (const mode of ['next-page', 'missing-message', 'too-many'] as const) {
      const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/messages'))
          return json({
            value:
              mode === 'too-many'
                ? Array.from({ length: 51 }, (_, i) => ({ id: `m${i}` }))
                : [{ id: 'gone' }],
            ...(mode === 'next-page'
              ? { '@odata.nextLink': 'https://graph.example.test/next' }
              : {}),
          });
        if (url.searchParams.get('$select') === 'conversationId')
          return json({ conversationId: 'conversation1' });
        return new Response(null, { status: 404 });
      }) as typeof fetch;
      const transport = new OutlookMailTransport({
        base: 'https://graph.example.test/me',
        from: 'avery@example.test',
        access,
        fetcher,
      });
      await expect(transport.thread('outgoing')).rejects.toThrow();
    }
  });

  test('IMAP does not offer a watch when it cannot guarantee all-folder completeness', () => {
    const config: EmailConnection = {
      id: 'conn_fixture',
      spaceId: 'sp_fixture',
      from: 'avery@example.test',
      imap: { host: 'imap.example.test', port: 993, secure: true },
      smtp: { host: 'smtp.example.test', port: 465, secure: true },
      username: 'avery@example.test',
      secretRef: 'secret_fixture',
    };
    const connector = new EmailConnector(config, {
      withSecret: async () => {
        throw new Error('No source read should occur');
      },
    });
    expect(connector.customerThread).toBeUndefined();
  });
});

describe('customer thread identity and source version', () => {
  const outgoing: MailMessage = {
    id: 'own',
    message_id: '<own@example.test>',
    from: 'Avery',
    from_addresses: ['avery@example.test'],
    to: 'Priya',
    to_addresses: ['priya@example.test'],
    date: '2026-10-23T08:00:00Z',
    subject: 'Pilot',
    text: 'Long context',
    html: '',
  };
  test('display-name impersonation does not count as a reply and full source changes invalidate preparation', () => {
    const impostor = {
      ...outgoing,
      id: 'impostor',
      message_id: '<impostor@example.test>',
      from: 'priya@example.test <other@example.test>',
      from_addresses: ['other@example.test'],
      date: '2026-10-23T10:00:00Z',
    };
    const first = customerThreadSnapshot(
      [outgoing, impostor],
      'avery@example.test',
      'priya@example.test',
    );
    expect(first.replied).toBe(false);
    expect(
      customerThreadSnapshot([impostor, outgoing], 'avery@example.test', 'priya@example.test')
        .version,
    ).toBe(first.version);
    expect(
      customerThreadSnapshot(
        [{ ...outgoing, text: 'Changed unresolved requirement' }, impostor],
        'avery@example.test',
        'priya@example.test',
      ).version,
    ).not.toBe(first.version);
  });
  test('missing identity, missing dates and a thread without our outgoing message fail closed', () => {
    expect(() =>
      customerThreadSnapshot(
        [{ ...outgoing, date: null }],
        'avery@example.test',
        'priya@example.test',
      ),
    ).toThrow();
    expect(() =>
      customerThreadSnapshot(
        [{ ...outgoing, from_addresses: undefined }],
        'avery@example.test',
        'priya@example.test',
      ),
    ).toThrow();
    expect(() =>
      customerThreadSnapshot([outgoing], 'another-owner@example.test', 'priya@example.test'),
    ).toThrow();
  });
});
