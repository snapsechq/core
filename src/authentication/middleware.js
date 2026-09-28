import { createJwtStrategy } from "./strategies/jwt.strategy.js";
import { createApiKeyStrategy } from "./strategies/apiKey.strategy.js";
import { createInternalStrategy } from "./strategies/internal.strategy.js";
import { createIntermediaryStrategy } from "./strategies/intermediary.strategy.js";

/**
 * Creates the pluggable SnapSec authentication suite with injected configuration.
 *
 * @param {Object} config - Service configuration
 * @param {string} [config.publicKey] - RSA public key content
 * @param {string} [config.publicKeyPath] - Path to RSA public key
 * @param {string} [config.serviceKey] - Inter-service API key
 * @param {string} [config.specialAccessToken] - Special token for privileged access
 * @param {string} [config.authServiceUrl] - URL of Auth service for API key validation
 * @param {string} [config.activityOrigin] - Default activity origin (e.g. "asm", "vm")
 * @param {string} [config.requiredOrgAccess] - Default org module (e.g. "ASM", "VM")
 * @param {Function} [config.onActivityLog] - Callback hook for publishing activity logs
 * @param {Object} [config.customStrategies] - Additional custom strategy handlers
 */
export function createAuth(config = {}) {
    const strategies = {
        jwt: createJwtStrategy(config),
        api_key: createApiKeyStrategy(config),
        internal: createInternalStrategy(config),
        intermediary: createIntermediaryStrategy(config),
        ...config.customStrategies,
    };

    /**
     * Authentication Middleware Factory
     */
    function auth(options = {}) {
        const {
            mode,
            roles = [],
            forbidRoles = [],
            optional = false,
            requiredOrgAccess = config.requiredOrgAccess,
            activityOrigin = config.activityOrigin,
        } = options;

        if (!mode) {
            throw new Error("Auth mode is required");
        }

        const modes = Array.isArray(mode) ? mode : [mode];
        for (const m of modes) {
            if (!strategies[m]) {
                throw new Error(`Unknown auth mode: ${m}`);
            }
        }

        return async function authMiddleware(req, res, next) {
            let lastError = null;
            let authSuccess = false;

            for (const m of modes) {
                const strategy = strategies[m];

                try {
                    const authResult = await strategy.execute(req, {
                        ...options,
                        requiredOrgAccess,
                        activityOrigin,
                    });

                    const userRole = authResult?.user?.role;

                    // 1. Allowed Roles Check
                    if (roles.length > 0) {
                        if (!userRole) {
                            return res.status(403).json({
                                success: false,
                                error: "Forbidden: user role not found",
                            });
                        }
                        if (!roles.includes(userRole)) {
                            return res.status(403).json({
                                success: false,
                                error: "Forbidden: insufficient role",
                            });
                        }
                    }

                    // 2. Forbidden Roles Check
                    if (forbidRoles.length > 0 && userRole && forbidRoles.includes(userRole)) {
                        return res.status(403).json({
                            success: false,
                            error: `Forbidden: ${userRole} role is not allowed for this action`,
                        });
                    }

                    // Attach authentication context to request
                    req.auth = authResult;
                    req.user = authResult.user;
                    req.authenticatedService = authResult.user;
                    if (authResult.service_req) {
                        req.service_req = true;
                    }

                    authSuccess = true;
                    break;
                } catch (err) {
                    lastError = err;

                    // If credentials were provided but invalid/expired, do not fall back to subsequent strategies
                    if (
                        err && 
                        err.message && 
                        !err.message.includes("missing") &&
                        !err.message.includes("Invalid token type") &&
                        !err.message.includes("Intermediary token cannot be used")
                    ) {
                        break;
                    }
                    // Otherwise, continue to next strategy in chain
                }
            }

            if (authSuccess) {
                return next();
            }

            if (optional) {
                return next();
            }

            const errorResponse = {
                success: false,
                error: lastError?.message || "Unauthorized",
            };

            if (lastError?.code === "LICENSE_EXPIRED") {
                errorResponse.errorCode = "LICENSE_EXPIRED";
                errorResponse.licenseExpiry = lastError.licenseExpiry;
            }

            return res.status(lastError?.status || 401).json(errorResponse);
        };
    }

    // Preconfigured convenience middlewares
    const requireAdmin = auth({
        mode: ["internal", "jwt", "api_key"],
        roles: ["Platform Admin", "Super", "Admin"],
    });

    const requireManager = auth({
        mode: ["internal", "jwt", "api_key"],
        roles: ["Platform Admin", "Super", "Admin", "Manager"],
    });

    const requireMember = auth({
        mode: ["internal", "jwt", "api_key"],
        roles: ["Platform Admin", "Super", "Admin", "Manager", "Developer"],
    });

    const requireWriteAccess = auth({
        mode: ["internal", "jwt", "api_key"],
        forbidRoles: ["Auditor"],
    });

    const requireNonDeveloper = auth({
        mode: ["internal", "jwt", "api_key"],
        forbidRoles: ["Developer", "Auditor"],
    });

    const requireAuth = auth({
        mode: ["internal", "jwt", "api_key"],
    });

    const optionalAuth = auth({
        mode: ["jwt", "api_key"],
        optional: true,
    });

    const authenticateService = (customOptions = {}) => {
        return auth({
            mode: ["internal", "jwt", "api_key"],
            requiredOrgAccess: config.requiredOrgAccess,
            activityOrigin: config.activityOrigin,
            ...customOptions,
        });
    };

    return {
        auth,
        strategies,
        requireAdmin,
        requireManager,
        requireMember,
        requireWriteAccess,
        requireNonDeveloper,
        requireAuth,
        optionalAuth,
        authenticateService,
    };
}
