import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
  UseInterceptors
} from '@nestjs/common';
import type { Permission } from 'accesscontrol';
import { map, type Observable } from 'rxjs';
import type { RequestLike } from './types';

/**
 * Projects `data` down to the attributes the permission allows. Thin wrapper
 * over `Permission.filter()` for use in services (outside the request scope).
 */
export function filterByPermission<T extends object>(permission: Permission, data: T): T {
  return permission.filter(data) as T;
}

/**
 * Throws `ForbiddenException` unless `userId` is present and equal to `ownerId`.
 * Use to enforce `own` possession once you've loaded the resource's owner.
 */
export function assertOwner(
  userId: unknown,
  ownerId: unknown,
  message = 'Access denied: not the owner'
): void {
  if (userId === undefined || userId === null || userId !== ownerId) {
    throw new ForbiddenException(message);
  }
}

/**
 * Well-known key of the "map-data" protocol, shared by value (never by import)
 * with response wrappers such as nestjs-http-envelope's `EnvelopeBody`.
 *
 * Contract: a wrapper that carries its payload beside other state (e.g.
 * `EnvelopeBody` = `data` + hoisted `extras`) exposes a method under this key
 * that takes a mapper `(data) => newData` and returns a NEW wrapper of the same
 * class holding the mapped data, with every other field left untouched. The
 * wrapper rebuilds itself, so this package needs to know nothing about its
 * class, constructor or field names, and takes no dependency on the wrapper's
 * package. `Symbol.for` makes the key identical across both packages (and
 * across duplicate installs).
 */
const MAP_DATA = Symbol.for('nestjs-http-envelope:map-data');

type MapDataWrapper = Record<typeof MAP_DATA, (fn: (data: unknown) => unknown) => unknown>;

/**
 * Filters a handler's return through `permission`. Objects and arrays are
 * filtered; `null` and primitives pass through; a map-data wrapper (see
 * {@link MAP_DATA}) is filtered on its payload and handed back re-wrapped, so
 * downstream interceptors (e.g. the envelope) still recognize it.
 */
function filterPayload(permission: Permission, data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  if (typeof (data as Partial<MapDataWrapper>)[MAP_DATA] === 'function') {
    return (data as MapDataWrapper)[MAP_DATA]((inner) => filterPayload(permission, inner));
  }
  return permission.filter(data);
}

/**
 * Filters the response through `request.permission` (set by
 * {@link AccessControlGuard}), stripping attributes the role may not see.
 *
 * A returned `EnvelopeBody` (nestjs-http-envelope 1.0.2+) is filtered on its
 * `data`; its `extras` are kept and it stays an `EnvelopeBody`.
 */
@Injectable()
export class FilterResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const permission = request?.permission as Permission | undefined;
    return next.handle().pipe(map((data) => (permission ? filterPayload(permission, data) : data)));
  }
}

/** Applies {@link FilterResponseInterceptor} to a handler or controller. */
export function FilterResponse(): ClassDecorator & MethodDecorator {
  return applyDecorators(UseInterceptors(FilterResponseInterceptor));
}
