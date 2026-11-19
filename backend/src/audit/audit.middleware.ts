import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AuditLoggerService } from './audit-logger.service';

/** Paths that would only add noise: probes, scrapes and API docs. */
const SKIPPED_PREFIXES = [
  '/health',
  '/api/health',
  '/api/v1/health',
  '/metrics',
  '/api/metrics',
  '/api/v1/metrics',
  '/api/v1/docs',
  '/favicon.ico',
];

const UNMATCHED_ENDPOINT = '(unmatched)';

export function shouldSkip(path: string): boolean {
  return SKIPPED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

type AuditedRequest = Request & { user?: { id?: string } };

/**
 * Records every API request once the response is sent.
 *
 * It runs as middleware (before guards) so requests rejected with 401/403
 * are still logged, and it waits for the response to finish so the status
 * code, duration and authenticated user are all known. The request and
 * response bodies are never recorded.
 */
@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private readonly auditLogger: AuditLoggerService) {}

  use(req: AuditedRequest, res: Response, next: NextFunction): void {
    if (req.method === 'OPTIONS' || shouldSkip(req.path)) {
      next();
      return;
    }

    const startedAt = Date.now();
    res.once('finish', () => {
      // The matched route template keeps cardinality bounded; the raw path
      // goes into the encrypted metadata only for requests that matched none.
      const template = (req.route as { path?: string } | undefined)?.path;
      const endpoint = template
        ? `${req.baseUrl ?? ''}${template}`
        : UNMATCHED_ENDPOINT;

      void this.auditLogger.recordSafely({
        userId: req.user?.id ?? null,
        action: `${req.method} ${endpoint}`,
        method: req.method,
        endpoint,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        metadata: {
          ...(template ? {} : { path: req.path }),
          ...(req.params && Object.keys(req.params).length
            ? { params: req.params }
            : {}),
          ...(Object.keys(req.query ?? {}).length
            ? { queryKeys: Object.keys(req.query) }
            : {}),
        },
      });
    });

    next();
  }
}
