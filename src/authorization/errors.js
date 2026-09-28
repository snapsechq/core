/**
 * Thrown when an authenticated user attempts an unauthorized action.
 */
export class ForbiddenError extends Error {
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

/**
 * Thrown when an unauthenticated request attempts an operation requiring authentication.
 */
export class UnauthorizedError extends Error {
    constructor(message = "Unauthorized: authentication required", options = {}) {
        super(message);
        this.name = "UnauthorizedError";
        this.status = 401;
        this.statusCode = 401;
        this.reason = options.reason || "UNAUTHENTICATED";
    }
}
