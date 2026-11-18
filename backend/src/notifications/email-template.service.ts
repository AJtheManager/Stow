import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EmailService } from './email.service';

/** Brand shown as the sender name on every Stow email. */
export const STOW_EMAIL_FROM_NAME = 'Stow';

export type StowEmailTemplate =
  | 'welcome'
  | 'deposit'
  | 'withdrawal'
  | 'goal-achieved';

export interface WelcomeEmailData {
  userName: string;
}

export interface DepositEmailData {
  userName: string;
  /** Decimal amount, e.g. "125.5" or 125.5. */
  amount: string | number;
  asset: string;
  date: Date | string | number;
  transactionId?: string;
}

export interface WithdrawalEmailData {
  userName: string;
  amount: string | number;
  asset: string;
  date: Date | string | number;
  /** Where the funds went. Long Stellar addresses are shortened. */
  destination?: string;
  transactionId?: string;
}

export interface GoalAchievedEmailData {
  userName: string;
  goalName: string;
  targetAmount: string | number;
  asset: string;
  date: Date | string | number;
}

export interface StowEmailDataMap {
  welcome: WelcomeEmailData;
  deposit: DepositEmailData;
  withdrawal: WithdrawalEmailData;
  'goal-achieved': GoalAchievedEmailData;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailRecipient {
  email: string;
  /** Used to sign the unsubscribe link. */
  userId: string;
  /** Lets EmailService honour the user's email opt-out. */
  userAddress?: string;
}

/** Thrown when a template cannot be rendered because its data is unusable. */
export class EmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailTemplateError';
  }
}

const TEMPLATE_NAMES: readonly StowEmailTemplate[] = [
  'welcome',
  'deposit',
  'withdrawal',
  'goal-achieved',
];

const UNSUBSCRIBE_PURPOSE = 'email-unsubscribe';
const MAX_DECIMALS = 7;
const NOT_AVAILABLE = 'N/A';

/** Matches `{{{raw}}}` first, then `{{escaped}}`, in a single pass. */
const PLACEHOLDER = /\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/**
 * Fills `{{name}}` (HTML-escaped when `escape` is set) and `{{{name}}}` (raw)
 * placeholders in one pass. Because substituted values are never re-scanned,
 * user-supplied text containing `{{...}}` cannot inject another placeholder.
 * Throws if a placeholder has no value, so a half-filled email is never sent.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
  escape: boolean,
): string {
  return template.replace(
    PLACEHOLDER,
    (_match, rawKey: string | undefined, key: string | undefined) => {
      const name = (rawKey ?? key) as string;
      const value = values[name];
      if (value === undefined) {
        throw new EmailTemplateError(`Missing value for "${name}"`);
      }
      return rawKey !== undefined || !escape ? value : escapeHtml(value);
    },
  );
}

/** Removes anything that could break out of a header or a single text line. */
function singleLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EmailTemplateError(`${label} is required`);
  }
  return singleLine(value);
}

/**
 * Formats a decimal amount for display: thousands separators and no trailing
 * zeros, up to 7 decimals. Strings are handled digit-by-digit so large or
 * high-precision values are never rounded by floating point.
 */
export function formatAmount(value: string | number, label = 'Amount'): string {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new EmailTemplateError(`${label} must be a valid amount`);
    }
    text = value.toFixed(MAX_DECIMALS);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    throw new EmailTemplateError(`${label} must be a valid amount`);
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) {
    throw new EmailTemplateError(`${label} must be a valid amount`);
  }

  const whole = match[1].replace(/^0+(?=\d)/, '');
  const fraction = (match[2] ?? '').slice(0, MAX_DECIMALS).replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

export function formatDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new EmailTemplateError('Date must be a valid date');
  }
  return `${dateFormatter.format(date)} (UTC)`;
}

/** Shortens a Stellar address (G... / C...) to `GABC…WXYZ`; other text is left as is. */
export function shortenAddress(value: string): string {
  const text = singleLine(value);
  return /^[GC][A-Z2-7]{55}$/.test(text)
    ? `${text.slice(0, 4)}…${text.slice(-4)}`
    : text;
}

