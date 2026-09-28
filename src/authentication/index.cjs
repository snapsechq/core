/**
 * CommonJS entrypoint for @snapsec/authentication
 */
const jwt = require("jsonwebtoken");
const fs = require("fs");
const axios = require("axios");

const getTokenFromRequest = (req) => {
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        return authHeader.split(" ")[1];
    }
    if (req.cookies && req.cookies.token) {
        return req.cookies.token;
    }
    return null;
};

const sanitizeHeaders = (headers = {}) => {
    const sanitized = { ...headers };
    const sensitiveKeys = ["authorization", "cookie", "x-api-key", "service-api-key", "x-special-access-token"];
    sensitiveKeys.forEach((key) => {
        if (sanitized[key]) {
            sanitized[key] = "[REDACTED]";
        }
    });
    return sanitized;
};

function createJwtStrategy(config = {}) {
    let cachedPublicKey = config.publicKey || null;

    const getPublicKey = () => {
        if (cachedPublicKey) return cachedPublicKey;
        if (config.publicKeyPath) {
            cachedPublicKey = fs.readFileSync(config.publicKeyPath, "utf8");
            return cachedPublicKey;
        }
        throw new Error("Public key or publicKeyPath must be provided for JWT authentication");
    };

    return {
        name: "jwt",
        execute: async (req, options = {}) => {
            const token = getTokenFromRequest(req);
            if (!token) throw new Error("Authentication token is missing");

            const publicKey = getPublicKey();
            const algorithms = options.algorithms || config.algorithms || ["RS256"];
            const decodedToken = jwt.verify(token, publicKey, { algorithms });

            if (decodedToken.type === "intermediary") {
                throw new Error("Intermediary token cannot be used to access protected APIs");
            }

            if (decodedToken.licenceExpiry && new Date(decodedToken.licenceExpiry) < new Date()) {
                const error = new Error("License has expired");
                error.code = "LICENSE_EXPIRED";
                error.licenseExpiry = decodedToken.licenceExpiry;
                throw error;
            }

            const requiredAccess = options.requiredOrgAccess || config.requiredOrgAccess;
            if (requiredAccess) {
                if (decodedToken.orgAccess && !decodedToken.orgAccess.includes(requiredAccess)) {
                    const error = new Error(`Your organization does not have access to SnapSec ${requiredAccess}`);
                    error.status = 403;
                    throw error;
                }

                if (
                    decodedToken.accessTo &&
                    Array.isArray(decodedToken.accessTo) &&
                    !decodedToken.accessTo.includes(requiredAccess)
                ) {
                    const error = new Error(`You do not have personal access to SnapSec ${requiredAccess}`);
                    error.status = 403;
                    throw error;
                }
            }

            const onActivityLog = options.onActivityLog || config.onActivityLog;
            if (onActivityLog && !options.skipActivityLog) {
                const requestData = {
                    method: req.method,
                    path: req.path,
                    headers: sanitizeHeaders(req.headers),
                    query: req.query,
                    params: req.params,
                    body: req.body,
                    ip: req.ip,
                    originalUrl: req.originalUrl,
                    authContext: decodedToken,
                    origin: options.activityOrigin || config.activityOrigin || "auth",
                };
                try {
                    await onActivityLog(requestData);
                } catch (logErr) {
                    console.error("Failed to publish activity log:", logErr?.message || logErr);
                }
            }

            return { user: decodedToken, authType: "jwt" };
        },
    };
}

function createApiKeyStrategy(config = {}) {
    return {
        name: "api_key",
        execute: async (req) => {
            const apiKey = req.headers?.["x-api-key"];
            if (!apiKey) throw new Error("API key is missing");

            const authServiceUrl = config.authServiceUrl || process.env.AUTH_SERVICE_URL;
            if (!authServiceUrl) throw new Error("authServiceUrl is required for API key authentication");

            const response = await axios.get(`${authServiceUrl}/api/org/apikey/validate`, {
                headers: { "x-api-key": apiKey },
                timeout: config.timeout || 5000,
            });

            const isAuth = response.data?.data?.success;
            if (!isAuth) throw new Error("Invalid API key");

            const data = response.data.data;
            return {
                user: data.user,
                authType: data.type === "org" ? "org_api_key" : "user_api_key",
            };
        },
    };
}

function createInternalStrategy(config = {}) {
    return {
        name: "internal",
        execute: async (req) => {
            const serviceKey = config.serviceKey || process.env.SERVICE_KEY;
            const specialToken = config.specialAccessToken || process.env.SPECIAL_ACCESS_TOKEN || serviceKey;

            const serviceKeyValue = req.headers?.["service-api-key"];
            if (serviceKeyValue) {
                if (!serviceKey || serviceKeyValue !== serviceKey) throw new Error("Invalid service key");
                return { user: { role: "Super" }, authType: "service_key", service_req: true };
            }

            const specialAccessToken = req.headers?.["x-special-access-token"] || req.query?.special_token;
            if (specialAccessToken) {
                if (!specialToken || specialAccessToken !== specialToken) throw new Error("Invalid special access token");
                return { user: { role: "Super" }, authType: "special_token", service_req: true };
            }

            throw new Error("Internal authentication credentials missing");
        },
    };
}

