/**
 * CommonJS entrypoint for @snapsec/authorization
 */
const Roles = Object.freeze({
    SUPER: "Super",
    PLATFORM_ADMIN: "Platform Admin",
    ADMIN: "Admin",
    MANAGER: "Manager",
    DEVELOPER: "Developer",
    AUDITOR: "Auditor",
});

const ROLE_HIERARCHY = Object.freeze([
    Roles.PLATFORM_ADMIN,
    Roles.SUPER,
    Roles.ADMIN,
    Roles.MANAGER,
    Roles.DEVELOPER,
    Roles.AUDITOR,
]);

function hasRoleAccess(userRole, requiredRole) {
    const userIndex = ROLE_HIERARCHY.indexOf(userRole);
    const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    if (userIndex === -1 || requiredIndex === -1) return false;
    return userIndex <= requiredIndex;
}

function extractUserRoles(userOrRoles) {
    if (!userOrRoles) return [];
    if (typeof userOrRoles === "string") return [userOrRoles];
    if (Array.isArray(userOrRoles)) return userOrRoles;
    if (Array.isArray(userOrRoles.roles)) return userOrRoles.roles;
    if (userOrRoles.role && typeof userOrRoles.role === "string") return [userOrRoles.role];
    return [];
}

function hasAnyRole(userOrRoles, allowedRoles = []) {
    if (!allowedRoles.length) return true;
    const userRoles = extractUserRoles(userOrRoles);
    return userRoles.some((r) => allowedRoles.includes(r));
}

function hasForbiddenRole(userOrRoles, forbiddenRoles = []) {
    if (!forbiddenRoles.length) return false;
    const userRoles = extractUserRoles(userOrRoles);
    return userRoles.some((r) => forbiddenRoles.includes(r));
}

const Actions = Object.freeze({
    READ: "read",
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    EXPORT: "export",
    MANAGE: "manage",
});

const Resources = Object.freeze({
    ASSESSMENT: "assessment",
    VULNERABILITY: "vulnerability",
    ASSET: "asset",
    REPORT: "report",
    ORGANIZATION: "organization",
    USER: "user",
});

