import { ForbiddenException } from '@nestjs/common';
import { AccessControl } from 'accesscontrol';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  assertOwner,
  FilterResponse,
  FilterResponseInterceptor,
  filterByPermission
} from './permission';

function readPermission() {
  const ac = new AccessControl();
  ac.grant('user').readAny('article', ['title']);
  ac.lock();
  return ac.can('user').readAny('article');
}

function ctx(request: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => request })
  } as any;
}

function handlerOf<T>(data: T) {
  return { handle: () => of(data) };
}

describe('filterByPermission', () => {
  it('strips disallowed attributes', () => {
    expect(filterByPermission(readPermission(), { title: 'T', secret: 'S' })).toEqual({
      title: 'T'
    });
  });
});

describe('assertOwner', () => {
  it('passes when ids match', () => {
    expect(() => assertOwner('u1', 'u1')).not.toThrow();
    expect(() => assertOwner(7, 7)).not.toThrow();
  });

  it('throws when ids differ, with the default message', () => {
    expect(() => assertOwner('u1', 'u2')).toThrow(ForbiddenException);
    expect(() => assertOwner('u1', 'u2')).toThrow('Access denied: not the owner');
  });

  it('throws when the user id is null or undefined (even if owner matches)', () => {
    expect(() => assertOwner(null, null)).toThrow(ForbiddenException);
    expect(() => assertOwner(undefined, undefined)).toThrow(ForbiddenException);
  });

  it('uses a custom message', () => {
    expect(() => assertOwner('u1', 'u2', 'nope')).toThrow('nope');
  });
});

describe('FilterResponseInterceptor', () => {
  const interceptor = new FilterResponseInterceptor();

  it('filters object responses through request.permission', async () => {
    const result = interceptor.intercept(
      ctx({ permission: readPermission() }),
      handlerOf({ title: 'T', secret: 'S' })
    );
    expect(await firstValueFrom(result)).toEqual({ title: 'T' });
  });

  it('passes data through when there is no permission', async () => {
    const data = { title: 'T', secret: 'S' };
    const result = interceptor.intercept(ctx({}), handlerOf(data));
    expect(await firstValueFrom(result)).toEqual(data);
  });

  it('passes through null data', async () => {
    const result = interceptor.intercept(ctx({ permission: readPermission() }), handlerOf(null));
    expect(await firstValueFrom(result)).toBeNull();
  });

  it('passes through non-object (primitive) data', async () => {
    const result = interceptor.intercept(ctx({ permission: readPermission() }), handlerOf('hello'));
    expect(await firstValueFrom(result)).toBe('hello');
  });
});

describe('FilterResponseInterceptor with a map-data wrapper (e.g. EnvelopeBody)', () => {
  const interceptor = new FilterResponseInterceptor();
  const MAP_DATA = Symbol.for('nestjs-http-envelope:map-data');

  // Stands in for nestjs-http-envelope's EnvelopeBody: it carries the protocol
  // method, and rebuilds itself (same class, same extras) around mapped data.
  class Wrapper<T> {
    constructor(
      readonly data: T,
      readonly extras: Record<string, unknown> = {}
    ) {}
    [MAP_DATA]<U>(fn: (data: T) => U): Wrapper<U> {
      return new Wrapper(fn(this.data), this.extras);
    }
  }

  function run(data: unknown) {
    return firstValueFrom(
      interceptor.intercept(ctx({ permission: readPermission() }), handlerOf(data))
    );
  }

  it('filters the wrapped data, keeps the extras and returns the same class', async () => {
    const extras = { pagination: { total: 1 } };
    const body = new Wrapper({ title: 'T', secret: 'S' }, extras);
    const result = (await run(body)) as Wrapper<unknown>;
    expect(result).toBeInstanceOf(Wrapper);
    expect(result).not.toBe(body);
    expect(result.data).toEqual({ title: 'T' });
    expect(result.extras).toBe(extras);
    expect(body.data).toEqual({ title: 'T', secret: 'S' });
  });

  it('filters every item of wrapped array data', async () => {
    const body = new Wrapper([
      { title: 'A', secret: 'S1' },
      { title: 'B', secret: 'S2' }
    ]);
    const result = (await run(body)) as Wrapper<unknown>;
    expect(result).toBeInstanceOf(Wrapper);
    expect(result.data).toEqual([{ title: 'A' }, { title: 'B' }]);
  });

  it('leaves wrapped null and primitive data as is', async () => {
    expect(((await run(new Wrapper(null))) as Wrapper<unknown>).data).toBeNull();
    expect(((await run(new Wrapper('hello'))) as Wrapper<unknown>).data).toBe('hello');
  });

  it('calls the protocol method on the wrapper itself', async () => {
    const body = {
      data: { title: 'T', secret: 'S' },
      [MAP_DATA](this: { data: unknown }, fn: (d: unknown) => unknown) {
        return { mapped: fn(this.data) };
      }
    };
    expect(await run(body)).toEqual({ mapped: { title: 'T' } });
  });

  it('filters plain array responses item by item', async () => {
    expect(await run([{ title: 'A', secret: 'S' }])).toEqual([{ title: 'A' }]);
  });

  it('treats a non-function value under the protocol key as plain data', async () => {
    expect(await run({ title: 'T', secret: 'S', [MAP_DATA]: true })).toEqual({ title: 'T' });
  });
});

describe('FilterResponse', () => {
  it('registers the FilterResponseInterceptor on the handler', () => {
    class C {
      m() {}
    }
    // Apply the decorator inside the test so FilterResponse() is exercised here.
    const decorate = FilterResponse() as MethodDecorator;
    const descriptor = Object.getOwnPropertyDescriptor(C.prototype, 'm') as PropertyDescriptor;
    decorate(C.prototype, 'm', descriptor);

    const interceptors = Reflect.getMetadata('__interceptors__', C.prototype.m) as unknown[];
    expect(interceptors).toContain(FilterResponseInterceptor);
  });
});
