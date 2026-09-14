import { isSuperOrPlatformAdmin, isSameOrganization } from "./base.policy.js";
import { extractUserRoles, Roles } from "../roles.js";

export const AssetPolicy = {
    name: "asset",

    read: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        return { granted: true };
    },

    create: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        const roles = extractUserRoles(user);
        if (roles.includes(Roles.AUDITOR)) {
            return { granted: false, reason: "AUDITOR_CANNOT_CREATE_ASSETS" };
        }

        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER)) {
            return { granted: true };
        }

        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_CREATE_ASSET" };
    },

    update: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);
        if (roles.includes(Roles.AUDITOR)) {
            return { granted: false, reason: "AUDITOR_CANNOT_MODIFY_ASSETS" };
        }

        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER)) {
            return { granted: true };
        }

        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_UPDATE_ASSET" };
    },

    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };

        return { granted: false, reason: "ONLY_ADMIN_CAN_DELETE_ASSETS" };
    },
};
