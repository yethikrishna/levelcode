import { FastifyInstance } from 'fastify';
import { Router } from '@mynd/router';

const defaultConfig = {
  providers: [
    {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      models: [
        {
          id: 'gpt-4',
          name: 'GPT-4',
          contextWindow: 8192,
          maxTokens: 4096,
          costPer1KInput: 0.03,
          costPer1KOutput: 0.06,
          capabilities: ['chat', 'reasoning', 'code', 'analysis'],
        },
      ],
      priority: 1,
      weight: 1.0,
    },
  ],
  defaultProvider: 'openai',
  fallbackStrategy: 'sequential',
  maxRetries: 3,
  timeout: 30000,
  compression: true,
} as const;

const router = new Router(defaultConfig as any);

export async function registerRouterRoutes(app: FastifyInstance): Promise<void> {
  await router.initialize();

  app.post('/api/router/route', async (request, reply) => {
    try {
      const result = await router.route(request.body as any);
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({
        error: 'Routing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.get('/api/router/metrics', async (_request, reply) => {
    const metrics = router.getMetrics();
    const health = router.getProviderHealth();
    return reply.send({
      metrics,
      health: Object.fromEntries(health),
    });
  });

  app.post('/api/router/providers', async (request, reply) => {
    try {
      router.addProvider(request.body as any);
      return reply.send({ success: true });
    } catch (error) {
      return reply.status(400).send({
        error: 'Failed to add provider',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.delete('/api/router/providers/:providerId', async (request, reply) => {
    const { providerId } = request.params as { providerId: string };
    router.removeProvider(providerId);
    return reply.send({ success: true });
  });
}