function createIntermediaryStrategy(config = {}) {
    let cachedPublicKey = config.publicKey || null;

    const getPublicKey = () => {
        if (cachedPublicKey) return cachedPublicKey;
        if (config.publicKeyPath) {
            cachedPublicKey = fs.readFileSync(config.publicKeyPath, "utf8");
            return cachedPublicKey;
        }
        throw new Error("Public key or publicKeyPath must be provided for intermediary token authentication");
    };

    return {
        name: "intermediary",
        execute: async (req, options = {}) => {
            const token = getTokenFromRequest(req);
            if (!token) throw new Error("Authentication token is missing");

            const publicKey = getPublicKey();
            const algorithms = options.algorithms || config.algorithms || ["RS256"];
            const decoded = jwt.verify(token, publicKey, { algorithms });

            if (decoded.type !== "intermediary" || (options.scope && decoded.scope !== options.scope)) {
                throw new Error("Invalid token type for this endpoint");
            }

            return { user: decoded, authType: "intermediary" };
        },
    };
}

function createAuth(config = {}) {
    const strategies = {
        jwt: createJwtStrategy(config),
        api_key: createApiKeyStrategy(config),
        internal: createInternalStrategy(config),
        intermediary: createIntermediaryStrategy(config),
        ...config.customStrategies,
    };

    function auth(options = {}) {
        const {
            mode,
            roles = [],
            forbidRoles = [],
            optional = false,
            requiredOrgAccess = config.requiredOrgAccess,
            activityOrigin = config.activityOrigin,
        } = options;

        if (!mode) throw new Error("Auth mode is required");

        const modes = Array.isArray(mode) ? mode : [mode];
        for (const m of modes) {
            if (!strategies[m]) throw new Error(`Unknown auth mode: ${m}`);
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

                    if (roles.length > 0) {
                        if (!userRole) {
                            return res.status(403).json({ success: false, error: "Forbidden: user role not found" });
                        }
                        if (!roles.includes(userRole)) {
                            return res.status(403).json({ success: false, error: "Forbidden: insufficient role" });
                        }
                    }

                    if (forbidRoles.length > 0 && userRole && forbidRoles.includes(userRole)) {
                        return res.status(403).json({
                            success: false,
                            error: `Forbidden: ${userRole} role is not allowed for this action`,
                        });
                    }

                    req.auth = authResult;
                    req.user = authResult.user;
                    req.authenticatedService = authResult.user;
                    if (authResult.service_req) req.service_req = true;

                    authSuccess = true;
                    break;
                } catch (err) {
                    lastError = err;
                    if (
                        err && 
                        err.message && 
                        !err.message.includes("missing") &&
                        !err.message.includes("Invalid token type") &&
                        !err.message.includes("Intermediary token cannot be used")
                    ) {
                        break;
                    }
                }
            }

            if (authSuccess) return next();
            if (optional) return next();

            const errorResponse = { success: false, error: lastError?.message || "Unauthorized" };
            if (lastError?.code === "LICENSE_EXPIRED") {
                errorResponse.errorCode = "LICENSE_EXPIRED";
                errorResponse.licenseExpiry = lastError.licenseExpiry;
            }

            return res.status(lastError?.status || 401).json(errorResponse);
        };
    }

    const requireAdmin = auth({ mode: ["internal", "jwt", "api_key"], roles: ["Platform Admin", "Super", "Admin"] });
    const requireManager = auth({ mode: ["internal", "jwt", "api_key"], roles: ["Platform Admin", "Super", "Admin", "Manager"] });
    const requireMember = auth({ mode: ["internal", "jwt", "api_key"], roles: ["Platform Admin", "Super", "Admin", "Manager", "Developer"] });
    const requireWriteAccess = auth({ mode: ["internal", "jwt", "api_key"], forbidRoles: ["Auditor"] });
    const requireNonDeveloper = auth({ mode: ["internal", "jwt", "api_key"], forbidRoles: ["Developer", "Auditor"] });
    const requireAuth = auth({ mode: ["internal", "jwt", "api_key"] });
    const optionalAuth = auth({ mode: ["jwt", "api_key"], optional: true });
    const authenticateService = (customOptions = {}) => auth({
        mode: ["internal", "jwt", "api_key"],
        requiredOrgAccess: config.requiredOrgAccess,
        activityOrigin: config.activityOrigin,
        ...customOptions,
    });

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

module.exports = createAuth;
module.exports.createAuth = createAuth;
module.exports.createJwtStrategy = createJwtStrategy;
module.exports.createApiKeyStrategy = createApiKeyStrategy;
module.exports.createInternalStrategy = createInternalStrategy;
module.exports.createIntermediaryStrategy = createIntermediaryStrategy;
module.exports.getTokenFromRequest = getTokenFromRequest;
module.exports.sanitizeHeaders = sanitizeHeaders;
