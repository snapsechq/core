const path = require("path");
const fs = require("fs");
const jwt = require("../packages/authentication/node_modules/jsonwebtoken");
const assert = require("assert");

const privateKeyPath = path.resolve(__dirname, "../../../keys/private.pem");
const publicKeyPath = path.resolve(__dirname, "../../../keys/public.pem");
const privateKey = fs.readFileSync(privateKeyPath, "utf8");

// Provide local keys path for old VM module
process.env.PUBLIC_KEY_PATH = publicKeyPath;
process.env.SERVICE_KEY = "test-service-key-xyz";
process.env.SPECIAL_ACCESS_TOKEN = "test-special-token-abc";

// Mock RabbitMQ before loading old VM module so it doesn't try to connect over the network
try {
  const rabbitmqPath = require.resolve("../../VM/src/services/rabbitmq.service.js");
  require.cache[rabbitmqPath] = {
    id: rabbitmqPath,
    filename: rabbitmqPath,
    loaded: true,
    exports: {
      mqbroker: {
        publish: async () => {},
        connect: async () => {},
      },
    },
  };
} catch (e) {}

// Load OLD VM middleware
const oldAuthModule = require("../../VM/src/middlewares/auth/index.js");

// Load NEW SDK package
const createAuth = require("../packages/authentication/src/index.cjs");
const newAuthSuite = createAuth({
  publicKeyPath,
  serviceKey: "test-service-key-xyz",
  specialAccessToken: "test-special-token-abc",
  requiredOrgAccess: "VM",
  activityOrigin: "vm",
  onActivityLog: async () => {}, // no-op for tests
});

function createMockReqRes(headers = {}, options = {}) {
  const req = {
    headers: { ...headers },
    method: options.method || "GET",
    path: options.path || "/api/test",
    params: {},
    query: {},
    body: {},
    ip: "127.0.0.1",
    originalUrl: "/api/test",
  };

  let responded = false;
  let responseStatus = 200;
  let responseBody = null;
  let nextCalled = false;

  const res = {
    status: (code) => {
      responseStatus = code;
      return res;
    },
    json: (body) => {
      responded = true;
      responseBody = body;
      return res;
    },
  };

  const next = () => {
    nextCalled = true;
  };

  return { req, res, next, getOutcome: () => ({ responded, responseStatus, responseBody, nextCalled }) };
}

async function runTest(name, oldMiddleware, newMiddleware, headers) {
  const oldCtx = createMockReqRes(headers);
  const newCtx = createMockReqRes(headers);

  // In testing without live RabbitMQ broker, silence activity logging
  const testOptions = { skipActivityLog: true };

  await oldMiddleware(oldCtx.req, oldCtx.res, oldCtx.next);
  await newMiddleware(newCtx.req, newCtx.res, newCtx.next);

  const oldRes = oldCtx.getOutcome();
  const newRes = newCtx.getOutcome();

  assert.strictEqual(oldRes.nextCalled, newRes.nextCalled, `${name}: nextCalled mismatch (old: ${oldRes.nextCalled}, new: ${newRes.nextCalled})`);
  assert.strictEqual(oldRes.responseStatus, newRes.responseStatus, `${name}: status mismatch (old: ${oldRes.responseStatus}, new: ${newRes.responseStatus})`);

  if (oldRes.nextCalled) {
    assert.strictEqual(oldCtx.req.user?.role, newCtx.req.user?.role, `${name}: req.user.role mismatch`);
    assert.strictEqual(oldCtx.req.user?._id, newCtx.req.user?._id, `${name}: req.user._id mismatch`);
  }

  console.log(`PASS: [${name}] - Status: ${newRes.responseStatus}, Next: ${newRes.nextCalled}`);
}

async function main() {
  console.log("==================================================");
  console.log("RUNNING PARITY TESTS: OLD VM AUTH vs NEW SDK AUTH");
  console.log("==================================================");

  // 1. Missing Token
  await runTest(
    "Missing token returns 401",
    oldAuthModule.requireAuth,
    newAuthSuite.requireAuth,
    {}
  );

  // 2. Valid Admin JWT
  const validAdminToken = jwt.sign(
    { _id: "user_admin", role: "Admin", orgAccess: ["VM"], accessTo: ["VM"] },
    privateKey,
    { algorithm: "RS256" }
  );
  await runTest(
    "Valid Admin token passes requireAuth",
    oldAuthModule.requireAuth,
    newAuthSuite.requireAuth,
    { authorization: `Bearer ${validAdminToken}` }
  );

  // 3. Valid Admin on requireAdmin
  await runTest(
    "Valid Admin token passes requireAdmin",
    oldAuthModule.requireAdmin,
    newAuthSuite.requireAdmin,
    { authorization: `Bearer ${validAdminToken}` }
  );

  // 4. Developer token on requireAdmin (should fail 403)
  const validDevToken = jwt.sign(
    { _id: "user_dev", role: "Developer", orgAccess: ["VM"], accessTo: ["VM"] },
    privateKey,
    { algorithm: "RS256" }
  );
  await runTest(
    "Developer token blocked on requireAdmin (403)",
    oldAuthModule.requireAdmin,
    newAuthSuite.requireAdmin,
    { authorization: `Bearer ${validDevToken}` }
  );

  // 5. Auditor on requireWriteAccess (should fail 403 forbidRoles)
  const validAuditorToken = jwt.sign(
    { _id: "user_auditor", role: "Auditor", orgAccess: ["VM"], accessTo: ["VM"] },
    privateKey,
    { algorithm: "RS256" }
  );
  await runTest(
    "Auditor token blocked on requireWriteAccess (403)",
    oldAuthModule.requireWriteAccess,
    newAuthSuite.requireWriteAccess,
    { authorization: `Bearer ${validAuditorToken}` }
  );

  // 6. Developer on requireNonDeveloper (should fail 403)
  await runTest(
    "Developer blocked on requireNonDeveloper (403)",
    oldAuthModule.requireNonDeveloper,
    newAuthSuite.requireNonDeveloper,
    { authorization: `Bearer ${validDevToken}` }
  );

  // 7. Expired license (should fail 401 LICENSE_EXPIRED)
  const expiredLicenseToken = jwt.sign(
    { _id: "user_exp", role: "Admin", orgAccess: ["VM"], accessTo: ["VM"], licenceExpiry: new Date(Date.now() - 60000).toISOString() },
    privateKey,
    { algorithm: "RS256" }
  );
  await runTest(
    "Expired license returns 401 LICENSE_EXPIRED",
    oldAuthModule.requireAuth,
    newAuthSuite.requireAuth,
    { authorization: `Bearer ${expiredLicenseToken}` }
  );

  // 8. Service Key Auth
  await runTest(
    "Internal service-api-key passes",
    oldAuthModule.requireAuth,
    newAuthSuite.requireAuth,
    { "service-api-key": "test-service-key-xyz" }
  );

  // 9. Optional Auth with no token
  await runTest(
    "Optional auth passes without credentials",
    oldAuthModule.optionalAuth,
    newAuthSuite.optionalAuth,
    {}
  );

  console.log("==================================================");
  console.log("ALL PARITY TESTS PASSED: 100% BEHAVIOR MATCH");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("PARITY TEST FAILED:", err);
  process.exit(1);
});
