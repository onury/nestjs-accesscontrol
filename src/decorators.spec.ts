import { describe, expect, it } from 'vitest';
import {
  AC_RULES,
  Can,
  CreateAny,
  CreateOwn,
  DeleteAny,
  DeleteOwn,
  ReadAny,
  ReadOwn,
  RequirePermission,
  UpdateAny,
  UpdateOwn
} from './decorators';
import type { AcRule } from './types';

function rulesOf(holder: object): AcRule[] {
  return (Reflect.getMetadata(AC_RULES, holder) as AcRule[]) ?? [];
}

describe('AC_RULES', () => {
  it('is a stable, namespaced metadata key', () => {
    expect(AC_RULES).toBe('nestjs-accesscontrol:rules');
  });
});

describe('RequirePermission', () => {
  it('stores a single rule', () => {
    class C {
      @RequirePermission({ action: 'read', resource: 'article', possession: 'own' })
      m() {}
    }
    expect(rulesOf(C.prototype.m)).toEqual([
      { action: 'read', resource: 'article', possession: 'own' }
    ]);
  });

  it('stores an array of rules verbatim', () => {
    const ruleSet: AcRule[] = [
      { action: 'read', resource: 'article' },
      { action: 'update', resource: 'article', possession: 'own' }
    ];
    class C {
      @RequirePermission(ruleSet)
      m() {}
    }
    expect(rulesOf(C.prototype.m)).toEqual(ruleSet);
  });
});

describe('Can', () => {
  it('defaults possession to "any"', () => {
    class C {
      @Can('publish', 'article')
      m() {}
    }
    expect(rulesOf(C.prototype.m)).toEqual([
      { action: 'publish', resource: 'article', possession: 'any' }
    ]);
  });

  it('honors an explicit possession', () => {
    class C {
      @Can('archive', 'article', 'own')
      m() {}
    }
    expect(rulesOf(C.prototype.m)).toEqual([
      { action: 'archive', resource: 'article', possession: 'own' }
    ]);
  });
});

describe('fluent CRUD decorators', () => {
  it.each([
    ['CreateOwn', CreateOwn, 'create', 'own'],
    ['CreateAny', CreateAny, 'create', 'any'],
    ['ReadOwn', ReadOwn, 'read', 'own'],
    ['ReadAny', ReadAny, 'read', 'any'],
    ['UpdateOwn', UpdateOwn, 'update', 'own'],
    ['UpdateAny', UpdateAny, 'update', 'any'],
    ['DeleteOwn', DeleteOwn, 'delete', 'own'],
    ['DeleteAny', DeleteAny, 'delete', 'any']
  ])('%s -> %s/%s', (_name, factory, action, possession) => {
    // Apply the decorator inside the test so the `crud` factory is exercised here.
    class Z {}
    (factory as (resource: string) => ClassDecorator)('a')(Z);
    expect(rulesOf(Z)).toEqual([{ action, resource: 'a', possession }]);
  });
});

describe('accumulation', () => {
  it('combines stacked decorators on one method (AND)', () => {
    class E {
      @ReadAny('a')
      @UpdateOwn('a')
      m() {}
    }
    const rules = rulesOf(E.prototype.m);
    expect(rules).toHaveLength(2);
    expect(rules).toContainEqual({ action: 'read', resource: 'a', possession: 'any' });
    expect(rules).toContainEqual({ action: 'update', resource: 'a', possession: 'own' });
  });

  it('supports class-level decoration', () => {
    @ReadAny('a')
    class F {}
    expect(rulesOf(F)).toEqual([{ action: 'read', resource: 'a', possession: 'any' }]);
  });
});
