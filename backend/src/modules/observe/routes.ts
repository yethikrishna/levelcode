import { FastifyInstance } from 'fastify';
import { Observe } from '@mynd/observe';

const observe = new Observe({
  analytics: {
    enabled: true,
    trackPageViews: true,
    trackEvents: true,
    trackErrors: true,
    trackPerformance: true,
    samplingRate: 1.0,
    retentionDays: 30,
  },
  sessionReplay: {
    enabled: true,
    captureDOM: true,
    captureConsole: true,
    captureNetwork: true,
    captureMouse: true,
    maskSensitiveData: true,
    maxDuration: 3600,
    samplingRate: 0.1,
  },
  featureFlags: {
    enabled: true,
    defaultStrategy: 'off',
    cacheTTL: 60,
    evaluationContext: ['user', 'group', 'environment'],
  },
  tracing: {
    enabled: true,
    serviceName: 'mynd-platform',
    samplingRate: 0.5,
    includeHeaders: false,
    includeBody: false,
  },
});

export async function registerObserveRoutes(app: FastifyInstance): Promise<void> {
  await observe.initialize();

  // Analytics
  app.post('/api/observe/events/track', async (request, reply) => {
    try {
      const event = await observe.trackEvent(request.body as any);
      return reply.send(event);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to track event',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.post('/api/observe/pageviews', async (request, reply) => {
    try {
      const pageView = await observe.trackPageView(request.body as any);
      return reply.send(pageView);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to track page view',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/observe/events', async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '100');
    return reply.send(observe.getRecentEvents(limit));
  });

  // Session Replay
  app.post('/api/observe/sessions/start', async (request, reply) => {
    const { sessionId, userId } = request.body as any;
    try {
      const session = await observe.startSessionReplay(sessionId, userId);
      return reply.send(session);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to start session',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.post('/api/observe/sessions/:sessionId/end', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await observe.endSessionReplay(sessionId);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return reply.send(session);
  });

  app.get('/api/observe/sessions', async (_request, reply) => {
    return reply.send(observe.getSessionReplays());
  });

  // Feature Flags
  app.get('/api/observe/flags', async (_request, reply) => {
    return reply.send(observe.getAllFlags());
  });

  app.get('/api/observe/flags/:flagKey', async (request, reply) => {
    const { flagKey } = request.params as { flagKey: string };
    const flag = observe.getFlag(flagKey);
    if (!flag) {
      return reply.status(404).send({ error: 'Flag not found' });
    }
    return reply.send(flag);
  });

  app.post('/api/observe/flags/evaluate', async (request, reply) => {
    const { flagKey, context } = request.body as any;
    const result = await observe.evaluateFlag(flagKey, context);
    return reply.send(result);
  });

  app.post('/api/observe/flags', async (request, reply) => {
    try {
      const flag = await observe.createFlag(request.body as any);
      return reply.send(flag);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to create flag',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.put('/api/observe/flags/:flagKey', async (request, reply) => {
    const { flagKey } = request.params as { flagKey: string };
    const flag = await observe.updateFlag(flagKey, request.body as any);
    if (!flag) {
      return reply.status(404).send({ error: 'Flag not found' });
    }
    return reply.send(flag);
  });

  // Tracing
  app.post('/api/observe/traces/start', async (request, reply) => {
    const { name, service, operation, parentSpanId } = request.body as any;
    try {
      const span = await observe.startTrace(name, service, operation, parentSpanId);
      return reply.send(span);
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to start trace',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.post('/api/observe/traces/:spanId/end', async (request, reply) => {
    const { spanId } = request.params as { spanId: string };
    const { status } = request.body as { status?: 'ok' | 'error' };
    await observe.endTrace(spanId, status);
    return reply.send({ success: true });
  });

  app.get('/api/observe/traces', async (request, reply) => {
    const limit = parseInt((request.query as any).limit || '50');
    return reply.send(observe.getTraces(limit));
  });

  // Dashboard
  app.get('/api/observe/dashboard', async (_request, reply) => {
    return reply.send(observe.getDashboardMetrics());
  });
}
