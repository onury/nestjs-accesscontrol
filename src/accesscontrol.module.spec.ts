import { AccessControl } from 'accesscontrol';
import { describe, expect, it, vi } from 'vitest';
import { AccessControlGuard } from './accesscontrol.guard';
import {
  AccessControlModule,
  type AccessControlModuleAsyncOptions,
  type AccessControlModuleOptions,
  defaultRoleResolver
} from './accesscontrol.module';
import { AC_ROLE_RESOLVER, ACCESS_CONTROL } from './tokens';
import type { Grants } from './types';

const grants: Grants = {
  user: { article: { read: [{ possession: 'any', attributes: ['*'] }] } }
};

function providerFor(mod: { providers?: any[] }, token: unknown): any {
  return (mod.providers ?? []).find((p) => p?.provide === token);
}

describe('AccessControlModule.forRoot', () => {
  it('builds and locks an AccessControl from grants', () => {
    const mod = AccessControlModule.forRoot({ grants });
    const provider = providerFor(mod, ACCESS_CONTROL);
    expect(provider.useValue).toBeInstanceOf(AccessControl);
    expect(provider.useValue.isLocked).toBe(true);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual([ACCESS_CONTROL, AC_ROLE_RESOLVER, AccessControlGuard]);
  });

  it('uses a pre-built AccessControl instance as-is', () => {
    const ac = new AccessControl(grants).lock();
    const mod = AccessControlModule.forRoot({ ac });
    expect(providerFor(mod, ACCESS_CONTROL).useValue).toBe(ac);
  });

  it('throws when both `ac` and `grants` are provided', () => {
    const ac = new AccessControl(grants).lock();
    expect(() => AccessControlModule.forRoot({ ac, grants })).toThrow(/not both/);
  });

  it('throws when neither `ac` nor `grants` is provided', () => {
    expect(() => AccessControlModule.forRoot({} as AccessControlModuleOptions)).toThrow(/one of/);
  });

  it('honors isGlobal: false', () => {
    const mod = AccessControlModule.forRoot({ grants, isGlobal: false });
    expect(mod.global).toBe(false);
  });

  it('wires the default role resolver', () => {
    const mod = AccessControlModule.forRoot({ grants });
    expect(providerFor(mod, AC_ROLE_RESOLVER).useValue).toBe(defaultRoleResolver);
  });

  it('wires a custom role resolver', () => {
    const getRole = vi.fn();
    const mod = AccessControlModule.forRoot({ grants, getRole });
    expect(providerFor(mod, AC_ROLE_RESOLVER).useValue).toBe(getRole);
  });
});

describe('defaultRoleResolver', () => {
  it('reads request.user.role', () => {
    expect(defaultRoleResolver({ user: { role: 'admin' } })).toBe('admin');
  });

  it('returns undefined when role is absent', () => {
    expect(defaultRoleResolver({})).toBeUndefined();
  });

  it('is null-safe when request is nullish', () => {
    expect(defaultRoleResolver(undefined as never)).toBeUndefined();
  });
});

describe('AccessControlModule.forRootAsync', () => {
  it('builds + locks an AccessControl when the factory returns grants', async () => {
    const mod = AccessControlModule.forRootAsync({ useFactory: () => grants });
    const provider = providerFor(mod, ACCESS_CONTROL);
    const ac = await provider.useFactory();
    expect(ac).toBeInstanceOf(AccessControl);
    expect(ac.isLocked).toBe(true);
    expect(provider.inject).toEqual([]);
    expect(mod.imports).toEqual([]);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual([ACCESS_CONTROL, AC_ROLE_RESOLVER, AccessControlGuard]);
  });

  it('returns a factory-provided AccessControl instance unchanged', async () => {
    const prebuilt = new AccessControl(grants).lock();
    const mod = AccessControlModule.forRootAsync({ useFactory: () => prebuilt });
    const ac = await providerFor(mod, ACCESS_CONTROL).useFactory();
    expect(ac).toBe(prebuilt);
  });

  it('passes injected dependencies through to the factory', async () => {
    const dep = Symbol('dep');
    const useFactory = vi.fn((arg: unknown) => {
      void arg;
      return grants;
    });
    class SomeModule {}
    const mod = AccessControlModule.forRootAsync({
      imports: [SomeModule],
      inject: [dep],
      useFactory,
      isGlobal: false
    });
    const provider = providerFor(mod, ACCESS_CONTROL);
    await provider.useFactory('injected-value');
    expect(useFactory).toHaveBeenCalledWith('injected-value');
    expect(provider.inject).toEqual([dep]);
    expect(mod.imports).toEqual([SomeModule]);
    expect(mod.global).toBe(false);
  });

  it('wires a custom role resolver', () => {
    const getRole = vi.fn();
    const mod = AccessControlModule.forRootAsync({
      useFactory: () => grants,
      getRole
    } as AccessControlModuleAsyncOptions);
    expect(providerFor(mod, AC_ROLE_RESOLVER).useValue).toBe(getRole);
  });
});
