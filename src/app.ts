import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from '@koa/bodyparser';
import Router from '@koa/router';
import { tokenMiddleware } from './middleware.js';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import { validateRequest } from './validator.js';
import { decodeToken } from './helper/crypt.js';
import { ProviderFactory } from './provider/factory.js';
const router = new Router({
  prefix: '/v1'
});

const app = new Koa();

const port = getConfig('PORT', '3000');

app.use(cors({
  origin: '*'
}));

app.use(bodyParser({
  jsonLimit: '50mb',
  encoding: 'utf-8'
}));

app.use(router.routes()).use(router.allowedMethods());

router.use(tokenMiddleware());

// Error handler
router.use(async (ctx, next) => {
  try {
    await next();
  } catch(err) {
    const message = (err as Error).message;
    logger.error(message);
    ctx.body = {
      message
    };
    ctx.res.statusCode = 422;
  }
});

router.post('/chat/completions', async (ctx) => {
  const data = validateRequest(ctx);

  const { model, messages, system, stream = false } = data;

  const token = ctx.state.token as string;

  if (!token) {
    ctx.body = { message: 'Missing token' };
    ctx.res.statusCode = 404;
    return;
  }

  const decodedToken = decodeToken(token);

  if (!decodedToken) {
    ctx.body = { message: 'Invalid token' };
    ctx.res.statusCode = 401;
    return;
  }

  if (decodedToken.exp < Date.now() / 1000) {
    ctx.body = { message: 'Token expired' };
    ctx.res.statusCode = 401;
    return;
  }

  // Sử dụng Factory để lấy provider và API key
  const provider = ProviderFactory.getProvider(model);
  const apiKey = ProviderFactory.getApiKeyForProvider(provider);

  if (!stream) {
    const response = await provider(apiKey, { model, messages, system });
    ctx.body = response;
    return;
  }

  // Stream response
  ctx.res.setHeader('Content-Type', 'text/event-stream');
  ctx.res.setHeader('Cache-Control', 'no-cache');
  ctx.res.setHeader('Connection', 'keep-alive');
  ctx.res.statusCode = 200;

  await provider(apiKey, { model, messages, system }, (msg: Record<string, unknown>) => {
    const eventData = `data: ${JSON.stringify(msg)}\n\n`;
    ctx.res.write(eventData, 'utf-8');
  });
  ctx.res.write('data: [DONE]\n\n');
  ctx.res.end();
});

app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});