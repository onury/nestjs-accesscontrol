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
 * Filters the response through `request.permission` (set by
 * {@link AccessControlGuard}), stripping attributes the role may not see.
 */
@Injectable()
export class FilterResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const permission = request?.permission as Permission | undefined;
    return next
      .handle()
      .pipe(
        map((data) =>
          permission && data && typeof data === 'object' ? permission.filter(data) : data
        )
      );
  }
}

/** Applies {@link FilterResponseInterceptor} to a handler or controller. */
export function FilterResponse(): ClassDecorator & MethodDecorator {
  return applyDecorators(UseInterceptors(FilterResponseInterceptor));
}
