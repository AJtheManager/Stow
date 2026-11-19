import { EventEmitter } from 'events';
import { AuditLoggerService } from './audit-logger.service';
import { AuditMiddleware, shouldSkip } from './audit.middleware';

type Entry = Parameters<AuditLoggerService['recordSafely']>[0];

function setup() {
  const recorded: Entry[] = [];
  const auditLogger = {
    recordSafely: jest.fn((entry: Entry) => {
      recorded.push(entry);
      return Promise.resolve();
    }),
  } as unknown as AuditLoggerService;
  const middleware = new AuditMiddleware(auditLogger);
  return { middleware, recorded, auditLogger };
}

interface FakeRequest {
  method: string;
  path: string;
  baseUrl?: string;
  route?: { path: string };
  ip?: string;
  user?: { id?: string };
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  get: (name: string) => string | undefined;
}

function request(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return {
    method: 'GET',
    path: '/api/v1/goals/7',
    baseUrl: '',
    route: { path: '/api/v1/goals/:id' },
    ip: '203.0.113.9',
    params: {},
    query: {},
    get: (name: string) =>
      name.toLowerCase() === 'user-agent' ? 'TestAgent/1.0' : undefined,
    ...overrides,
  };
}

function response(statusCode = 200) {
  const res = new EventEmitter() as EventEmitter & { statusCode: number };
  res.statusCode = statusCode;
  return res;
}

function run(
  middleware: AuditMiddleware,
  req: FakeRequest,
  res: ReturnType<typeof response>,
  { finish = true } = {},
) {
  const next = jest.fn();
  middleware.use(req as never, res as never, next);
  if (finish) res.emit('finish');
  return next;
}

