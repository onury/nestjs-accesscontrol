import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControl } from 'accesscontrol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessControlGuard } from './accesscontrol.guard';
import { defaultRoleResolver } from './accesscontrol.module';
import { Can, DeleteAny, ReadAny, RequirePermission, UpdateAny, UpdateOwn } from './decorators';
import type { RoleResolver } from './types';

function buildAc(): AccessControl {
  const ac = new AccessControl();
  ac.grant('user')
    .createOwn('article')
    .readAny('article')
    .updateOwn('article')
    .deleteOwn('article');
  ac.grant('admin').extend('user').updateAny('article').deleteAny('article');
  return ac.lock();
}

class ArticleController {
  noRule() {}
  @ReadAny('article') list() {}
  @RequirePermission({ action: 'read', resource: 'article' }) listDefault() {}
  @UpdateOwn('article') editOwn() {}
  @UpdateAny('article') editAny() {}
  @DeleteAny('article') removeAny() {}
  @ReadAny('article') @UpdateOwn('article') readAndEdit() {}
  @ReadAny('article') @DeleteAny('article') readAndRemoveAny() {}
}

@ReadAny('article')
class ClassScopedController {
  get() {}
}

function ctx(handler: unknown, cls: unknown, request: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => request })
  } as any;
}

describe('AccessControlGuard', () => {
  let guard: AccessControlGuard;
  let ac: AccessControl;

  beforeEach(() => {
    ac = buildAc();
    guard = new AccessControlGuard(new Reflector(), ac, defaultRoleResolver);
  });

  it('allows routes with no rules and leaves the request untouched', () => {
    const req: Record<string, unknown> = { user: { role: 'user' } };
    expect(guard.canActivate(ctx(ArticleController.prototype.noRule, ArticleController, req))).toBe(
      true
    );
    expect(req.permission).toBeUndefined();
    expect(req.permissions).toBeUndefined();
  });

  it('grants and attaches the permission (any)', () => {
    const req: Record<string, unknown> = { user: { role: 'user' } };
    expect(guard.canActivate(ctx(ArticleController.prototype.list, ArticleController, req))).toBe(
      true
    );
    expect((req.permission as { granted: boolean }).granted).toBe(true);
    expect(req.permissions).toHaveLength(1);
  });

  it('defaults possession to "any" when a rule omits it', () => {
    const req = { user: { role: 'user' } };
    expect(
      guard.canActivate(ctx(ArticleController.prototype.listDefault, ArticleController, req))
    ).toBe(true);
  });

  it('grants via the "own" path', () => {
    const req = { user: { role: 'user' } };
    expect(
      guard.canActivate(ctx(ArticleController.prototype.editOwn, ArticleController, req))
    ).toBe(true);
  });

  it('builds the action spec as "<action>:<possession>", defaulting possession to "any"', () => {
    const action = vi.fn(() => ({ granted: true }));
    const spyAc = { tryCan: vi.fn(() => ({ action })) } as unknown as AccessControl;
    const g = new AccessControlGuard(new Reflector(), spyAc, defaultRoleResolver);
    const req = { user: { role: 'user' } };

    g.canActivate(ctx(ArticleController.prototype.listDefault, ArticleController, req));
    expect(action).toHaveBeenCalledWith('read:any', 'article');

    action.mockClear();
    g.canActivate(ctx(ArticleController.prototype.editOwn, ArticleController, req));
    expect(action).toHaveBeenCalledWith('update:own', 'article');
  });

  it('denies when the role lacks the permission, with an "Access denied" message', () => {
    const req = { user: { role: 'user' } };
    expect(() =>
      guard.canActivate(ctx(ArticleController.prototype.editAny, ArticleController, req))
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(ctx(ArticleController.prototype.editAny, ArticleController, req))
    ).toThrow('Access denied');
  });

  it('denies a deleteAny for a plain user', () => {
    const req = { user: { role: 'user' } };
    expect(() =>
      guard.canActivate(ctx(ArticleController.prototype.removeAny, ArticleController, req))
    ).toThrow(ForbiddenException);
  });

  it('accepts a single-element role array', () => {
    const req = { user: { role: ['user'] } };
    expect(guard.canActivate(ctx(ArticleController.prototype.list, ArticleController, req))).toBe(
      true
    );
  });

  it('reads rules declared at the class level', () => {
    const req = { user: { role: 'user' } };
    expect(
      guard.canActivate(ctx(ClassScopedController.prototype.get, ClassScopedController, req))
    ).toBe(true);
  });

  describe('multiple rules (AND)', () => {
    it('passes when all rules are granted and keeps the last permission', () => {
      const req: Record<string, unknown> = { user: { role: 'user' } };
      expect(
        guard.canActivate(ctx(ArticleController.prototype.readAndEdit, ArticleController, req))
      ).toBe(true);
      expect(req.permissions).toHaveLength(2);
      expect(req.permission).toBe((req.permissions as unknown[])[1]);
    });

    it('throws if any rule is denied', () => {
      const req = { user: { role: 'user' } };
      expect(() =>
        guard.canActivate(ctx(ArticleController.prototype.readAndRemoveAny, ArticleController, req))
      ).toThrow(ForbiddenException);
    });
  });

  describe('role resolution', () => {
    it.each([
      ['no user', {}],
      ['missing role', { user: {} }],
      ['empty string role', { user: { role: '' } }],
      ['empty array', { user: { role: [] } }],
      ['array with empty string', { user: { role: [''] } }],
      ['array with non-string', { user: { role: [1] } }],
      ['array mixing valid and empty', { user: { role: ['user', ''] } }],
      ['array mixing valid and non-string', { user: { role: ['user', 1] } }],
      // A non-string element that still has `length > 0` — guards `typeof === 'string'`.
      ['array mixing valid and a non-string with length', { user: { role: ['user', ['x']] } }]
    ])('throws "Missing role" for %s', (_label, req) => {
      expect(() =>
        guard.canActivate(ctx(ArticleController.prototype.list, ArticleController, req))
      ).toThrow('Missing role');
    });

    it('uses a custom role resolver', () => {
      const resolver: RoleResolver = (request) => (request as { ctxRole?: string }).ctxRole;
      const custom = new AccessControlGuard(new Reflector(), ac, resolver);
      const req = { ctxRole: 'admin' };
      expect(
        custom.canActivate(ctx(ArticleController.prototype.editAny, ArticleController, req))
      ).toBe(true);
    });
  });

  it('supports custom (non-CRUD) actions via @Can', () => {
    const ac2 = new AccessControl();
    ac2.grant('editor').action('publish:any', 'article', ['*']);
    ac2.lock();
    class PubController {
      @Can('publish', 'article') publish() {}
    }
    const g = new AccessControlGuard(new Reflector(), ac2, defaultRoleResolver);
    const req = { user: { role: 'editor' } };
    expect(g.canActivate(ctx(PubController.prototype.publish, PubController, req))).toBe(true);
  });
});
