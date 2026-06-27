import type { AccessControl } from 'accesscontrol';

/** CRUD actions natively supported by accesscontrol's fluent grants. */
export type CrudAction = 'create' | 'read' | 'update' | 'delete';

/** Whether a rule targets the user's own records (`own`) or all records (`any`). */
export type Possession = 'own' | 'any';

/**
 * A single access requirement attached to a route. Every decorator in this
 * package ultimately produces one or more of these.
 */
export interface AcRule {
  /** A CRUD verb (`create`/`read`/`update`/`delete`) or a custom action name. */
  action: string;
  /** The resource being acted upon, e.g. `'article'`. */
  resource: string;
  /** Defaults to `'any'` when omitted. */
  possession?: Possession;
}

/**
 * Minimal request shape the guard reads from and writes to. Apps usually have a
 * richer request; this is the contract the package relies on.
 */
export interface RequestLike {
  /** Populated by your own auth guard *before* this guard runs. */
  user?: { role?: unknown } & Record<string, unknown>;
  [key: string]: unknown;
}

/** Resolves the caller's role(s) from the request. */
export type RoleResolver = (request: RequestLike) => string | string[] | undefined | null;

/** Grants accepted when the module builds an `AccessControl` instance for you. */
export type Grants = ConstructorParameters<typeof AccessControl>[0];
