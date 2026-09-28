import { describe, it, expect } from "vitest";
import { createAuth, authorization, Roles, Permissions, createMqBroker } from "../src/index.js";
import coreCjs from "../src/index.cjs";

describe("SnapSec Core Unified Package Root Exports", () => {
    describe("ESM Root Exports", () => {
        it("exports createAuth factory", () => {
            expect(typeof createAuth).toBe("function");
        });

        it("exports authorization engine and constants", () => {
            expect(authorization).toBeDefined();
            expect(typeof authorization.can).toBe("function");
            expect(typeof authorization.require).toBe("function");
            expect(Roles).toBeDefined();
            expect(Roles.ADMIN).toBe("Admin");
            expect(Permissions).toBeDefined();
        });

        it("exports createMqBroker factory", () => {
            expect(typeof createMqBroker).toBe("function");
        });
    });

    describe("CommonJS Root Exports", () => {
        it("exports createAuth factory", () => {
            expect(typeof coreCjs.createAuth).toBe("function");
        });

        it("exports authorization engine and constants", () => {
            expect(coreCjs.authorization).toBeDefined();
            expect(typeof coreCjs.authorization.can).toBe("function");
            expect(typeof coreCjs.authorization.require).toBe("function");
            expect(coreCjs.Roles).toBeDefined();
            expect(coreCjs.Roles.ADMIN).toBe("Admin");
            expect(coreCjs.Permissions).toBeDefined();
        });

        it("exports createMqBroker factory", () => {
            expect(typeof coreCjs.createMqBroker).toBe("function");
        });
    });
});