const Permissions = Object.freeze({
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

const DefaultRolePermissions = Object.freeze({
    "Platform Admin": ["*"],
    Super: ["*"],
    Admin: [
        "assessment:read", "assessment:create", "assessment:update", "assessment:delete", "assessment:export",
        "vulnerability:read", "vulnerability:create", "vulnerability:update", "vulnerability:delete", "vulnerability:export",
        "asset:read", "asset:create", "asset:update", "asset:delete",
        "report:read", "report:create", "report:delete",
        "member:update_teams", "member:update_role", "member:update_access",
        "member:lock", "member:unlock", "member:regenerate_password", "member:update_2fa"
    ],
    Manager: [
        "assessment:read", "assessment:create", "assessment:update", "assessment:export",
        "vulnerability:read", "vulnerability:create", "vulnerability:update", "vulnerability:export",
        "asset:read", "asset:create", "asset:update",
        "report:read", "report:create",
    ],
    Developer: [
        "assessment:read", "assessment:update",
        "vulnerability:read", "vulnerability:update",
        "asset:read", "asset:update",
        "report:read",
    ],
    Auditor: [
        "assessment:read", "vulnerability:read", "asset:read", "report:read",
    ],
});

function hasPermission(user, requiredPermission, rolePermissions = DefaultRolePermissions) {
    if (!user) return false;
    const userRoles = extractUserRoles(user);
    if (!userRoles.length) return false;

    return userRoles.some((role) => {
        const permissions = rolePermissions[role];
        if (!Array.isArray(permissions)) return false;
        if (permissions.includes("*")) return true;
        if (permissions.includes(requiredPermission)) return true;
        const [resourcePrefix] = requiredPermission.split(":");
        if (resourcePrefix && permissions.includes(`${resourcePrefix}:*`)) return true;
        return false;
    });
}

function hasAllPermissions(user, requiredPermissions = [], rolePermissions = DefaultRolePermissions) {
    if (!Array.isArray(requiredPermissions) || !requiredPermissions.length) return true;
    return requiredPermissions.every((perm) => hasPermission(user, perm, rolePermissions));
}

class ForbiddenError extends Error {
    constructor(message = "Forbidden: insufficient permissions", options = {}) {
        super(message);
        this.name = "ForbiddenError";
        this.status = 403;
        this.statusCode = 403;
        this.reason = options.reason || "INSUFFICIENT_PERMISSIONS";
        this.resource = options.resource;
        this.action = options.action;
        this.permission = options.permission;
    }
}

class UnauthorizedError extends Error {
    constructor(message = "Unauthorized: authentication required", options = {}) {
        super(message);
        this.name = "UnauthorizedError";
        this.status = 401;
        this.statusCode = 401;
        this.reason = options.reason || "UNAUTHENTICATED";
    }
}

function isSuperOrPlatformAdmin(user) {
    const roles = extractUserRoles(user);
    return roles.includes(Roles.SUPER) || roles.includes(Roles.PLATFORM_ADMIN);
}

function isSameOrganization(user, resource) {
    if (!user || !resource) return false;
    const userOrgId = user.orgId || user.organizationId || user.organization;
    const resourceOrgId = resource.orgId || resource.organizationId || resource.organization;
    if (!userOrgId || !resourceOrgId) return false;
    return String(userOrgId) === String(resourceOrgId);
}

function isCollaborator(user, resource) {
    if (!user || !resource) return false;
    const userId = user.id || user._id || user.userId;
    const userEmail = user.email ? String(user.email).toLowerCase() : null;

    const collaborators = Array.isArray(resource.collaborators)
        ? resource.collaborators
        : Array.isArray(resource.collaboratorIds)
        ? resource.collaboratorIds
        : [];

    return collaborators.some((collab) => {
        if (!collab) return false;
        if (typeof collab === "string" || typeof collab === "number") {
            return userId && String(collab) === String(userId);
        }
        const collabId = collab.userId || collab.id || collab._id;
        const collabEmail = collab.email ? String(collab.email).toLowerCase() : null;

        if (userId && collabId && String(collabId) === String(userId)) return true;
        if (userEmail && collabEmail && collabEmail === userEmail) return true;
        return false;
    });
}

function isOwner(user, resource) {
    if (!user || !resource) return false;
    const userId = user.id || user._id || user.userId;
    const ownerId = resource.ownerId || resource.owner || resource.createdBy || resource.author;
    if (!userId || !ownerId) return false;
    return String(userId) === String(ownerId);
}

const AssessmentPolicy = {
    name: "assessment",
    read: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.AUDITOR)) return { granted: true };
        if (isOwner(user, resource) || isCollaborator(user, resource)) return { granted: true };
        return { granted: false, reason: "NOT_AN_ASSESSMENT_COLLABORATOR" };
    },
    create: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER)) return { granted: true };
        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_CREATE_ASSESSMENT" };
    },
    update: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };
        if (roles.includes(Roles.MANAGER) && (isOwner(user, resource) || isCollaborator(user, resource))) return { granted: true };
        if (roles.includes(Roles.DEVELOPER) && (isOwner(user, resource) || isCollaborator(user, resource))) return { granted: true };
        return { granted: false, reason: "ASSESSMENT_UPDATE_REQUIRES_COLLABORATOR_OR_ADMIN" };
    },
    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };
        return { granted: false, reason: "ONLY_ADMIN_CAN_DELETE_ASSESSMENT" };
    },
    export: async ({ user, resource }) => AssessmentPolicy.read({ user, resource }),
};

