import { Inject } from '@nestjs/common';

/** DI token for the shared, locked `AccessControl` instance. */
export const ACCESS_CONTROL = Symbol('ACCESS_CONTROL');

/** DI token for the configured {@link RoleResolver}. */
export const AC_ROLE_RESOLVER = Symbol('AC_ROLE_RESOLVER');

/** Injects the shared `AccessControl` instance: `@InjectAccessControl() ac: AccessControl`. */
export const InjectAccessControl = (): ParameterDecorator => Inject(ACCESS_CONTROL);
