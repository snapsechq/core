import { extractUserRoles, Roles } from "../roles.js";

/**
 * Checks if user is Platform Admin or Super.
 * @param {Object} user
 * @returns {boolean}
 */
export function isSuperOrPlatformAdmin(user) {
    const roles = extractUserRoles(user);
    return roles.includes(Roles.SUPER) || roles.includes(Roles.PLATFORM_ADMIN);
}

/**
 * Checks if user belongs to the same organization as the resource.
 * @param {Object} user
 * @param {Object} resource
 * @returns {boolean}
 */
export function isSameOrganization(user, resource) {
    if (!user || !resource) return false;
    const userOrgId = user.orgId || user.organizationId || user.organization;
    const resourceOrgId = resource.orgId || resource.organizationId || resource.organization;

    if (!userOrgId || !resourceOrgId) return false;
    return String(userOrgId) === String(resourceOrgId);
}

/**
 * Checks if user is a collaborator on the resource.
 * @param {Object} user
 * @param {Object} resource
 * @returns {boolean}
 */
export function isCollaborator(user, resource) {
  if (!user || !resource) return false;
  const userId = user.id || user._id || user.userId;
  const userEmail = user.email ? String(user.email).toLowerCase() : null;

  const collaborators = Array.isArray(resource.collaborators)
    ? resource.collaborators
    : Array.isArray(resource.collaboratorIds)
    ? resource.collaboratorIds
    : [];

  return collaborators.some((collab) => {
    if (!collab) return false;
    if (typeof collab === "string" || typeof collab === "number") {
      return userId && String(collab) === String(userId);
    }
    const collabId = collab.userId || collab.id || collab._id;
    const collabEmail = collab.email ? String(collab.email).toLowerCase() : null;

    if (userId && collabId && String(collabId) === String(userId)) {
      return true;
    }
    if (userEmail && collabEmail && collabEmail === userEmail) {
      return true;
    }
    return false;
  });
}

/**
 * Checks if user is the owner of the resource.
 * @param {Object} user
 * @param {Object} resource
 * @returns {boolean}
 */
export function isOwner(user, resource) {
    if (!user || !resource) return false;
    const userId = user.id || user._id || user.userId;
    const ownerId = resource.ownerId || resource.owner || resource.createdBy || resource.author;

    if (!userId || !ownerId) return false;
    return String(userId) === String(ownerId);
}
