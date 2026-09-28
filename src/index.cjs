/**
 * SnapSec Core (Unified Package)
 * CommonJS Entrypoint
 */
const authentication = require("./authentication/index.cjs");
const authorization = require("./authorization/index.cjs");
const rabbitmq = require("./rabbitmq/index.cjs");

// Extract the primary factory/instance
const createAuth = authentication.createAuth || authentication;
const authz = authorization.authorization || authorization;
const { createMqBroker, RabbitMQ, mqbroker, buildRabbitmqUrl } = rabbitmq;

module.exports = {
    // Primary Top-Level Primitives (Pattern A)
    createAuth,
    authorization: authz,
    createMqBroker,
    mqbroker,
    RabbitMQ,
    buildRabbitmqUrl,

    // Re-export full Authentication suite & helpers
    createJwtStrategy: authentication.createJwtStrategy,
    createApiKeyStrategy: authentication.createApiKeyStrategy,
    createInternalStrategy: authentication.createInternalStrategy,
    createIntermediaryStrategy: authentication.createIntermediaryStrategy,
    getTokenFromRequest: authentication.getTokenFromRequest,
    sanitizeHeaders: authentication.sanitizeHeaders,

    // Re-export full Authorization primitives, roles, errors & policies
    AuthorizationEngine: authorization.AuthorizationEngine,
    AuthorizationRequestBuilder: authorization.AuthorizationRequestBuilder,
    Roles: authorization.Roles,
    ROLE_HIERARCHY: authorization.ROLE_HIERARCHY,
    hasRoleAccess: authorization.hasRoleAccess,
    extractUserRoles: authorization.extractUserRoles,
    hasAnyRole: authorization.hasAnyRole,
    hasForbiddenRole: authorization.hasForbiddenRole,
    Actions: authorization.Actions,
    Resources: authorization.Resources,
    Permissions: authorization.Permissions,
    DefaultRolePermissions: authorization.DefaultRolePermissions,
    hasPermission: authorization.hasPermission,
    hasAllPermissions: authorization.hasAllPermissions,
    ForbiddenError: authorization.ForbiddenError,
    UnauthorizedError: authorization.UnauthorizedError,
    PolicyRegistry: authorization.PolicyRegistry,
    defaultPolicyRegistry: authorization.defaultPolicyRegistry,
    AssessmentPolicy: authorization.AssessmentPolicy,
    VulnerabilityPolicy: authorization.VulnerabilityPolicy,
    AssetPolicy: authorization.AssetPolicy,
    isSuperOrPlatformAdmin: authorization.isSuperOrPlatformAdmin,
    isSameOrganization: authorization.isSameOrganization,
    isCollaborator: authorization.isCollaborator,
    isOwner: authorization.isOwner,
};

module.exports.default = module.exports;