const VulnerabilityPolicy = {
    name: "vulnerability",
    read: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER) || roles.includes(Roles.AUDITOR)) return { granted: true };
        return { granted: false, reason: "INSUFFICIENT_ROLE_FOR_VULNERABILITY" };
    },
    update: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.AUDITOR)) return { granted: false, reason: "AUDITOR_CANNOT_UPDATE_VULNERABILITY" };
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER)) return { granted: true };
        const userId = user.id || user._id;
        const isAssignee = resource.assigneeId && String(resource.assigneeId) === String(userId);
        if (roles.includes(Roles.DEVELOPER) && (isAssignee || isOwner(user, resource) || isCollaborator(user, resource))) return { granted: true };
        return { granted: false, reason: "VULNERABILITY_UPDATE_NOT_PERMITTED" };
    },
    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };
        return { granted: false, reason: "ONLY_ADMIN_CAN_DELETE_VULNERABILITY" };
    },
};

const AssetPolicy = {
    name: "asset",
    read: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        return { granted: true };
    },
    create: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.AUDITOR)) return { granted: false, reason: "AUDITOR_CANNOT_CREATE_ASSETS" };
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER)) return { granted: true };
        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_CREATE_ASSET" };
    },
    update: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.AUDITOR)) return { granted: false, reason: "AUDITOR_CANNOT_MODIFY_ASSETS" };
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER)) return { granted: true };
        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_UPDATE_ASSET" };
    },
    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };
        if (!isSameOrganization(user, resource)) return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };
        return { granted: false, reason: "ONLY_ADMIN_CAN_DELETE_ASSETS" };
    },
};

class PolicyRegistry {
    constructor() {
        this.policies = new Map();
        this.register("assessment", AssessmentPolicy);
        this.register("vulnerability", VulnerabilityPolicy);
        this.register("asset", AssetPolicy);
    }
    register(resourceType, policy) {
        if (!resourceType || !policy) throw new Error("resourceType and policy are required");
        this.policies.set(resourceType.toLowerCase(), policy);
    }
    get(resourceType) {
        if (!resourceType) return null;
        return this.policies.get(resourceType.toLowerCase()) || null;
    }
    has(resourceType) {
        if (!resourceType) return false;
        return this.policies.has(resourceType.toLowerCase());
    }
}

const defaultPolicyRegistry = new PolicyRegistry();

function normalizeResource(resourceInput, explicitType) {
    if (!resourceInput) return { type: explicitType || "unknown", data: null };
    let type = explicitType;
    let data = resourceInput;
    if (typeof resourceInput === "string") {
        type = explicitType || resourceInput;
        data = {};
    } else if (resourceInput && typeof resourceInput === "object") {
        type = explicitType || resourceInput.type || resourceInput.__type || "unknown";
    }
    return { type: String(type).toLowerCase(), data };
}

class AuthorizationRequestBuilder {
    constructor(engine, initialParams = {}) {
        this.engine = engine;
        this._user = initialParams.user || null;
        this._resource = initialParams.resource || null;
        this._resourceType = initialParams.resourceType || null;
        this._context = initialParams.context || {};
    }
    for(user) {
        this._user = user;
        return this;
    }
    resource(resource, type) {
        this._resource = resource;
        if (type) this._resourceType = type;
        return this;
    }
    withContext(context) {
        this._context = { ...this._context, ...context };
        return this;
    }
    async check(action) {
        return this.engine.check({
            user: this._user,
            resource: this._resource,
            resourceType: this._resourceType,
            action,
            context: this._context,
        });
    }
    async can(action) {
        const result = await this.check(action);
        return result.granted;
    }
    async require(action) {
        const result = await this.check(action);
        if (!result.granted) {
            if (result.reason === "UNAUTHENTICATED") {
                throw new UnauthorizedError("Unauthorized: user is not authenticated");
            }
            throw new ForbiddenError(result.reason || "Forbidden: access denied", {
                reason: result.reason,
                resource: result.resource,
                action,
                permission: result.permission,
            });
        }
        return result;
    }
    async canRead() { return this.can("read"); }
    async canCreate() { return this.can("create"); }
    async canUpdate() { return this.can("update"); }
    async canDelete() { return this.can("delete"); }
}