@Injectable()
export class EmailTemplateService {
  private readonly templates = new Map<
    StowEmailTemplate | 'layout',
    { html: string; text: string }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    const directory = join(__dirname, 'templates');
    for (const name of [...TEMPLATE_NAMES, 'layout'] as const) {
      this.templates.set(name, {
        html: readFileSync(join(directory, `${name}.html`), 'utf8'),
        text: readFileSync(join(directory, `${name}.txt`), 'utf8'),
      });
    }
  }

  /**
   * Renders one email: a subject, a branded responsive HTML body, and a
   * plain-text fallback that carries the same information. Both include an
   * unsubscribe link signed for `userId`.
   *
   * @throws {EmailTemplateError} if required data is missing or malformed.
   */
  render<T extends StowEmailTemplate>(
    template: T,
    data: StowEmailDataMap[T],
    userId: string,
  ): RenderedEmail {
    const parts = this.templates.get(template);
    const layout = this.templates.get('layout');
    if (!parts || !layout) {
      throw new EmailTemplateError(`Unknown template "${String(template)}"`);
    }

    const { subject, preheader, values } = this.prepare(template, data);
    const common = {
      appUrl: this.appUrl(),
      unsubscribeUrl: this.unsubscribeUrl(userId),
    };
    const all = { ...values, ...common, subject, preheader };

    const htmlBody = fillTemplate(parts.html, all, true);
    const textBody = fillTemplate(parts.text, all, false);

    return {
      subject,
      html: fillTemplate(layout.html, { ...all, content: htmlBody }, true),
      text: fillTemplate(layout.text, { ...all, content: textBody }, false),
    };
  }

  /** Renders a template and queues it for delivery from the Stow sender. */
  async send<T extends StowEmailTemplate>(
    template: T,
    data: StowEmailDataMap[T],
    recipient: EmailRecipient,
  ): Promise<{ queued: boolean; reason?: string }> {
    const { subject, html, text } = this.render(
      template,
      data,
      recipient.userId,
    );
    return this.emailService.queueEmail({
      to: recipient.email,
      subject,
      html,
      text,
      userAddress: recipient.userAddress,
      fromName: STOW_EMAIL_FROM_NAME,
    });
  }

  /** The link placed in every email's footer. */
  unsubscribeUrl(userId: string): string {
    const base = this.apiUrl();
    const token = this.createUnsubscribeToken(userId);
    return `${base}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  /** Signs `userId` so an unsubscribe link cannot be forged for someone else. */
  createUnsubscribeToken(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ u: userId, p: UNSUBSCRIBE_PURPOSE }),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  /** Returns the user id a valid token was issued for, or `null`. */
  verifyUnsubscribeToken(token: string): string | null {
    if (typeof token !== 'string') return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;

    const payload = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1), 'base64url');
    const expected = Buffer.from(this.sign(payload), 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { u?: unknown; p?: unknown };
      return parsed.p === UNSUBSCRIBE_PURPOSE &&
        typeof parsed.u === 'string' &&
        parsed.u !== ''
        ? parsed.u
        : null;
    } catch {
      return null;
    }
  }

  private prepare<T extends StowEmailTemplate>(
    template: T,
    data: StowEmailDataMap[T],
  ): {
    subject: string;
    preheader: string;
    values: Record<string, string>;
  } {
    switch (template) {
      case 'welcome': {
        const d = data as WelcomeEmailData;
        const userName = requireText(d.userName, 'User name');
        return {
          subject: 'Welcome to Stow',
          preheader: 'Your account is ready. Make your first deposit.',
          values: { userName },
        };
      }
      case 'deposit': {
        const d = data as DepositEmailData;
        const amount = formatAmount(d.amount);
        const asset = requireText(d.asset, 'Asset');
        return {
          subject: `Deposit confirmed: ${amount} ${asset}`,
          preheader: `Your deposit of ${amount} ${asset} was confirmed.`,
          values: {
            userName: requireText(d.userName, 'User name'),
            amount,
            asset,
            date: formatDate(d.date),
            transactionId: d.transactionId
              ? singleLine(d.transactionId)
              : NOT_AVAILABLE,
          },
        };
      }
      case 'withdrawal': {
        const d = data as WithdrawalEmailData;
        const amount = formatAmount(d.amount);
        const asset = requireText(d.asset, 'Asset');
        return {
          subject: `Withdrawal confirmed: ${amount} ${asset}`,
          preheader: `Your withdrawal of ${amount} ${asset} was processed.`,
          values: {
            userName: requireText(d.userName, 'User name'),
            amount,
            asset,
            date: formatDate(d.date),
            destination: d.destination
              ? shortenAddress(d.destination)
              : NOT_AVAILABLE,
            transactionId: d.transactionId
              ? singleLine(d.transactionId)
              : NOT_AVAILABLE,
          },
        };
      }
      case 'goal-achieved': {
        const d = data as GoalAchievedEmailData;
        const goalName = requireText(d.goalName, 'Goal name');
        const targetAmount = formatAmount(d.targetAmount, 'Target amount');
        const asset = requireText(d.asset, 'Asset');
        return {
          subject: `Goal achieved: ${goalName}`,
          preheader: `You reached ${targetAmount} ${asset} for ${goalName}.`,
          values: {
            userName: requireText(d.userName, 'User name'),
            goalName,
            targetAmount,
            asset,
            date: formatDate(d.date),
          },
        };
      }
      default:
        throw new EmailTemplateError(`Unknown template "${String(template)}"`);
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret())
      .update(payload)
      .digest('base64url');
  }

  private secret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new EmailTemplateError(
        'JWT_SECRET is required to sign unsubscribe links',
      );
    }
    return secret;
  }

  private appUrl(): string {
    return (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

  private apiUrl(): string {
    return (
      this.configService.get<string>('API_PUBLIC_URL') ??
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  }
}
