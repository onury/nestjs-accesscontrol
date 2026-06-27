import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { AccessControl } from 'accesscontrol';
import { AccessControlGuard } from './accesscontrol.guard';
import { AC_ROLE_RESOLVER, ACCESS_CONTROL } from './tokens';
import type { Grants, RoleResolver } from './types';

/** Default resolver: reads `request.user.role`. */
export const defaultRoleResolver: RoleResolver = (request) =>
  request?.user?.role as string | string[] | undefined | null;

export interface AccessControlModuleOptions {
  /** A pre-built `AccessControl` instance (you manage `.lock()`). */
  ac?: AccessControl;
  /** Grants to build + lock an `AccessControl` from (alternative to `ac`). */
  grants?: Grants;
  /** Resolve the caller's role(s); defaults to `request.user.role`. */
  getRole?: RoleResolver;
  /** Register the module globally (default `true`). */
  isGlobal?: boolean;
}

export interface AccessControlModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: Provider[] | any[];
  /** Returns an `AccessControl` instance or grants (e.g. loaded from a DB). */
  useFactory: (...args: any[]) => Promise<AccessControl | Grants> | AccessControl | Grants;
  /** Resolve the caller's role(s); defaults to `request.user.role`. */
  getRole?: RoleResolver;
  /** Register the module globally (default `true`). */
  isGlobal?: boolean;
}

/** Normalizes a factory result into a locked `AccessControl` instance. */
function toAccessControl(value: AccessControl | Grants): AccessControl {
  if (value instanceof AccessControl) return value;
  return new AccessControl(value).lock();
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: NestJS dynamic modules are classes with static forRoot/forRootAsync
export class AccessControlModule {
  /** Synchronous registration with a static `AccessControl` or grants. */
  static forRoot(options: AccessControlModuleOptions): DynamicModule {
    if (options.ac && options.grants) {
      throw new Error('AccessControlModule.forRoot: provide either `ac` or `grants`, not both.');
    }
    if (!options.ac && !options.grants) {
      throw new Error('AccessControlModule.forRoot: one of `ac` or `grants` is required.');
    }

    const ac = options.ac ?? new AccessControl(options.grants).lock();
    const providers: Provider[] = [
      { provide: ACCESS_CONTROL, useValue: ac },
      { provide: AC_ROLE_RESOLVER, useValue: options.getRole ?? defaultRoleResolver },
      AccessControlGuard
    ];

    return {
      module: AccessControlModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [ACCESS_CONTROL, AC_ROLE_RESOLVER, AccessControlGuard]
    };
  }

  /** Asynchronous registration for DB-driven / injected grants. */
  static forRootAsync(options: AccessControlModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: ACCESS_CONTROL,
        useFactory: async (...args: any[]) => toAccessControl(await options.useFactory(...args)),
        inject: options.inject ?? []
      },
      { provide: AC_ROLE_RESOLVER, useValue: options.getRole ?? defaultRoleResolver },
      AccessControlGuard
    ];

    return {
      module: AccessControlModule,
      global: options.isGlobal ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [ACCESS_CONTROL, AC_ROLE_RESOLVER, AccessControlGuard]
    };
  }
}
