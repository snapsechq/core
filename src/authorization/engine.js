import { defaultPolicyRegistry } from "./policies/index.js";
import { hasPermission, DefaultRolePermissions } from "./permissions.js";
import { extractUserRoles, Roles } from "./roles.js";
import { ForbiddenError, UnauthorizedError } from "./errors.js";

/**
 * Normalizes input resource to extract type and data.
 */
function normalizeResource(resourceInput, explicitType) {
    if (!resourceInput) {
        return { type: explicitType || "unknown", data: null };
    }

    let type = explicitType;
    let data = resourceInput;

    if (typeof resourceInput === "string") {
        type = explicitType || resourceInput;
        data = {};
    } else if (resourceInput && typeof resourceInput === "object") {
        type = explicitType || resourceInput.type || resourceInput.__type || "unknown";
    }

    return {
        type: String(type).toLowerCase(),
        data,
    };
}

/**
 * Fluent Authorization Request Builder
 */
export class AuthorizationRequestBuilder {
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

    // Convenience methods
    async canRead() {
        return this.can("read");
    }

    async canCreate() {
        return this.can("create");
    }

    async canUpdate() {
        return this.can("update");
    }

    async canDelete() {
        return this.can("delete");
    }
}

/**
 * SnapSec Authorization Engine
 */
export class AuthorizationEngine {
    constructor(options = {}) {
        this.policyRegistry = options.policyRegistry || defaultPolicyRegistry;
        this.rolePermissions = options.rolePermissions || DefaultRolePermissions;
    }

    /**
     * Evaluates if user is authorized to perform action on resource.
     * Returns a detailed AuthorizationResult.
     */
    async check({ user, resource, resourceType, action, context = {} }) {
        if (!user) {
            return {
                granted: false,
                reason: "UNAUTHENTICATED",
                resource: resourceType || "unknown",
                action,
            };
        }

        const { type, data } = normalizeResource(resource, resourceType);
        const permission = `${type}:${action}`;

        const userRoles = extractUserRoles(user);

        // 1. Platform Admin and Super have universal access
        if (userRoles.includes(Roles.SUPER) || userRoles.includes(Roles.PLATFORM_ADMIN)) {
            return {
                granted: true,
                reason: "SUPER_ROLE_BYPASS",
                permission,
                resource: type,
                action,
            };
        }

        // 2. Global RBAC check
        const hasRbac = hasPermission(user, permission, this.rolePermissions);
        if (!hasRbac) {
            return {
                granted: false,
                reason: `RBAC_ROLE_LACKS_PERMISSION_${permission.toUpperCase()}`,
                permission,
                resource: type,
                action,
            };
        }

        // 3. Resource Policy check (if policy exists for this resource type)
        const policy = this.policyRegistry.get(type);
        if (policy && typeof policy[action] === "function") {
            const policyResult = await policy[action]({
                user,
                resource: data,
                context,
            });

            const granted = typeof policyResult === "boolean" ? policyResult : policyResult?.granted;
            const reason = policyResult?.reason || (granted ? "POLICY_ALLOWED" : "RESOURCE_POLICY_DENIED");

            return {
                granted: Boolean(granted),
                reason,
                permission,
                resource: type,
                action,
            };
        }

        // If RBAC allowed and no specific resource policy handler was defined for this action
        return {
            granted: true,
            reason: "RBAC_ALLOWED",
            permission,
            resource: type,
            action,
        };
    }

    /**
     * Boolean access check.
     */
    async can(user, action, resource, context = {}) {
        const result = await this.check({ user, resource, action, context });
        return result.granted;
    }

    /**
     * Enforces access check, throwing ForbiddenError if unauthorized.
     */
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

    /**
     * Fluent API entry: authorization.resource(resource, [type])
     */
    resource(resource, type) {
        return new AuthorizationRequestBuilder(this, { resource, resourceType: type });
    }

    /**
     * Fluent API entry: authorization.for(user)
     */
    for(user) {
        return new AuthorizationRequestBuilder(this, { user });
    }
}

/**
 * Singleton Default Authorization Instance
 */
export const authorization = new AuthorizationEngine();