describe('AuditMiddleware', () => {
  it('lets the request continue', () => {
    const { middleware } = setup();

    const next = run(middleware, request(), response());

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('records the request only after the response has finished', () => {
    const { middleware, auditLogger } = setup();
    const res = response();

    run(middleware, request(), res, { finish: false });
    expect(auditLogger.recordSafely).not.toHaveBeenCalled();

    res.emit('finish');
    expect(auditLogger.recordSafely).toHaveBeenCalledTimes(1);
  });

  it('records the user, route, status, IP and user agent', () => {
    const { middleware, recorded } = setup();
    const res = response(201);

    run(middleware, request({ method: 'POST', user: { id: 'user-1' } }), res);

    expect(recorded[0]).toMatchObject({
      userId: 'user-1',
      action: 'POST /api/v1/goals/:id',
      method: 'POST',
      endpoint: '/api/v1/goals/:id',
      statusCode: 201,
      ipAddress: '203.0.113.9',
      userAgent: 'TestAgent/1.0',
    });
    expect(recorded[0].durationMs).toEqual(expect.any(Number));
    expect(recorded[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('measures how long the request took', () => {
    jest.useFakeTimers();
    try {
      const { middleware, recorded } = setup();
      const res = response();

      run(middleware, request(), res, { finish: false });
      jest.advanceTimersByTime(250);
      res.emit('finish');

      expect(recorded[0].durationMs).toBe(250);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the route template, not the raw URL, so patterns group together', () => {
    const { middleware, recorded } = setup();

    run(middleware, request({ path: '/api/v1/goals/111' }), response());
    run(middleware, request({ path: '/api/v1/goals/222' }), response());

    expect(recorded.map((e) => e.endpoint)).toEqual([
      '/api/v1/goals/:id',
      '/api/v1/goals/:id',
    ]);
  });

  it('prefixes the base URL of a mounted router', () => {
    const { middleware, recorded } = setup();

    run(
      middleware,
      request({ baseUrl: '/api/v1', route: { path: '/goals/:id' } }),
      response(),
    );

    expect(recorded[0].endpoint).toBe('/api/v1/goals/:id');
  });

  it('records anonymous requests with no user', () => {
    const { middleware, recorded } = setup();

    run(middleware, request(), response());

    expect(recorded[0].userId).toBeNull();
  });

  it('picks up a user attached by a guard that ran later', () => {
    const { middleware, recorded } = setup();
    const req = request();
    const res = response();

    middleware.use(req as never, res as never, jest.fn());
    req.user = { id: 'late-user' };
    res.emit('finish');

    expect(recorded[0].userId).toBe('late-user');
  });

  it.each([401, 403, 404, 500])(
    'records failed requests too (status %i)',
    (status) => {
      const { middleware, recorded } = setup();

      run(middleware, request(), response(status));

      expect(recorded[0].statusCode).toBe(status);
    },
  );

  describe('requests that matched no route', () => {
    it('logs them under a fixed endpoint and keeps the path in the metadata', () => {
      const { middleware, recorded } = setup();

      run(
        middleware,
        request({ path: '/wp-admin/setup.php', route: undefined }),
        response(404),
      );

      expect(recorded[0]).toMatchObject({
        endpoint: '(unmatched)',
        action: 'GET (unmatched)',
        statusCode: 404,
      });
      expect(recorded[0].metadata).toMatchObject({
        path: '/wp-admin/setup.php',
      });
    });
  });

  describe('what is and is not recorded', () => {
    it('records route params and the names of query parameters', () => {
      const { middleware, recorded } = setup();

      run(
        middleware,
        request({
          params: { id: '7' },
          query: { expand: 'x', token: 'secret-value' },
        }),
        response(),
      );

      expect(recorded[0].metadata).toEqual({
        params: { id: '7' },
        queryKeys: ['expand', 'token'],
      });
      expect(JSON.stringify(recorded[0])).not.toContain('secret-value');
    });

    it('never records the request body', () => {
      const { middleware, recorded } = setup();

      run(
        middleware,
        request({
          method: 'POST',
          body: { password: 'hunter2', mnemonic: 'one two three' },
        }),
        response(),
      );

      const text = JSON.stringify(recorded[0]);
      expect(text).not.toContain('hunter2');
      expect(text).not.toContain('one two three');
    });

    it('sends no metadata when there is none to send', () => {
      const { middleware, recorded } = setup();

      run(middleware, request(), response());

      expect(recorded[0].metadata).toEqual({});
    });
  });

  describe('skipped requests', () => {
    it.each([
      '/health',
      '/api/health',
      '/api/v1/health/live',
      '/metrics',
      '/api/v1/metrics',
      '/api/v1/docs',
      '/api/v1/docs/swagger-ui.css',
      '/favicon.ico',
    ])('does not record %s', (path) => {
      const { middleware, auditLogger } = setup();

      const next = run(middleware, request({ path }), response());

      expect(next).toHaveBeenCalledTimes(1);
      expect(auditLogger.recordSafely).not.toHaveBeenCalled();
    });

    it('does not record CORS preflight requests', () => {
      const { middleware, auditLogger } = setup();

      run(middleware, request({ method: 'OPTIONS' }), response(204));

      expect(auditLogger.recordSafely).not.toHaveBeenCalled();
    });

    it('does not skip look-alike paths', () => {
      expect(shouldSkip('/healthy-habits')).toBe(false);
      expect(shouldSkip('/api/v1/goals')).toBe(false);
      expect(shouldSkip('/metrics-report')).toBe(false);
    });
  });

  it('does not block or fail the response when logging is slow or broken', () => {
    const auditLogger = {
      recordSafely: jest.fn(() => new Promise<void>(() => undefined)),
    } as unknown as AuditLoggerService;
    const middleware = new AuditMiddleware(auditLogger);
    const res = response();

    const next = run(middleware, request(), res, { finish: false });

    expect(next).toHaveBeenCalledTimes(1);
    expect(() => res.emit('finish')).not.toThrow();
  });

  it('records each request once even if finish is emitted again', () => {
    const { middleware, auditLogger } = setup();
    const res = response();

    run(middleware, request(), res);
    res.emit('finish');

    expect(auditLogger.recordSafely).toHaveBeenCalledTimes(1);
  });
});
