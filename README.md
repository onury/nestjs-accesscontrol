# nestjs-accesscontrol

<p align="center">
  <a href="https://github.com/onury/nestjs-accesscontrol/actions/workflows/ci.yml"><img src="https://github.com/onury/nestjs-accesscontrol/actions/workflows/ci.yml/badge.svg" alt="build" /></a>
  <a href="#"><img src="https://img.shields.io/badge/coverage-100%25-2BB150?logo=vitest&logoColor=%23FDC72B&style=flat" alt="coverage" /></a>
  <a href="https://stryker-mutator.io/"><img src="https://img.shields.io/badge/mutation-100%25-2BB150?style=flat" alt="mutation score" /></a>
  <a href="https://www.npmjs.com/package/nestjs-accesscontrol"><img src="https://img.shields.io/npm/v/nestjs-accesscontrol.svg?style=flat&label=&color=%23C6234B&logo=npm" alt="version" /></a>
  <a href="https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7"><img src="https://img.shields.io/badge/ESM-F7DF1E?style=flat" alt="ESM" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TS-3260C7?style=flat" alt="TypeScript" /></a>
  <a href="https://github.com/onury/nestjs-accesscontrol/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat" alt="license" /></a>
</p>

The **official** [NestJS](https://nestjs.com) integration for [**AccessControl v3**](https://github.com/onury/accesscontrol) — role & attribute-based access control (RBAC + ABAC) for Node.js.

Fluent CRUD decorators, a fail-closed guard, first-class `forRootAsync` for DB-driven grants, and attribute filtering on the way out — with your auth layer left entirely to you.

> **[ESM](https://gist.github.com/onury/d3f3d765d7db2e8b2d050d14315f2ac7)-only**, like AccessControl v3. Requires Node ≥ 20 and NestJS 10/11.

## Why

As the **first-party** package — from the author of AccessControl — this is a v3-native integration: it speaks accesscontrol's own vocabulary (roles, `action`, possession `own`/`any`, the `Permission` object) and builds on the v3 API (`tryCan`, `Permission.filter()`, declarative conditions) rather than wrapping it in a new one.

> Using AccessControl **v2**? [`nest-access-control`](https://github.com/nestjsx/nest-access-control) remains the right choice.

## Install

```bash
npm install nestjs-accesscontrol accesscontrol
```

`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are peer dependencies (already present in any Nest app).

## Quick start

**1. Define grants** (the fluent accesscontrol API):

```ts
import { AccessControl } from 'accesscontrol';

export const ac = new AccessControl();
ac.grant('user')
  .readAny('article', ['*', '!authorEmail']) // can't see authorEmail
  .createOwn('article')
  .updateOwn('article')
  .deleteOwn('article');
ac.grant('admin').extend('user').updateAny('article').deleteAny('article');
ac.lock();
```

**2. Register the module:**

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessControlModule, AccessControlGuard } from 'nestjs-accesscontrol';
import { ac } from './grants';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [AccessControlModule.forRoot({ ac })],
  providers: [
    // Your auth guard runs FIRST and sets request.user…
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // …then the access-control guard reads request.user.role.
    { provide: APP_GUARD, useClass: AccessControlGuard },
  ],
})
export class AppModule {}
```

Guard order matters: `AccessControlGuard` expects `request.user` to already be populated. Register your auth guard before it (or compose them with `@UseGuards(JwtAuthGuard, AccessControlGuard)` per route).

**3. Declare access on routes:**

```ts
import { Controller, Get, Patch, Param, Body, Req } from '@nestjs/common';
import { ReadAny, UpdateOwn, FilterResponse, assertOwner } from 'nestjs-accesscontrol';
import type { AccessControlRequest } from 'nestjs-accesscontrol';

@Controller('articles')
export class ArticlesController {
  @ReadAny('article')
  @FilterResponse() // strips attributes the role may not see (e.g. authorEmail)
  @Get()
  findAll() {
    return this.articles.findAll();
  }

  @UpdateOwn('article')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDto, @Req() req: AccessControlRequest) {
    const article = await this.articles.find(id);
    // `own` enforcement needs your data — compare the owner yourself:
    assertOwner(req.user?.id, article.authorId);
    return req.permission!.filter(await this.articles.update(id, dto));
  }
}
```

## Decorators

All three forms compile to the same rule metadata and combine with **AND** (every rule on a route must pass).

| Form | Example | Use |
| --- | --- | --- |
| **Fluent CRUD** | `@ReadAny('article')`, `@UpdateOwn('article')` | the everyday surface |
| **Generic** | `@Can('publish', 'article', 'own')` | custom (non-CRUD) actions |
| **Canonical** | `@RequirePermission({ action, resource, possession })` or an **array** | multi-rule / dynamic routes |

The eight fluent decorators map 1:1 onto accesscontrol's methods: `@CreateOwn` `@CreateAny` `@ReadOwn` `@ReadAny` `@UpdateOwn` `@UpdateAny` `@DeleteOwn` `@DeleteAny`. Possession defaults to `any`.

```ts
// Custom (non-CRUD) action — grant it with `ac.grant('editor').action('publish', 'article')`:
@Can('publish', 'article')
@Post(':id/publish')
publish(@Param('id') id: string) { /* … */ }

// Multiple rules on one route — all must pass (AND):
@RequirePermission([
  { action: 'read', resource: 'article' },
  { action: 'update', resource: 'article', possession: 'own' },
])
@Patch(':id')
update() { /* … */ }
```

## DB-driven grants (`forRootAsync`)

```ts
AccessControlModule.forRootAsync({
  imports: [PrismaModule],
  inject: [PrismaService],
  useFactory: async (prisma: PrismaService) => {
    const rows = await prisma.grant.findMany();
    return new AccessControl(rows).lock(); // or return the rows (grants) directly
  },
});
```

The factory may return a built `AccessControl` or a grants object/list — the module locks the latter for you.

## Attribute filtering & ownership

On a granted request the resolved `Permission` is attached to `request.permission` (and all of them, in rule order, as `request.permissions`).

**Filter output** — strip attributes the role may not see. Three equivalent ways:

```ts
import { filterByPermission } from 'nestjs-accesscontrol';

// 1) Declarative — filters the handler's return automatically:
@ReadAny('article')
@FilterResponse()
@Get(':id')
findOne(@Param('id') id: string) {
  return this.articles.find(id);
}

// 2) From the request, inside the handler:
findOne(@Req() req: AccessControlRequest) {
  return req.permission?.filter(await this.articles.find(id));
}

// 3) In a service (no request handy), with the helper:
const visible = filterByPermission(permission, article);
```

**Enforce `own`** — the guard authorizes the _grant_ (may this role update its own articles?), but only your code knows who owns a given record. Load it and compare:

```ts
import { assertOwner } from 'nestjs-accesscontrol';

const article = await this.articles.find(id);
assertOwner(req.user.id, article.authorId); // throws ForbiddenException on mismatch
```

**Ad-hoc checks** — inject the shared `AccessControl` to query grants anywhere:

```ts
import { InjectAccessControl } from 'nestjs-accesscontrol';
import { AccessControl } from 'accesscontrol';

constructor(@InjectAccessControl() private readonly ac: AccessControl) {}

canPromote(role: string) {
  return this.ac.tryCan(role).updateAny('user').granted;
}
```

## Configuration

`forRoot` / `forRootAsync` options:

| Option | Default | Description |
| --- | --- | --- |
| `ac` | — | a pre-built, locked `AccessControl` (forRoot) |
| `grants` | — | grants to build + lock (forRoot; alternative to `ac`) |
| `useFactory` | — | returns `AccessControl` or grants (forRootAsync) |
| `getRole` | `(req) => req.user.role` | resolve the caller's role(s); supports `string \| string[]` |
| `isGlobal` | `true` | register as a global module |

## API

**Module**

| Export | Description |
| --- | --- |
| `AccessControlModule.forRoot(options)` | Register a built `AccessControl` (`ac`) or `grants` synchronously. |
| `AccessControlModule.forRootAsync(options)` | Build the `AccessControl`/grants from injected deps (DB-driven). |

**Route decorators** (combine with AND; all desugar to the same rule metadata)

| Export | Description |
| --- | --- |
| `@CreateOwn` `@CreateAny` `@ReadOwn` `@ReadAny` `@UpdateOwn` `@UpdateAny` `@DeleteOwn` `@DeleteAny` | Fluent CRUD — `(resource)`. The everyday surface. |
| `@Can(action, resource, possession?)` | Generic form for custom (non-CRUD) actions. Possession defaults to `'any'`. |
| `@RequirePermission(rule \| rule[])` | Canonical form; the only one that accepts **multiple** rules. |

**Enforcement & filtering**

| Export | Description |
| --- | --- |
| `AccessControlGuard` | Evaluates the route's rules (fail-closed `tryCan`); attaches the granted `Permission` to `req.permission`. |
| `@FilterResponse()` | Handler/controller decorator — filters the response through `req.permission`. |
| `FilterResponseInterceptor` | The interceptor class behind `@FilterResponse()` (for manual `@UseInterceptors`). |
| `filterByPermission(permission, data)` | Function form of the filter, for use in services. |
| `assertOwner(userId, ownerId, message?)` | Throws `ForbiddenException` unless the two ids match (`own` enforcement). |

**Instance access**

| Export | Description |
| --- | --- |
| `@InjectAccessControl()` | Parameter decorator injecting the shared `AccessControl`. |
| `ACCESS_CONTROL` | The DI token it resolves (for custom providers). |
| `AC_ROLE_RESOLVER` | DI token holding the configured role resolver. |

**Types** — `AcRule`, `Possession`, `CrudAction`, `Grants`, `RoleResolver`, `AccessControlRequest`, `AccessControlModuleOptions`, `AccessControlModuleAsyncOptions`.

## Related Projects

- [**accesscontrol**](https://github.com/onury/accesscontrol) — Role & attribute-based access control (RBAC + ABAC) for Node.js; the engine this package integrates.
- [**configuard**](https://github.com/onury/configuard) — Turn flat config rows from a database table into a nested, typed configuration object — with `${...}` templating and accessor-based (ABAC) filtering.
- [**nestjs-configuard**](https://github.com/onury/nestjs-configuard) — The NestJS integration for configuard: DB-backed, typed, ABAC-filtered runtime config with live reload and TTL auto-refresh.
- [**notation**](https://github.com/onury/notation) — Read, modify, and filter the contents of objects and arrays via dot/bracket notation strings or glob patterns.

## License

[MIT](./LICENSE) © Onur Yıldırım
