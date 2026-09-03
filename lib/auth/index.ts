export { authProvider, getCurrentAuthId, getCurrentUser, requireUser } from "./active-provider";
export type { AuthProvider, AuthUser, Role } from "./interface";
export { syncCurrentUser, getCurrentDbUser, requireDbUser } from "./sync";
export {
  assertRole,
  assertCanEdit,
  assertCanEditAny,
  canEditAny,
  ownershipFilterAny,
  canView,
  canEdit,
  isAdmin,
  isTeamLeadOrAbove,
  ownershipFilter,
  AuthorizationError,
} from "./rbac";
