import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { User } from '../users/entities/user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { EmailTemplateService } from './email-template.service';

const INVALID_LINK_MESSAGE = 'This unsubscribe link is invalid.';

const CONFIRMATION_PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Unsubscribed from Stow emails</title>
  </head>
  <body style="margin:0;padding:48px 20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <main style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 12px 0;font-size:24px;">You are unsubscribed</h1>
      <p style="margin:0;font-size:16px;line-height:24px;color:#334155;">You will no longer receive Stow emails. You can turn email notifications back on in your Stow settings at any time.</p>
    </main>
  </body>
</html>`;

/**
 * Handles the unsubscribe link in the footer of every Stow email. It is
 * public because it is opened from an email client, so the signed token in
 * the link is the only credential: it names exactly one user and cannot be
 * forged without the server secret.
 */
@ApiTags('Notifications')
@Controller('notifications/unsubscribe')
@Public()
export class EmailUnsubscribeController {
  constructor(
    private readonly emailTemplateService: EmailTemplateService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserPreferences)
    private readonly preferencesRepository: Repository<UserPreferences>,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary: 'Unsubscribe from Stow emails (link in the footer)',
  })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Confirmation page' })
  @ApiResponse({ status: 400, description: 'Invalid unsubscribe link' })
  async unsubscribeFromLink(@Query('token') token?: string): Promise<string> {
    await this.unsubscribe(token);
    return CONFIRMATION_PAGE;
  }

  /** RFC 8058 one-click unsubscribe, used by mail clients that support it. */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'One-click unsubscribe from Stow emails' })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Unsubscribed' })
  @ApiResponse({ status: 400, description: 'Invalid unsubscribe link' })
  async unsubscribeOneClick(
    @Query('token') token?: string,
  ): Promise<{ unsubscribed: true }> {
    await this.unsubscribe(token);
    return { unsubscribed: true };
  }

  /** Turns email notifications off. Safe to call more than once. */
  private async unsubscribe(token: string | undefined): Promise<void> {
    const userId = token
      ? this.emailTemplateService.verifyUnsubscribeToken(token)
      : null;
    if (!userId) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    // A signed link for an account that no longer exists is treated like a
    // bad link rather than creating an orphaned preferences row.
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    const existing = await this.preferencesRepository.findOne({
      where: { userId },
    });
    if (existing) {
      if (existing.email_notifications) {
        existing.email_notifications = false;
        await this.preferencesRepository.save(existing);
      }
      return;
    }

    await this.preferencesRepository.save(
      this.preferencesRepository.create({ userId, email_notifications: false }),
    );
  }
}
