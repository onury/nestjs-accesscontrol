import type { Permission } from 'accesscontrol';

/**
 * Request shape after {@link AccessControlGuard} runs. Cast your handler's
 * request to this to get typed access to the resolved permission(s):
 *
 *   handler(@Req() req: AccessControlRequest) {
 *     return req.permission?.filter(data);
 *   }
 */
export interface AccessControlRequest {
  /** Populated by your own auth guard before the access-control guard runs. */
  user?: { role?: string | string[] } & Record<string, unknown>;
  /** The last granted permission — use this for single-rule routes. */
  permission?: Permission;
  /** All granted permissions, in rule order (for multi-rule routes). */
  permissions?: Permission[];
}
