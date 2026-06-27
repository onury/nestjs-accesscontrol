import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccessControl, Permission } from 'accesscontrol';
import { AC_RULES } from './decorators';
import { AC_ROLE_RESOLVER, ACCESS_CONTROL } from './tokens';
import type { AcRule, Possession, RequestLike, RoleResolver } from './types';

/**
 * Enforces the access rules declared by `@RequirePermission` / the fluent CRUD
 * decorators / `@Can`. Pure authorization — it expects your own auth guard to
 * have populated `request.user` first (see {@link RoleResolver}).
 *
 * On success the granted `Permission` is attached to the request as
 * `request.permission` (and all of them as `request.permissions`), so handlers
 * and the {@link FilterResponseInterceptor} can strip disallowed attributes:
 *
 *   const visible = request.permission.filter(article);
 */
@Injectable()
export class AccessControlGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ACCESS_CONTROL) private readonly ac: AccessControl,
    @Inject(AC_ROLE_RESOLVER) private readonly resolveRole: RoleResolver
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rules = this.reflector.getAllAndMerge<AcRule[]>(AC_RULES, [
      context.getHandler(),
      context.getClass()
    ]);
    // No rules on this route — nothing for us to enforce. (`getAllAndMerge`
    // always returns an array, empty when no metadata is present.)
    if (rules.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    const role = this.normalizeRole(this.resolveRole(request));

    const granted: Permission[] = [];
    for (const rule of rules) {
      const possession: Possession = rule.possession ?? 'any';
      // `action('name:possession')` is the uniform entry for CRUD *and* custom
      // actions. `tryCan` is fail-closed: an unknown role/resource/action yields
      // a non-granted Permission instead of throwing.
      const permission = this.ac.tryCan(role).action(`${rule.action}:${possession}`, rule.resource);
      if (!permission.granted) {
        throw new ForbiddenException('Access denied');
      }
      granted.push(permission);
    }

    request.permission = granted[granted.length - 1];
    request.permissions = granted;
    return true;
  }

  private normalizeRole(role: string | string[] | undefined | null): string | string[] {
    if (typeof role === 'string' && role.length > 0) return role;
    if (
      Array.isArray(role) &&
      role.length > 0 &&
      role.every((r) => typeof r === 'string' && r.length > 0)
    ) {
      return role;
    }
    throw new ForbiddenException('Missing role');
  }
}
