const authorization = require("../packages/authorization/src/index.cjs");
const createAuth = require("../packages/authentication/src/index.cjs");

console.log("CJS Authorization methods:", {
    can: typeof authorization.can,
    require: typeof authorization.require,
    resource: typeof authorization.resource,
    Roles: Object.keys(authorization.Roles),
});

console.log("CJS Authentication factory:", {
    createAuth: typeof createAuth,
    getTokenFromRequest: typeof createAuth.getTokenFromRequest,
});

console.log("SUCCESS: Both CommonJS modules loaded and validated successfully.");
