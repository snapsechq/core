import { describe, it, expect } from "vitest";
import authorization, {
    AuthorizationEngine,
    Roles,
    hasRoleAccess,
    hasPermission,
    hasAllPermissions,
    ForbiddenError,
    UnauthorizedError,
    PolicyRegistry,
} from "../src/index.js";

describe("@snapsec/authorization", () => {
    describe("Roles & Hierarchy", () => {
        it("correctly evaluates role hierarchy", () => {
            expect(hasRoleAccess("Super", "Admin")).toBe(true);
            expect(hasRoleAccess("Admin", "Manager")).toBe(true);
            expect(hasRoleAccess("Developer", "Admin")).toBe(false);
            expect(hasRoleAccess("Auditor", "Developer")).toBe(false);
            expect(hasRoleAccess("InvalidRole", "Admin")).toBe(false);
        });
    });

    describe("Permissions & Wildcards", () => {
        it("evaluates exact and wildcard permissions", () => {
            const superUser = { roles: ["Super"] };
            const adminUser = { roles: ["Admin"] };
            const devUser = { roles: ["Developer"] };
            const auditorUser = { roles: ["Auditor"] };

            expect(hasPermission(superUser, "anything:read")).toBe(true);
            expect(hasPermission(adminUser, "assessment:create")).toBe(true);
            expect(hasPermission(devUser, "assessment:create")).toBe(false);
            expect(hasPermission(devUser, "assessment:read")).toBe(true);
            expect(hasPermission(auditorUser, "assessment:delete")).toBe(false);
        });

        it("evaluates hasAllPermissions", () => {
            const adminUser = { roles: ["Admin"] };
            expect(hasAllPermissions(adminUser, ["assessment:read", "assessment:create"])).toBe(true);

            const devUser = { roles: ["Developer"] };
            expect(hasAllPermissions(devUser, ["assessment:read", "assessment:create"])).toBe(false);
        });
    });

    describe("Resource-Level Policies & Fluent Engine", () => {
        const org1 = "org_123";
        const org2 = "org_999";

        const assessmentResource = {
            type: "assessment",
            id: "asm_1",
            orgId: org1,
            ownerId: "user_owner",
            collaborators: ["user_collab_1", "user_collab_2"],
        };

        it("allows Super / Platform Admin unconditionally", async () => {
            const superUser = { id: "user_super", role: "Super" };

            const canRead = await authorization
                .resource(assessmentResource)
                .for(superUser)
                .can("read");

            expect(canRead).toBe(true);

            const canDelete = await authorization
                .resource(assessmentResource)
                .for(superUser)
                .can("delete");

            expect(canDelete).toBe(true);
        });

        it("allows Admin within the same organization", async () => {
            const adminUser = { id: "user_admin", orgId: org1, role: "Admin" };

            const canRead = await authorization
                .resource(assessmentResource)
                .for(adminUser)
                .can("read");

            expect(canRead).toBe(true);
        });

        it("denies Admin from a different organization (cross-tenant isolation)", async () => {
            const crossOrgAdmin = { id: "user_admin_2", orgId: org2, role: "Admin" };

            const canRead = await authorization
                .resource(assessmentResource)
                .for(crossOrgAdmin)
                .can("read");

            expect(canRead).toBe(false);
        });

        it("allows a Member/Developer only if they are an explicit collaborator", async () => {
            const collaborator = { id: "user_collab_1", orgId: org1, role: "Developer" };
            const nonCollaborator = { id: "user_stranger", orgId: org1, role: "Developer" };

            const collabAccess = await authorization
                .resource(assessmentResource)
                .for(collaborator)
                .can("read");

            expect(collabAccess).toBe(true);

            const nonCollabAccess = await authorization
                .resource(assessmentResource)
                .for(nonCollaborator)
                .can("read");

            expect(nonCollabAccess).toBe(false);
        });

        it("require() throws ForbiddenError when access is denied", async () => {
            const nonCollaborator = { id: "user_stranger", orgId: org1, role: "Developer" };

            await expect(
                authorization
                    .resource(assessmentResource)
                    .for(nonCollaborator)
                    .require("update")
            ).rejects.toThrow(ForbiddenError);
        });

        it("require() passes without throwing when access is granted", async () => {
            const collaborator = { id: "user_collab_1", orgId: org1, role: "Developer" };

            const result = await authorization
                .resource(assessmentResource)
                .for(collaborator)
                .require("read");

            expect(result.granted).toBe(true);
        });

        it("require() throws UnauthorizedError when user is missing", async () => {
            await expect(
                authorization
                    .resource(assessmentResource)
                    .for(null)
                    .require("read")
            ).rejects.toThrow(UnauthorizedError);
        });
    });

    describe("Vulnerability Policy Checks", () => {
        const vuln = {
            type: "vulnerability",
            id: "v_101",
            orgId: "org_1",
            assigneeId: "dev_assigned",
        };

        it("allows developer if assigned, denies unassigned developer updates", async () => {
            const assignedDev = { id: "dev_assigned", orgId: "org_1", role: "Developer" };
            const otherDev = { id: "dev_other", orgId: "org_1", role: "Developer" };

            expect(await authorization.resource(vuln).for(assignedDev).can("update")).toBe(true);
            expect(await authorization.resource(vuln).for(otherDev).can("update")).toBe(false);
        });

        it("denies Auditor from updating vulnerability", async () => {
            const auditor = { id: "aud_1", orgId: "org_1", role: "Auditor" };
            expect(await authorization.resource(vuln).for(auditor).can("read")).toBe(true);
            expect(await authorization.resource(vuln).for(auditor).can("update")).toBe(false);
        });
    });

    describe("Custom Policy Registration", () => {
        it("allows registering custom resource policies dynamically", async () => {
            const registry = new PolicyRegistry();
            registry.register("custom_report", {
                read: async ({ user }) => user.role === "Super",
            });

            const engine = new AuthorizationEngine({ policyRegistry: registry });

            expect(await engine.can({ role: "Super" }, "read", { type: "custom_report" })).toBe(true);
            expect(await engine.can({ role: "Developer" }, "read", { type: "custom_report" })).toBe(false);
        });
    });
});
