import { isSuperOrPlatformAdmin, isSameOrganization, isOwner } from "./base.policy.js";
import { extractUserRoles, Roles } from "../roles.js";

export const ApiKeyPolicy = {
    name: "api_key",

    /**
     * Evaluates if user can delete the API key.
     * Admins can delete any API key in the organization.
     * Managers and Developers can only delete API keys they created.
     */
    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);

        // Admins can delete any API key in their organization
        if (roles.includes(Roles.ADMIN)) {
            return { granted: true };
        }

        // Managers and Developers can delete if they created the key
        if (roles.includes(Roles.MANAGER) || roles.includes(Roles.DEVELOPER)) {
            if (isOwner(user, resource)) {
                return { granted: true };
            }
            return { granted: false, reason: "CAN_ONLY_DELETE_OWN_API_KEYS" };
        }

        return { granted: false, reason: "INSUFFICIENT_ROLE_FOR_API_KEY_DELETE" };
    },
};
