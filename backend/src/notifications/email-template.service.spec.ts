import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import {
  EmailTemplateError,
  EmailTemplateService,
  escapeHtml,
  fillTemplate,
  formatAmount,
  formatDate,
  shortenAddress,
  type StowEmailTemplate,
} from './email-template.service';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';
const USER_ID = '7f1c2a9e-0000-4000-8000-000000000001';

function makeService(config: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    JWT_SECRET: SECRET,
    FRONTEND_URL: 'https://stow.example',
    API_PUBLIC_URL: 'https://api.stow.example',
    ...config,
  };
  const queueEmail = jest.fn().mockResolvedValue({ queued: true });
  const service = new EmailTemplateService(
    { get: (key: string) => values[key] } as unknown as ConfigService,
    { queueEmail } as unknown as EmailService,
  );
  return { service, queueEmail };
}

const GENUINE_ADDRESS =
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

const samples: Array<[StowEmailTemplate, object]> = [
  ['welcome', { userName: 'Ada' }],
  [
    'deposit',
    {
      userName: 'Ada',
      amount: '1250.5',
      asset: 'USDC',
      date: '2026-09-01T10:00:00Z',
      transactionId: 'tx-123',
    },
  ],
  [
    'withdrawal',
    {
      userName: 'Ada',
      amount: 75,
      asset: 'USDC',
      date: new Date('2026-09-02T00:00:00Z'),
      destination: GENUINE_ADDRESS,
      transactionId: 'tx-456',
    },
  ],
  [
    'goal-achieved',
    {
      userName: 'Ada',
      goalName: 'New laptop',
      targetAmount: '2000',
      asset: 'USDC',
      date: '2026-09-03T00:00:00Z',
    },
  ],
];

