import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import {
  AccessPattern,
  AuditLoggerService,
  AuditSearchResult,
} from './audit-logger.service';
import {
  AccessPatternsDto,
  AuditFilterDto,
  AuditSearchDto,
} from './dto/audit-query.dto';

/** Admin-only access to the audit trail. Reads are themselves audited. */
@ApiTags('Audit')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles(Role.Admin)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class AuditController {
  constructor(private readonly auditLogger: AuditLoggerService) {}

  @Get()
  @ApiOperation({ summary: 'Search audit logs' })
  @ApiResponse({
    status: 200,
    description: 'A page of decrypted audit entries',
  })
  search(@Query() query: AuditSearchDto): Promise<AuditSearchResult> {
    const { page, limit, ...filters } = query;
    return this.auditLogger.search(filters, page, limit);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  @ApiResponse({ status: 200, description: 'CSV of every matching entry' })
  async export(
    @Query() query: AuditFilterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-logs-${stamp}.csv"`,
    );
    return this.auditLogger.exportCsv(query);
  }

  @Get('access-patterns')
  @ApiOperation({ summary: 'Most-used endpoints and their error rates' })
  @ApiResponse({ status: 200, description: 'Per-endpoint access statistics' })
  accessPatterns(@Query() query: AccessPatternsDto): Promise<AccessPattern[]> {
    const { top, ...filters } = query;
    return this.auditLogger.getAccessPatterns(filters, top);
  }
}
