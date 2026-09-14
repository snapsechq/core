import { describe, it, expect, beforeAll, vi } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createAuth } from "../src/index.js";

describe("@snapsec/authentication", () => {
    let privateKey;
    let publicKey;

    beforeAll(() => {
        // Generate RSA key pair for testing
        const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
        });
        privateKey = priv;
        publicKey = pub;
    });

    const mockResponse = () => {
        const res = {};
        res.status = vi.fn().mockReturnValue(res);
        res.json = vi.fn().mockReturnValue(res);
        return res;
    };

    it("authenticates valid JWT token and attaches user context", async () => {
        const authSuite = createAuth({
            publicKey,
            serviceKey: "test-service-key",
            requiredOrgAccess: "ASM",
        });

        const token = jwt.sign(
            {
                _id: "user_1",
                email: "user@snapsec.co",
                role: "Admin",
                orgAccess: ["ASM"],
                accessTo: ["ASM"],
            },
            privateKey,
            { algorithm: "RS256" }
        );

        const req = {
            headers: { authorization: `Bearer ${token}` },
            path: "/api/test",
            method: "GET",
        };
        const res = mockResponse();
        const next = vi.fn();

        const middleware = authSuite.auth({ mode: "jwt" });
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user.role).toBe("Admin");
        expect(req.auth.authType).toBe("jwt");
    });

    it("rejects expired license with LICENSE_EXPIRED code", async () => {
        const authSuite = createAuth({
            publicKey,
        });

        const expiredDate = new Date(Date.now() - 10000).toISOString();
        const token = jwt.sign(
            {
                _id: "user_1",
                role: "Admin",
                licenceExpiry: expiredDate,
            },
            privateKey,
            { algorithm: "RS256" }
        );

        const req = {
            headers: { authorization: `Bearer ${token}` },
        };
        const res = mockResponse();
        const next = vi.fn();

        const middleware = authSuite.auth({ mode: "jwt" });
        await middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errorCode: "LICENSE_EXPIRED",
            })
        );
    });

    it("authenticates internal service key", async () => {
        const authSuite = createAuth({
            serviceKey: "super-secret-key-123",
        });

        const req = {
            headers: { "service-api-key": "super-secret-key-123" },
        };
        const res = mockResponse();
        const next = vi.fn();

        const middleware = authSuite.auth({ mode: ["internal", "jwt"] });
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.service_req).toBe(true);
        expect(req.user.role).toBe("Super");
    });

    it("enforces allowed roles", async () => {
        const authSuite = createAuth({
            publicKey,
        });

        const token = jwt.sign(
            {
                _id: "dev_1",
                role: "Developer",
            },
            privateKey,
            { algorithm: "RS256" }
        );

        const req = {
            headers: { authorization: `Bearer ${token}` },
        };
        const res = mockResponse();
        const next = vi.fn();

        const adminOnlyMiddleware = authSuite.auth({
            mode: "jwt",
            roles: ["Admin", "Super"],
        });

        await adminOnlyMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "Forbidden: insufficient role",
            })
        );
    });

    it("enforces forbidden roles", async () => {
        const authSuite = createAuth({
            publicKey,
        });

        const token = jwt.sign(
            {
                _id: "auditor_1",
                role: "Auditor",
            },
            privateKey,
            { algorithm: "RS256" }
        );

        const req = {
            headers: { authorization: `Bearer ${token}` },
        };
        const res = mockResponse();
        const next = vi.fn();

        const writeAccessMiddleware = authSuite.requireWriteAccess;
        await writeAccessMiddleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "Forbidden: Auditor role is not allowed for this action",
            })
        );
    });

    it("invokes activity log callback with sanitized headers", async () => {
        const logSpy = vi.fn();
        const authSuite = createAuth({
            publicKey,
            onActivityLog: logSpy,
        });

        const token = jwt.sign(
            {
                _id: "user_1",
                role: "Admin",
            },
            privateKey,
            { algorithm: "RS256" }
        );

        const req = {
            headers: {
                authorization: `Bearer ${token}`,
                "x-api-key": "secret-api-key",
            },
            method: "POST",
            path: "/api/test",
        };
        const res = mockResponse();
        const next = vi.fn();

        const middleware = authSuite.auth({ mode: "jwt" });
        await middleware(req, res, next);

        expect(logSpy).toHaveBeenCalled();
        const loggedData = logSpy.mock.calls[0][0];
        expect(loggedData.headers.authorization).toBe("[REDACTED]");
        expect(loggedData.headers["x-api-key"]).toBe("[REDACTED]");
    });

    it("supports optional authentication", async () => {
        const authSuite = createAuth({
            publicKey,
        });

        const req = { headers: {} };
        const res = mockResponse();
        const next = vi.fn();

        const middleware = authSuite.optionalAuth;
        await middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(req.user).toBeUndefined();
    });
});
