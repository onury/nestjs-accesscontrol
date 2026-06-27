import { describe, expect, it } from 'vitest';
import { AC_ROLE_RESOLVER, ACCESS_CONTROL, InjectAccessControl } from './tokens';

describe('tokens', () => {
  it('exposes distinct symbol tokens', () => {
    expect(typeof ACCESS_CONTROL).toBe('symbol');
    expect(typeof AC_ROLE_RESOLVER).toBe('symbol');
    expect(ACCESS_CONTROL).not.toBe(AC_ROLE_RESOLVER);
  });

  it('InjectAccessControl injects the ACCESS_CONTROL token', () => {
    class Consumer {
      constructor(@InjectAccessControl() readonly ac: unknown) {}
    }
    const declared = Reflect.getMetadata('self:paramtypes', Consumer) as Array<{
      index: number;
      param: unknown;
    }>;
    expect(declared[0].param).toBe(ACCESS_CONTROL);
  });
});
