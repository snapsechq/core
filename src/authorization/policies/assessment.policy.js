import { isSuperOrPlatformAdmin, isSameOrganization, isCollaborator, isOwner } from "./base.policy.js";
import { extractUserRoles, Roles } from "../roles.js";

export const AssessmentPolicy = {
    name: "assessment",

    /**
     * Evaluates if user can read the assessment.
     */
    read: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);

        // Admins, Managers, and Auditors have read access across their organization
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER) || roles.includes(Roles.AUDITOR)) {
            return { granted: true };
        }

        // Members / Developers / Auditors can read if they are owner or explicit collaborator
        if (isOwner(user, resource) || isCollaborator(user, resource)) {
            return { granted: true };
        }

        return { granted: false, reason: "NOT_AN_ASSESSMENT_COLLABORATOR" };
    },

    /**
     * Evaluates if user can create an assessment.
     */
    create: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN) || roles.includes(Roles.MANAGER)) {
            return { granted: true };
        }

        return { granted: false, reason: "INSUFFICIENT_ROLE_TO_CREATE_ASSESSMENT" };
    },

    /**
     * Evaluates if user can update the assessment.
     */
    update: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);

        if (roles.includes(Roles.ADMIN)) return { granted: true };

        if (roles.includes(Roles.MANAGER) && (isOwner(user, resource) || isCollaborator(user, resource))) {
            return { granted: true };
        }

        if (roles.includes(Roles.DEVELOPER) && (isOwner(user, resource) || isCollaborator(user, resource))) {
            return { granted: true };
        }

        return { granted: false, reason: "ASSESSMENT_UPDATE_REQUIRES_COLLABORATOR_OR_ADMIN" };
    },

    /**
     * Evaluates if user can delete the assessment.
     */
    delete: async ({ user, resource }) => {
        if (isSuperOrPlatformAdmin(user)) return { granted: true };

        if (!isSameOrganization(user, resource)) {
            return { granted: false, reason: "CROSS_ORGANIZATION_ACCESS_DENIED" };
        }

        const roles = extractUserRoles(user);
        if (roles.includes(Roles.ADMIN)) return { granted: true };

        return { granted: false, reason: "ONLY_ADMIN_CAN_DELETE_ASSESSMENT" };
    },

    /**
     * Evaluates if user can export the assessment.
     */
    export: async ({ user, resource }) => {
        // Delegates to read access
        return AssessmentPolicy.read({ user, resource });
    },
};
