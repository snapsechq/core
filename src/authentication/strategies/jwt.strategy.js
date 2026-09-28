import jwt from "jsonwebtoken";
import fs from "fs";

/**
 * Extracts bearer token or cookie from request.
 */
export const getTokenFromRequest = (req) => {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
};

/**
 * Sanitizes headers for audit logging.
 */
export const sanitizeHeaders = (headers = {}) => {
  const sanitized = { ...headers };
  const sensitiveKeys = ["authorization", "cookie", "x-api-key", "service-api-key", "x-special-access-token"];
  sensitiveKeys.forEach((key) => {
    if (sanitized[key]) {
      sanitized[key] = "[REDACTED]";
    }
  });
  return sanitized;
};

/**
 * Creates the JWT strategy with injected dependencies.
 */
export function createJwtStrategy(config = {}) {
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
      if (!token) {
        throw new Error("Authentication token is missing");
      }

      const publicKey = getPublicKey();
      const algorithms = options.algorithms || config.algorithms || ["RS256"];

      const decodedToken = jwt.verify(token, publicKey, { algorithms });

      if (decodedToken.type === "intermediary") {
        throw new Error("Intermediary token cannot be used to access protected APIs");
      }

      // Check license expiration
      if (decodedToken.licenceExpiry && new Date(decodedToken.licenceExpiry) < new Date()) {
        const error = new Error("License has expired");
        error.code = "LICENSE_EXPIRED";
        error.licenseExpiry = decodedToken.licenceExpiry;
        throw error;
      }

      // Check organization and personal module access
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

      // Activity logging hook
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

      return {
        user: decodedToken,
        authType: "jwt",
      };
    },
  };
}