class AuthorizationEngine {
    constructor(options = {}) {
        this.policyRegistry = options.policyRegistry || defaultPolicyRegistry;
        this.rolePermissions = options.rolePermissions || DefaultRolePermissions;
    }
    async check({ user, resource, resourceType, action, context = {} }) {
        if (!user) {
            return { granted: false, reason: "UNAUTHENTICATED", resource: resourceType || "unknown", action };
        }
        const { type, data } = normalizeResource(resource, resourceType);
        const permission = `${type}:${action}`;
        const userRoles = extractUserRoles(user);

        if (userRoles.includes(Roles.SUPER) || userRoles.includes(Roles.PLATFORM_ADMIN)) {
            return { granted: true, reason: "SUPER_ROLE_BYPASS", permission, resource: type, action };
        }

        const hasRbac = hasPermission(user, permission, this.rolePermissions);
        if (!hasRbac) {
            return { granted: false, reason: `RBAC_ROLE_LACKS_PERMISSION_${permission.toUpperCase()}`, permission, resource: type, action };
        }

        const policy = this.policyRegistry.get(type);
        if (policy && typeof policy[action] === "function") {
            const policyResult = await policy[action]({ user, resource: data, context });
            const granted = typeof policyResult === "boolean" ? policyResult : policyResult?.granted;
            const reason = policyResult?.reason || (granted ? "POLICY_ALLOWED" : "RESOURCE_POLICY_DENIED");
            return { granted: Boolean(granted), reason, permission, resource: type, action };
        }

        return { granted: true, reason: "RBAC_ALLOWED", permission, resource: type, action };
    }
    async can(user, action, resource, context = {}) {
        const result = await this.check({ user, resource, action, context });
        return result.granted;
    }
    async require(user, action, resource, context = {}) {
        const result = await this.check({ user, resource, action, context });
        if (!result.granted) {
            if (result.reason === "UNAUTHENTICATED") {
                throw new UnauthorizedError("Unauthorized: user is not authenticated");
            }
            throw new ForbiddenError(result.reason || "Forbidden: access denied", {
                reason: result.reason,
                resource: result.resource,
                action,
                permission: result.permission,
            });
        }
        return result;
    }
    resource(resource, type) {
        return new AuthorizationRequestBuilder(this, { resource, resourceType: type });
    }
    for(user) {
        return new AuthorizationRequestBuilder(this, { user });
    }
}

const authorization = new AuthorizationEngine();

module.exports = authorization;
module.exports.authorization = authorization;
module.exports.AuthorizationEngine = AuthorizationEngine;
module.exports.AuthorizationRequestBuilder = AuthorizationRequestBuilder;
module.exports.Roles = Roles;
module.exports.ROLE_HIERARCHY = ROLE_HIERARCHY;
module.exports.hasRoleAccess = hasRoleAccess;
module.exports.extractUserRoles = extractUserRoles;
module.exports.hasAnyRole = hasAnyRole;
module.exports.hasForbiddenRole = hasForbiddenRole;
module.exports.Actions = Actions;
module.exports.Resources = Resources;
module.exports.Permissions = Permissions;
module.exports.DefaultRolePermissions = DefaultRolePermissions;
module.exports.hasPermission = hasPermission;
module.exports.hasAllPermissions = hasAllPermissions;
module.exports.ForbiddenError = ForbiddenError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.PolicyRegistry = PolicyRegistry;
module.exports.defaultPolicyRegistry = defaultPolicyRegistry;
module.exports.AssessmentPolicy = AssessmentPolicy;
module.exports.VulnerabilityPolicy = VulnerabilityPolicy;
module.exports.AssetPolicy = AssetPolicy;
module.exports.isSuperOrPlatformAdmin = isSuperOrPlatformAdmin;
module.exports.isSameOrganization = isSameOrganization;
module.exports.isCollaborator = isCollaborator;
module.exports.isOwner = isOwner;
