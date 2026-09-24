import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  type INestApplication,
  Injectable,
  Module,
  UseGuards
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvelopeBody, HttpEnvelopeModule } from 'nestjs-http-envelope';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessControlGuard } from './accesscontrol.guard';
import { AccessControlModule } from './accesscontrol.module';
import { ReadAny } from './decorators';
import { FilterResponse } from './permission';

// End to end through Nest's real router (platform-express) with the published
// nestjs-http-envelope: its global interceptor wraps @FilterResponse(), so the
// filter sees the handler's EnvelopeBody before the envelope unwraps it. The
// unit tests in permission.spec.ts use a stand-in wrapper; this proves the
// real one takes the same path.

/** Stands in for an auth guard: every caller is a `user`. */
@Injectable()
class UserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    ctx.switchToHttp().getRequest<{ user?: unknown }>().user = { role: 'user' };
    return true;
  }
}

const ARTICLES = [
  { id: 1, title: 'A', secret: 'S1' },
  { id: 2, title: 'B', secret: 'S2' }
];
const PAGINATION = { page: 1, perPage: 2, total: 2 };

@UseGuards(UserGuard, AccessControlGuard)
@Controller('articles')
class ArticlesController {
  @ReadAny('article')
  @FilterResponse()
  @Get()
  list() {
    return new EnvelopeBody(ARTICLES, { pagination: PAGINATION });
  }

  @ReadAny('article')
  @FilterResponse()
  @Get('first')
  first() {
    return ARTICLES[0];
  }
}

@Module({
  imports: [
    HttpEnvelopeModule.forRoot({ timestamp: () => 'TS' }),
    // A `user` may read every article attribute except `secret`.
    AccessControlModule.forRoot({
      grants: { user: { article: { read: [{ possession: 'any', attributes: ['*', '!secret'] }] } } }
    })
  ],
  controllers: [ArticlesController]
})
class AppModule {}

let app: INestApplication;
let base: string;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

afterAll(async () => {
  await app.close();
});

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
}

describe('@FilterResponse() under nestjs-http-envelope, through the real router', () => {
  it('filters the items of an EnvelopeBody and keeps its extras hoisted', async () => {
    expect(await get('/articles')).toEqual({
      status: 200,
      body: {
        statusCode: 200,
        timestamp: 'TS',
        pagination: PAGINATION,
        data: [
          { id: 1, title: 'A' },
          { id: 2, title: 'B' }
        ]
      }
    });
  });

  it('filters a plain object return inside the envelope', async () => {
    expect(await get('/articles/first')).toEqual({
      status: 200,
      body: { statusCode: 200, timestamp: 'TS', data: { id: 1, title: 'A' } }
    });
  });
});
