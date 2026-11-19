/**
 * Integration test for branded email notifications (#575).
 *
 * Wires the real EmailTemplateService, EmailService and unsubscribe
 * controller together over in-memory repositories, with only the SendGrid
 * HTTP call faked. It follows one email from rendering to delivery, then
 * follows its unsubscribe link and checks that no further email is sent.
 */
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { EmailUnsubscribeController } from './email-unsubscribe.controller';
import { NotificationCategoryPreference } from './entities/notification-category-preference.entity';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';

const SECRET = 'integration-test-secret-with-more-than-32-chars';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

interface SentMail {
  subject: string;
  from: { email: string; name: string };
  to: string;
  text: string;
  html: string;
}

function makeRepository<T extends { id?: string; userId?: string }>(
  rows: T[],
  key: 'id' | 'userId' | 'stellar_address',
) {
  return {
    rows,
    findOne: jest.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        rows.find((row) =>
          Object.entries(where).every(
            ([field, value]) =>
              (row as Record<string, unknown>)[field] === value,
          ),
        ) ?? null,
      ),
    ),
    create: jest.fn((entity: T) => ({ ...entity })),
    save: jest.fn((entity: T) => {
      const existing = rows.find(
        (row) =>
          (row as Record<string, unknown>)[key] ===
          (entity as Record<string, unknown>)[key],
      );
      if (existing) {
        Object.assign(existing, entity);
        return Promise.resolve(existing);
      }
      rows.push(entity);
      return Promise.resolve(entity);
    }),
  };
}

