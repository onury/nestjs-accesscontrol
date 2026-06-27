import type { AcRule, CrudAction, Possession } from './types';

/** Reflect-metadata key under which a route's accumulated rules are stored. */
export const AC_RULES = 'nestjs-accesscontrol:rules';

type AccessDecorator = MethodDecorator & ClassDecorator;

/**
 * Appends rules to a handler or controller, accumulating across stacked
 * decorators so multiple access decorators on one route combine (AND).
 */
function appendRules(rules: AcRule[]): AccessDecorator {
  return ((target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder = descriptor ? descriptor.value : target;
    const existing = (Reflect.getMetadata(AC_RULES, holder) as AcRule[] | undefined) ?? [];
    Reflect.defineMetadata(AC_RULES, [...existing, ...rules], holder);
    return descriptor ?? target;
  }) as AccessDecorator;
}

/**
 * Canonical decorator. Declares one rule, or many that must **all** pass.
 *
 *   @RequirePermission({ action: 'read', resource: 'article', possession: 'own' })
 *   @RequirePermission([{ action: 'read', resource: 'article' }, ...])
 */
export function RequirePermission(rule: AcRule | AcRule[]): AccessDecorator {
  return appendRules(Array.isArray(rule) ? rule : [rule]);
}

/**
 * Generic fallback for custom (non-CRUD) actions.
 *
 *   @Can('publish', 'article', 'any')
 */
export function Can(
  action: string,
  resource: string,
  possession: Possession = 'any'
): AccessDecorator {
  return appendRules([{ action, resource, possession }]);
}

/** Builds a fluent CRUD decorator bound to a fixed action + possession. */
function crud(action: CrudAction, possession: Possession) {
  return (resource: string): AccessDecorator => appendRules([{ action, resource, possession }]);
}

export const CreateOwn = crud('create', 'own');
export const CreateAny = crud('create', 'any');
export const ReadOwn = crud('read', 'own');
export const ReadAny = crud('read', 'any');
export const UpdateOwn = crud('update', 'own');
export const UpdateAny = crud('update', 'any');
export const DeleteOwn = crud('delete', 'own');
export const DeleteAny = crud('delete', 'any');
