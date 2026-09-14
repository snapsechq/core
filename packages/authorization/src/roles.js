/**
 * Canonical SnapSec Roles
 */
export const Roles = Object.freeze({
    SUPER: "Super",
    PLATFORM_ADMIN: "Platform Admin",
    ADMIN: "Admin",
    MANAGER: "Manager",
    DEVELOPER: "Developer",
    AUDITOR: "Auditor",
});

/**
 * Standard role hierarchy (ordered from highest privilege to lowest)
 */
export const ROLE_HIERARCHY = Object.freeze([
    Roles.PLATFORM_ADMIN,
    Roles.SUPER,
    Roles.ADMIN,
    Roles.MANAGER,
    Roles.DEVELOPER,
    Roles.AUDITOR,
]);

/**
 * Checks if a user's role satisfies the required minimum role in the hierarchy.
 * @param {string} userRole
 * @param {string} requiredRole
 * @returns {boolean}
 */
export function hasRoleAccess(userRole, requiredRole) {
    const userIndex = ROLE_HIERARCHY.indexOf(userRole);
    const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);

    if (userIndex === -1 || requiredIndex === -1) {
        return false;
    }

    // Lower index = higher privilege in ROLE_HIERARCHY
    return userIndex <= requiredIndex;
}

/**
 * Normalizes user roles into a clean string array.
 * @param {Object|string|string[]} userOrRoles
 * @returns {string[]}
 */
export function extractUserRoles(userOrRoles) {
    if (!userOrRoles) return [];
    if (typeof userOrRoles === "string") return [userOrRoles];
    if (Array.isArray(userOrRoles)) return userOrRoles;
    if (Array.isArray(userOrRoles.roles)) return userOrRoles.roles;
    if (userOrRoles.role && typeof userOrRoles.role === "string") return [userOrRoles.role];
    return [];
}

/**
 * Checks if a user has any of the allowed roles.
 * @param {Object|string|string[]} userOrRoles
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
export function hasAnyRole(userOrRoles, allowedRoles = []) {
    if (!allowedRoles.length) return true;
    const userRoles = extractUserRoles(userOrRoles);
    return userRoles.some((r) => allowedRoles.includes(r));
}

/**
 * Checks if a user has any forbidden roles.
 * @param {Object|string|string[]} userOrRoles
 * @param {string[]} forbiddenRoles
 * @returns {boolean}
 */
export function hasForbiddenRole(userOrRoles, forbiddenRoles = []) {
    if (!forbiddenRoles.length) return false;
    const userRoles = extractUserRoles(userOrRoles);
    return userRoles.some((r) => forbiddenRoles.includes(r));
}
