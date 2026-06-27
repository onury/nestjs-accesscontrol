# nestjs-accesscontrol

Role & attribute-based access control for [NestJS](https://nestjs.com), built
natively on [**accesscontrol** v3](https://github.com/onury/accesscontrol).

Fluent CRUD decorators, a fail-closed guard, first-class `forRootAsync` for
DB-driven grants, and attribute filtering on the way out — with your auth layer
left entirely to you.

> ESM-only, like accesscontrol v3. Requires Node ≥ 20 and NestJS 10/11.

## Why

The existing community adapter is pinned to accesscontrol **v2** and predates the
v3 API (`tryCan`, `Permission.filter()`, declarative conditions). This package is
v3-native and speaks accesscontrol's own vocabulary — roles, `action`, possession
(`own`/`any`), and the `Permission` object — rather than wrapping it in a new one.

## Install

```bash
npm install nestjs-accesscontrol accesscontrol
```

`@nestjs/common`, `@nestjs/core`, `reflect-metadata`, and `rxjs` are peer
dependencies (already present in any Nest app).

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

Guard order matters: `AccessControlGuard` expects `request.user` to already be
populated. Register your auth guard before it (or compose them with
`@UseGuards(JwtAuthGuard, AccessControlGuard)` per route).

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

All three forms compile to the same rule metadata and combine with **AND**
(every rule on a route must pass).

| Form | Example | Use |
|------|---------|-----|
| **Fluent CRUD** | `@ReadAny('article')`, `@UpdateOwn('article')` | the everyday surface |
| **Generic** | `@Can('publish', 'article', 'own')` | custom (non-CRUD) actions |
| **Canonical** | `@RequirePermission({ action, resource, possession })` or an **array** | multi-rule / dynamic routes |

The eight fluent decorators map 1:1 onto accesscontrol's methods:
`@CreateOwn` `@CreateAny` `@ReadOwn` `@ReadAny` `@UpdateOwn` `@UpdateAny`
`@DeleteOwn` `@DeleteAny`. Possession defaults to `any`.

```ts
// Multiple rules — all must pass:
@RequirePermission([
  { action: 'read', resource: 'article' },
  { action: 'update', resource: 'article', possession: 'own' },
])
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

The factory may return a built `AccessControl` or a grants object/list — the
module locks the latter for you.

## Attribute filtering & `own`

On a granted request the resolved accesscontrol `Permission` is attached as
`request.permission` (and all of them as `request.permissions`).

- **Filter output** — drop attributes the role can't see:
  - `@FilterResponse()` on the handler does it automatically, or
  - `req.permission.filter(data)` / `filterByPermission(permission, data)` manually.
- **Enforce `own`** — the guard authorizes the *grant* (can this role update its
  own articles?), but only your code knows who owns a given record. Load it and
  call `assertOwner(req.user.id, record.ownerId)`.

## Configuration

`forRoot` / `forRootAsync` options:

| Option | Default | Description |
|--------|---------|-------------|
| `ac` | — | a pre-built, locked `AccessControl` (forRoot) |
| `grants` | — | grants to build + lock (forRoot; alternative to `ac`) |
| `useFactory` | — | returns `AccessControl` or grants (forRootAsync) |
| `getRole` | `(req) => req.user.role` | resolve the caller's role(s); supports `string \| string[]` |
| `isGlobal` | `true` | register as a global module |

## API

`AccessControlModule`, `AccessControlGuard`, `FilterResponseInterceptor` ·
decorators (above) · `FilterResponse`, `filterByPermission`, `assertOwner` ·
`InjectAccessControl` / `ACCESS_CONTROL` token · types `AcRule`, `Possession`,
`CrudAction`, `Grants`, `RoleResolver`, `AccessControlRequest`.

## License

[MIT](./LICENSE) © Onur Yıldırım