describe('EmailTemplateService', () => {
  describe.each(samples)('%s email', (template, data) => {
    const { service } = makeService();
    const email = service.render(template, data as never, USER_ID);

    it('has a subject, an HTML body and a plain-text body', () => {
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.html).toContain('<!DOCTYPE html>');
      expect(email.text.length).toBeGreaterThan(0);
    });

    it('is branded as Stow', () => {
      expect(email.html).toContain('>Stow</span>');
      expect(email.html).not.toMatch(/insightarena/i);
      expect(email.text).not.toMatch(/insightarena/i);
    });

    it('leaves no unfilled placeholders', () => {
      expect(email.html).not.toMatch(/\{\{/);
      expect(email.text).not.toMatch(/\{\{/);
      expect(email.subject).not.toMatch(/\{\{/);
    });

    it('includes a working unsubscribe link in both versions', () => {
      const url = service.unsubscribeUrl(USER_ID);
      expect(url).toMatch(
        /^https:\/\/api\.stow\.example\/api\/v1\/notifications\/unsubscribe\?token=/,
      );
      expect(email.html).toContain(`href="${escapeHtml(url)}"`);
      expect(email.text).toContain(`Unsubscribe: ${url}`);
    });

    it('is responsive: viewport meta, fluid container and a mobile breakpoint', () => {
      expect(email.html).toContain('name="viewport"');
      expect(email.html).toContain('max-width:100%');
      expect(email.html).toMatch(/@media only screen and \(max-width: 480px\)/);
    });

    it('links to the app', () => {
      expect(email.html).toContain('href="https://stow.example"');
      expect(email.text).toContain('https://stow.example');
    });

    it('declares its language and a preheader', () => {
      expect(email.html).toContain('<html lang="en">');
      expect(email.html).toMatch(/display:none;[^>]*>[^<]+<\/div>/);
    });

    it('has a plain-text version that carries the same facts as the HTML', () => {
      const plainFacts = Object.values(data).filter(
        (value): value is string =>
          typeof value === 'string' && !/^\d{4}-/.test(value),
      );
      for (const fact of plainFacts) {
        const shown = fact === GENUINE_ADDRESS ? shortenAddress(fact) : fact;
        if (/^\d+(\.\d+)?$/.test(fact)) continue; // numbers are reformatted
        expect(email.text).toContain(shown);
        expect(email.html).toContain(escapeHtml(shown));
      }
    });
  });

  describe('dynamic content', () => {
    const { service } = makeService();

    it('injects the user name into the welcome email', () => {
      const email = service.render('welcome', { userName: 'Grace' }, USER_ID);
      expect(email.html).toContain('Welcome to Stow, Grace');
      expect(email.text).toContain('Welcome to Stow, Grace');
      expect(email.subject).toBe('Welcome to Stow');
    });

    it('injects and formats the deposit amount, asset and date', () => {
      const email = service.render(
        'deposit',
        {
          userName: 'Grace',
          amount: '1234567.8900',
          asset: 'USDC',
          date: '2026-09-01T23:59:59Z',
          transactionId: 'abc123',
        },
        USER_ID,
      );
      expect(email.subject).toBe('Deposit confirmed: 1,234,567.89 USDC');
      expect(email.html).toContain('1,234,567.89 USDC');
      expect(email.html).toContain('Sep 1, 2026 (UTC)');
      expect(email.html).toContain('abc123');
      expect(email.text).toContain('Amount: 1,234,567.89 USDC');
      expect(email.text).toContain('Transaction: abc123');
    });

    it('shows N/A when an optional deposit field is missing', () => {
      const email = service.render(
        'deposit',
        { userName: 'G', amount: 5, asset: 'USDC', date: new Date(0) },
        USER_ID,
      );
      expect(email.text).toContain('Transaction: N/A');
    });

    it('shortens a long destination address on withdrawals', () => {
      const email = service.render(
        'withdrawal',
        {
          userName: 'G',
          amount: '10',
          asset: 'USDC',
          date: new Date(0),
          destination: GENUINE_ADDRESS,
        },
        USER_ID,
      );
      expect(email.text).toContain('Sent to: GABC…TUVW');
      expect(email.html).not.toContain(GENUINE_ADDRESS);
    });

    it('injects the goal name and target into the goal email', () => {
      const email = service.render(
        'goal-achieved',
        {
          userName: 'Grace',
          goalName: 'Trip to Lagos',
          targetAmount: '3500.5',
          asset: 'USDC',
          date: '2026-09-03T00:00:00Z',
        },
        USER_ID,
      );
      expect(email.subject).toBe('Goal achieved: Trip to Lagos');
      expect(email.html).toContain('3,500.5 USDC');
      expect(email.text).toContain(
        'You reached your savings goal "Trip to Lagos"',
      );
    });
  });

  describe('safety', () => {
    const { service } = makeService();

    it('HTML-escapes user-supplied text', () => {
      const email = service.render(
        'welcome',
        { userName: '<script>alert("x")</script>' },
        USER_ID,
      );
      expect(email.html).not.toContain('<script>');
      expect(email.html).toContain(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
      );
    });

    it('keeps plain text unescaped so it reads naturally', () => {
      const email = service.render(
        'welcome',
        { userName: 'Tom & Jerry' },
        USER_ID,
      );
      expect(email.text).toContain('Tom & Jerry');
      expect(email.html).toContain('Tom &amp; Jerry');
    });

    it('does not let user text inject another placeholder', () => {
      const email = service.render(
        'welcome',
        { userName: '{{unsubscribeUrl}}' },
        USER_ID,
      );
      expect(email.html).toContain('Welcome to Stow, {{unsubscribeUrl}}');
      expect(email.text).toContain('Welcome to Stow, {{unsubscribeUrl}}');
    });

    it('strips line breaks so a name cannot break out of the subject header', () => {
      const email = service.render(
        'goal-achieved',
        {
          userName: 'G',
          goalName: 'Trip\r\nBcc: attacker@example.com',
          targetAmount: '1',
          asset: 'USDC',
          date: new Date(0),
        },
        USER_ID,
      );
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.subject).toBe(
        'Goal achieved: Trip Bcc: attacker@example.com',
      );
    });
  });

  describe('validation', () => {
    const { service } = makeService();
    const valid = {
      userName: 'G',
      amount: '10',
      asset: 'USDC',
      date: new Date(0),
    };

    it.each([
      ['a missing user name', 'welcome', { userName: '' }],
      ['a blank user name', 'welcome', { userName: '   ' }],
      ['a missing asset', 'deposit', { ...valid, asset: '' }],
      ['a non-numeric amount', 'deposit', { ...valid, amount: 'ten' }],
      ['a negative amount', 'deposit', { ...valid, amount: '-5' }],
      ['an infinite amount', 'withdrawal', { ...valid, amount: Infinity }],
      ['an invalid date', 'deposit', { ...valid, date: 'not a date' }],
      [
        'a missing goal name',
        'goal-achieved',
        { ...valid, goalName: '', targetAmount: '1' },
      ],
    ] as Array<[string, StowEmailTemplate, object]>)(
      'rejects %s',
      (_label, template, data) => {
        expect(() => service.render(template, data as never, USER_ID)).toThrow(
          EmailTemplateError,
        );
      },
    );

    it('rejects an unknown template', () => {
      expect(() =>
        service.render('nope' as StowEmailTemplate, {} as never, USER_ID),
      ).toThrow(EmailTemplateError);
    });
  });

  describe('unsubscribe tokens', () => {
    it('round-trips a user id', () => {
      const { service } = makeService();
      const token = service.createUnsubscribeToken(USER_ID);
      expect(service.verifyUnsubscribeToken(token)).toBe(USER_ID);
    });

    it('rejects a token signed with a different secret', () => {
      const token = makeService().service.createUnsubscribeToken(USER_ID);
      const other = makeService({ JWT_SECRET: 'x'.repeat(40) }).service;
      expect(other.verifyUnsubscribeToken(token)).toBeNull();
    });

    it('rejects a token whose payload was swapped for another user', () => {
      const { service } = makeService();
      const [, signature] = service.createUnsubscribeToken(USER_ID).split('.');
      const forged = Buffer.from(
        JSON.stringify({ u: 'someone-else', p: 'email-unsubscribe' }),
      ).toString('base64url');
      expect(
        service.verifyUnsubscribeToken(`${forged}.${signature}`),
      ).toBeNull();
    });

    it.each(['', 'abc', 'abc.def', '.', 'a.b.c'])(
      'rejects the malformed token %p',
      (token) => {
        expect(makeService().service.verifyUnsubscribeToken(token)).toBeNull();
      },
    );

    it('rejects a token with the wrong purpose', () => {
      const { service } = makeService();
      const payload = Buffer.from(
        JSON.stringify({ u: USER_ID, p: 'something-else' }),
      ).toString('base64url');
      // Sign it properly so only the purpose check can reject it.
      const { createHmac } = jest.requireActual('crypto');
      const signature = createHmac('sha256', SECRET)
        .update(payload)
        .digest('base64url');
      expect(
        service.verifyUnsubscribeToken(`${payload}.${signature}`),
      ).toBeNull();
    });

    it('gives each user a different token', () => {
      const { service } = makeService();
      expect(service.createUnsubscribeToken('a')).not.toBe(
        service.createUnsubscribeToken('b'),
      );
    });

    it('URL-encodes the token in the link', () => {
      const { service } = makeService();
      const url = service.unsubscribeUrl(USER_ID);
      const token = new URL(url).searchParams.get('token');
      expect(token).toBe(service.createUnsubscribeToken(USER_ID));
    });

    it('throws a clear error when no secret is configured', () => {
      const { service } = makeService({ JWT_SECRET: undefined });
      expect(() => service.createUnsubscribeToken(USER_ID)).toThrow(
        /JWT_SECRET is required/,
      );
    });
  });

  describe('configuration', () => {
    it('falls back to local URLs and strips trailing slashes', () => {
      const fallback = makeService({
        FRONTEND_URL: undefined,
        API_PUBLIC_URL: undefined,
      }).service;
      expect(fallback.unsubscribeUrl(USER_ID)).toContain(
        'http://localhost:3000/api/v1/notifications/unsubscribe',
      );
      expect(
        fallback.render('welcome', { userName: 'G' }, USER_ID).html,
      ).toContain('href="http://localhost:3001"');

      const slashes = makeService({
        FRONTEND_URL: 'https://stow.example///',
        API_PUBLIC_URL: 'https://api.stow.example/',
      }).service;
      expect(slashes.unsubscribeUrl(USER_ID)).toContain(
        'https://api.stow.example/api/v1/',
      );
    });
  });

  describe('send', () => {
    it('queues the rendered email from the Stow sender', async () => {
      const { service, queueEmail } = makeService();

      const result = await service.send(
        'deposit',
        {
          userName: 'Ada',
          amount: '5',
          asset: 'USDC',
          date: new Date(0),
        },
        { email: 'ada@example.com', userId: USER_ID, userAddress: 'GADDR' },
      );

      expect(result).toEqual({ queued: true });
      expect(queueEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ada@example.com',
          subject: 'Deposit confirmed: 5 USDC',
          userAddress: 'GADDR',
          fromName: 'Stow',
          html: expect.stringContaining('<!DOCTYPE html>'),
          text: expect.stringContaining('Deposit confirmed'),
        }),
      );
    });

    it('passes through a refusal from the email service', async () => {
      const { service, queueEmail } = makeService();
      queueEmail.mockResolvedValue({ queued: false, reason: 'opted out' });

      await expect(
        service.send(
          'welcome',
          { userName: 'Ada' },
          {
            email: 'ada@example.com',
            userId: USER_ID,
          },
        ),
      ).resolves.toEqual({ queued: false, reason: 'opted out' });
    });

    it('does not queue anything when the data is invalid', async () => {
      const { service, queueEmail } = makeService();

      await expect(
        service.send(
          'welcome',
          { userName: '' },
          {
            email: 'ada@example.com',
            userId: USER_ID,
          },
        ),
      ).rejects.toThrow(EmailTemplateError);
      expect(queueEmail).not.toHaveBeenCalled();
    });
  });
});

describe('formatAmount', () => {
  it.each([
    ['0', '0'],
    ['5', '5'],
    ['1000', '1,000'],
    ['1234567.89', '1,234,567.89'],
    ['0.5', '0.5'],
    ['10.5000000', '10.5'],
    ['007', '7'],
    ['1.123456789', '1.1234567'],
    ['99999999999999999999.5', '99,999,999,999,999,999,999.5'],
  ])('formats the string %p as %p', (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it('formats numbers without float noise', () => {
    expect(formatAmount(0.1 + 0.2)).toBe('0.3');
    expect(formatAmount(1500)).toBe('1,500');
  });

  it.each(['', 'abc', '-1', '1e5', '1,000', '1.', '.5'])(
    'rejects %p',
    (input) => {
      expect(() => formatAmount(input)).toThrow(EmailTemplateError);
    },
  );

  it('rejects non-finite numbers and other types', () => {
    expect(() => formatAmount(Number.NaN)).toThrow(EmailTemplateError);
    expect(() => formatAmount(undefined as unknown as string)).toThrow(
      EmailTemplateError,
    );
  });
});

describe('formatDate', () => {
  it('formats in UTC regardless of the server timezone', () => {
    expect(formatDate('2026-12-31T23:30:00Z')).toBe('Dec 31, 2026 (UTC)');
    expect(formatDate(new Date('2026-01-01T00:00:00Z'))).toBe(
      'Jan 1, 2026 (UTC)',
    );
    expect(formatDate(0)).toBe('Jan 1, 1970 (UTC)');
  });

  it('rejects an invalid date', () => {
    expect(() => formatDate('nope')).toThrow(EmailTemplateError);
  });
});

describe('shortenAddress', () => {
  it('shortens Stellar addresses and leaves other text alone', () => {
    expect(shortenAddress(GENUINE_ADDRESS)).toBe('GABC…TUVW');
    expect(shortenAddress('My bank account')).toBe('My bank account');
  });
});

describe('fillTemplate', () => {
  it('escapes {{x}} but not {{{x}}} when escaping is on', () => {
    expect(fillTemplate('{{a}} {{{b}}}', { a: '<b>', b: '<b>' }, true)).toBe(
      '&lt;b&gt; <b>',
    );
  });

  it('never escapes when escaping is off', () => {
    expect(fillTemplate('{{a}}', { a: '<b>' }, false)).toBe('<b>');
  });

  it('tolerates spaces inside the braces', () => {
    expect(fillTemplate('{{ a }}', { a: 'x' }, true)).toBe('x');
  });

  it('throws for a missing value', () => {
    expect(() => fillTemplate('{{missing}}', {}, true)).toThrow(
      'Missing value for "missing"',
    );
  });
});
