import { extractUserRoles } from "./roles.js";

/**
 * Standard Action Vocabulary
 */
export const Actions = Object.freeze({
    READ: "read",
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    EXPORT: "export",
    MANAGE: "manage",
});

/**
 * Standard Resource Types
 */
export const Resources = Object.freeze({
    ASSESSMENT: "assessment",
    VULNERABILITY: "vulnerability",
    ASSET: "asset",
    REPORT: "report",
    ORGANIZATION: "organization",
    USER: "user",
});

/**
 * Standard Granular Permissions
 */
export const Permissions = Object.freeze({
    ALL: "*",

    ASSESSMENT_READ: "assessment:read",
    ASSESSMENT_CREATE: "assessment:create",
    ASSESSMENT_UPDATE: "assessment:update",
    ASSESSMENT_DELETE: "assessment:delete",
    ASSESSMENT_EXPORT: "assessment:export",

    VULNERABILITY_READ: "vulnerability:read",
    VULNERABILITY_CREATE: "vulnerability:create",
    VULNERABILITY_UPDATE: "vulnerability:update",
    VULNERABILITY_DELETE: "vulnerability:delete",
    VULNERABILITY_EXPORT: "vulnerability:export",

    ASSET_READ: "asset:read",
    ASSET_CREATE: "asset:create",
    ASSET_UPDATE: "asset:update",
    ASSET_DELETE: "asset:delete",

    REPORT_READ: "report:read",
    REPORT_CREATE: "report:create",
    REPORT_DELETE: "report:delete",
});

/**
 * Default role-to-permission mappings
 */
export const DefaultRolePermissions = Object.freeze({
    "Platform Admin": ["*"],
    Super: ["*"],
    Admin: [
        "assessment:read",
        "assessment:create",
        "assessment:update",
        "assessment:delete",
        "assessment:export",
        "vulnerability:read",
        "vulnerability:create",
        "vulnerability:update",
        "vulnerability:delete",
        "vulnerability:export",
        "asset:read",
        "asset:create",
        "asset:update",
        "asset:delete",
        "report:read",
        "report:create",
        "report:delete",
        "member:update_teams",
        "member:update_role",
        "member:update_access",
        "member:lock",
        "member:unlock",
        "member:regenerate_password",
        "member:update_2fa",
    ],
    Manager: [
        "assessment:read",
        "assessment:create",
        "assessment:update",
        "assessment:export",
        "vulnerability:read",
        "vulnerability:create",
        "vulnerability:update",
        "vulnerability:export",
        "asset:read",
        "asset:create",
        "asset:update",
        "report:read",
        "report:create",
    ],
    Developer: [
        "assessment:read",
        "assessment:update",
        "vulnerability:read",
        "vulnerability:update",
        "asset:read",
        "asset:update",
        "report:read",
    ],
    Auditor: [
        "assessment:read",
        "vulnerability:read",
        "asset:read",
        "report:read",
    ],
});

/**
 * Checks if a user has a specific permission based on their roles.
 * @param {Object} user
 * @param {string} requiredPermission
 * @param {Record<string, string[]>} [rolePermissions=DefaultRolePermissions]
 * @returns {boolean}
 */
export function hasPermission(user, requiredPermission, rolePermissions = DefaultRolePermissions) {
    if (!user) return false;
    const userRoles = extractUserRoles(user);
    if (!userRoles.length) return false;

    return userRoles.some((role) => {
        const permissions = rolePermissions[role];
        if (!Array.isArray(permissions)) return false;
        if (permissions.includes("*")) return true;

        if (permissions.includes(requiredPermission)) return true;

        // Wildcard per resource prefix e.g. "assessment:*"
        const [resourcePrefix] = requiredPermission.split(":");
        if (resourcePrefix && permissions.includes(`${resourcePrefix}:*`)) {
            return true;
        }

        return false;
    });
}

/**
 * Checks if a user possesses all requested permissions.
 * @param {Object} user
 * @param {string[]} requiredPermissions
 * @param {Record<string, string[]>} [rolePermissions=DefaultRolePermissions]
 * @returns {boolean}
 */
export function hasAllPermissions(user, requiredPermissions = [], rolePermissions = DefaultRolePermissions) {
    if (!Array.isArray(requiredPermissions) || !requiredPermissions.length) {
        return true;
    }
    return requiredPermissions.every((perm) => hasPermission(user, perm, rolePermissions));
}