describe('Branded email notifications (integration)', () => {
  let templates: EmailTemplateService;
  let emailService: EmailService;
  let controller: EmailUnsubscribeController;
  let preferences: ReturnType<typeof makeRepository<UserPreferences>>;
  let sent: SentMail[];
  const realFetch = global.fetch;

  /** Delivers the next queued email through the real queue and SendGrid code path. */
  async function flushQueue(): Promise<void> {
    await (
      emailService as unknown as { processQueue: () => Promise<void> }
    ).processQueue();
  }

  beforeEach(async () => {
    sent = [];
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      sent.push({
        subject: body.subject,
        from: body.from,
        to: body.personalizations[0].to[0].email,
        text: body.content.find(
          (c: { type: string }) => c.type === 'text/plain',
        ).value,
        html: body.content.find((c: { type: string }) => c.type === 'text/html')
          .value,
      });
      return Promise.resolve({
        ok: true,
        status: 202,
        text: () => Promise.resolve(''),
      } as Response);
    }) as unknown as typeof fetch;

    const users = makeRepository<User>(
      [{ id: USER_ID, stellar_address: ADDRESS } as User],
      'id',
    );
    preferences = makeRepository<UserPreferences>([], 'userId');
    const categoryPreferences = makeRepository<NotificationCategoryPreference>(
      [],
      'userId',
    );

    const config: Record<string, string> = {
      JWT_SECRET: SECRET,
      SENDGRID_API_KEY: 'sg-test-key',
      EMAIL_FROM: 'hello@stow.example',
      FRONTEND_URL: 'https://stow.example',
      API_PUBLIC_URL: 'https://api.stow.example',
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailUnsubscribeController],
      providers: [
        EmailService,
        EmailTemplateService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => config[key] },
        },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(UserPreferences), useValue: preferences },
        {
          provide: getRepositoryToken(NotificationCategoryPreference),
          useValue: categoryPreferences,
        },
      ],
    }).compile();

    templates = module.get(EmailTemplateService);
    emailService = module.get(EmailService);
    controller = module.get(EmailUnsubscribeController);
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  const recipient = {
    email: 'ada@example.com',
    userId: USER_ID,
    userAddress: ADDRESS,
  };

  it('sends a branded welcome email with an HTML body and a plain-text fallback', async () => {
    const result = await templates.send(
      'welcome',
      { userName: 'Ada' },
      recipient,
    );
    expect(result).toEqual({ queued: true });

    await flushQueue();

    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.to).toBe('ada@example.com');
    expect(mail.subject).toBe('Welcome to Stow');
    expect(mail.from).toEqual({ email: 'hello@stow.example', name: 'Stow' });
    expect(mail.html).toContain('Welcome to Stow, Ada');
    expect(mail.text).toContain('Welcome to Stow, Ada');
  });

  it.each([
    [
      'deposit',
      { userName: 'Ada', amount: '250', asset: 'USDC', date: '2026-09-01' },
      'Deposit confirmed: 250 USDC',
    ],
    [
      'withdrawal',
      { userName: 'Ada', amount: '40.5', asset: 'USDC', date: '2026-09-02' },
      'Withdrawal confirmed: 40.5 USDC',
    ],
    [
      'goal-achieved',
      {
        userName: 'Ada',
        goalName: 'Laptop',
        targetAmount: '2000',
        asset: 'USDC',
        date: '2026-09-03',
      },
      'Goal achieved: Laptop',
    ],
  ] as const)(
    'delivers the %s email with the right values',
    async (template, data, subject) => {
      await templates.send(template, data as never, recipient);
      await flushQueue();

      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toBe(subject);
      expect(sent[0].from.name).toBe('Stow');
      expect(sent[0].html).not.toMatch(/\{\{/);
      expect(sent[0].text).not.toMatch(/\{\{/);
    },
  );

  it('includes an unsubscribe link in every delivered email', async () => {
    await templates.send('welcome', { userName: 'Ada' }, recipient);
    await templates.send(
      'deposit',
      { userName: 'Ada', amount: '1', asset: 'USDC', date: new Date(0) },
      recipient,
    );
    await flushQueue();
    await flushQueue();

    expect(sent).toHaveLength(2);
    for (const mail of sent) {
      expect(mail.html).toContain(
        'api.stow.example/api/v1/notifications/unsubscribe?token=',
      );
      expect(mail.text).toContain(
        'Unsubscribe: https://api.stow.example/api/v1/notifications/unsubscribe?token=',
      );
    }
  });

  describe('following the unsubscribe link', () => {
    async function deliveredUnsubscribeToken(): Promise<string> {
      await templates.send('welcome', { userName: 'Ada' }, recipient);
      await flushQueue();
      const match = /Unsubscribe: (\S+)/.exec(sent[sent.length - 1].text);
      return new URL(match![1]).searchParams.get('token')!;
    }

    it('turns email notifications off and confirms it', async () => {
      const token = await deliveredUnsubscribeToken();

      const page = await controller.unsubscribeFromLink(token);

      expect(page).toContain('You are unsubscribed');
      expect(preferences.rows).toHaveLength(1);
      expect(preferences.rows[0]).toMatchObject({
        userId: USER_ID,
        email_notifications: false,
      });
    });

    it('stops further emails to that user', async () => {
      const token = await deliveredUnsubscribeToken();
      await controller.unsubscribeFromLink(token);

      const result = await templates.send(
        'welcome',
        { userName: 'Ada' },
        recipient,
      );
      await flushQueue();

      expect(result.queued).toBe(false);
      expect(result.reason).toMatch(/opted out/i);
      expect(sent).toHaveLength(1);
    });

    it('updates an existing preferences row instead of adding another', async () => {
      preferences.rows.push({
        userId: USER_ID,
        email_notifications: true,
        marketing_emails: true,
      } as UserPreferences);
      const token = await deliveredUnsubscribeToken();

      await controller.unsubscribeFromLink(token);

      expect(preferences.rows).toHaveLength(1);
      expect(preferences.rows[0].email_notifications).toBe(false);
      expect(preferences.rows[0].marketing_emails).toBe(true);
    });

    it('is safe to open more than once', async () => {
      const token = await deliveredUnsubscribeToken();

      await controller.unsubscribeFromLink(token);
      await expect(controller.unsubscribeFromLink(token)).resolves.toContain(
        'You are unsubscribed',
      );
      expect(preferences.rows).toHaveLength(1);
    });

    it('supports one-click unsubscribe via POST', async () => {
      const token = await deliveredUnsubscribeToken();

      await expect(controller.unsubscribeOneClick(token)).resolves.toEqual({
        unsubscribed: true,
      });
      expect(preferences.rows[0].email_notifications).toBe(false);
    });

    it.each([undefined, '', 'garbage', 'a.b'])(
      'rejects the invalid token %p and changes nothing',
      async (token) => {
        await expect(
          controller.unsubscribeFromLink(token),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          controller.unsubscribeOneClick(token),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(preferences.rows).toHaveLength(0);
      },
    );

    it('rejects a link signed for a user that no longer exists', async () => {
      const token = templates.createUnsubscribeToken(
        '99999999-9999-4999-8999-999999999999',
      );

      await expect(
        controller.unsubscribeFromLink(token),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(preferences.rows).toHaveLength(0);
    });

    it('cannot be used to unsubscribe somebody else', async () => {
      const token = await deliveredUnsubscribeToken();
      const [payload, signature] = token.split('.');
      const forged = Buffer.from(
        JSON.stringify({ u: 'someone-else', p: 'email-unsubscribe' }),
      ).toString('base64url');

      await expect(
        controller.unsubscribeFromLink(`${forged}.${signature}`),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(payload).not.toBe(forged);
      expect(preferences.rows).toHaveLength(0);
    });
  });

  it('keeps the legacy sender name for emails that do not set one', async () => {
    await emailService.queueEmail({
      to: 'ada@example.com',
      subject: 'Legacy',
      html: '<p>x</p>',
      text: 'x',
    });
    await flushQueue();

    expect(sent[0].from.name).toBe('InsightArena');
  });
});
