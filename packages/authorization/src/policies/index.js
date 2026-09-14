import { AssessmentPolicy } from "./assessment.policy.js";
import { VulnerabilityPolicy } from "./vulnerability.policy.js";
import { AssetPolicy } from "./asset.policy.js";

/**
 * Policy Registry for mapping resource types to policy handlers.
 */
export class PolicyRegistry {
    constructor() {
        this.policies = new Map();
        this.register("assessment", AssessmentPolicy);
        this.register("vulnerability", VulnerabilityPolicy);
        this.register("asset", AssetPolicy);
    }

    /**
     * Registers a policy handler for a given resource type.
     * @param {string} resourceType
     * @param {Object} policy
     */
    register(resourceType, policy) {
        if (!resourceType || !policy) {
            throw new Error("resourceType and policy are required");
        }
        this.policies.set(resourceType.toLowerCase(), policy);
    }

    /**
     * Retrieves a policy handler for a given resource type.
     * @param {string} resourceType
     * @returns {Object|null}
     */
    get(resourceType) {
        if (!resourceType) return null;
        return this.policies.get(resourceType.toLowerCase()) || null;
    }

    /**
     * Checks if a policy handler exists for a resource type.
     * @param {string} resourceType
     * @returns {boolean}
     */
    has(resourceType) {
        if (!resourceType) return false;
        return this.policies.has(resourceType.toLowerCase());
    }
}

export const defaultPolicyRegistry = new PolicyRegistry();

export {
    AssessmentPolicy,
    VulnerabilityPolicy,
    AssetPolicy,
};
