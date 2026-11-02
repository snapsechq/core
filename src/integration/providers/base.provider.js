/**
 * Decorator / metadata helper to define a capability on a provider.
 *
 * @param {string} slug - Primary capability method slug (e.g. "repos", "prs", "branches")
 * @param {Object} [meta={}] - Optional metadata (description, aliases, etc.)
 */
export function capability(slug, meta = {}) {
    return function (target, propertyKey, descriptor) {
        if (typeof target === "function") {
            target.capabilitySlug = slug;
            target.capabilityMeta = meta;
            return target;
        }
        const targetClass = typeof target === "function" ? target : target.constructor;
        if (typeof targetClass.registerCapability === "function") {
            targetClass.registerCapability(slug, propertyKey, meta);
        }
        return descriptor;
    };
}

/**
 * BaseProvider
 * Standard foundation for integration providers offering capability registration,
 * alias mapping, capability discovery, and dynamic execution.
 */
export class BaseProvider {
    /**
     * Map of capability slug or alias to capability metadata.
     * @type {Map<string, { slug: string, method: string, aliases: string[], description: string }>}
     */
    static capabilities = new Map();

    /**
     * Registers a capability mapping on the provider class.
     *
     * @param {string} slug - Primary method slug
     * @param {string} methodName - Name of the method on the provider class
     * @param {Object} [meta={}] - Additional metadata (aliases, description)
     */
    static registerCapability(slug, methodName, meta = {}) {
        if (!this.hasOwnProperty("capabilities") || !(this.capabilities instanceof Map)) {
            // Ensure derived class gets its own separate Map instance
            this.capabilities = new Map(this.capabilities ? this.capabilities.entries() : []);
        }

        const normalizedSlug = slug.toLowerCase().trim();
        const aliases = Array.isArray(meta.aliases) ? meta.aliases.map(a => a.toLowerCase().trim()) : [];
        const description = meta.description || `Execute ${slug}`;

        const definition = {
            slug: normalizedSlug,
            method: methodName,
            aliases,
            description,
            ...meta
        };

        // Register primary slug
        this.capabilities.set(normalizedSlug, definition);

        // Register aliases pointing to the same definition
        for (const alias of aliases) {
            this.capabilities.set(alias, definition);
        }

        return definition;
    }

    /**
     * Checks if a capability slug or alias is supported.
     *
     * @param {string} slug
     * @returns {boolean}
     */
    static hasCapability(slug) {
        if (!slug || typeof slug !== "string") return false;
        return this.capabilities.has(slug.toLowerCase().trim());
    }

    /**
     * Resolves capability definition by slug or alias.
     *
     * @param {string} slug
     * @returns {Object|null}
     */
    static resolveCapability(slug) {
        if (!slug || typeof slug !== "string") return null;
        return this.capabilities.get(slug.toLowerCase().trim()) || null;
    }

    /**
     * Returns an array of unique registered capabilities on this provider.
     *
     * @returns {Array<{ slug: string, method: string, aliases: string[], description: string }>}
     */
    static getCapabilities() {
        if (!this.capabilities || !(this.capabilities instanceof Map)) {
            return [];
        }
        const seen = new Set();
        const list = [];
        for (const def of this.capabilities.values()) {
            if (!seen.has(def.slug)) {
                seen.add(def.slug);
                list.push({
                    slug: def.slug,
                    method: def.method,
                    aliases: def.aliases || [],
                    description: def.description || "",
                });
            }
        }
        return list;
    }

    /**
     * Executes a capability by method slug or alias.
     *
     * @param {string} slug - Method slug (e.g. "repos", "prs", "branches")
     * @param {Object} config - Decrypted adapter configuration
     * @param {Object} [params={}] - Parameters passed from query or request body
     * @returns {Promise<any>}
     */
    static async executeCapability(slug, config, params = {}) {
        const capabilityDef = this.resolveCapability(slug);
        if (!capabilityDef) {
            const available = this.getCapabilities().map(c => c.slug).join(", ");
            const providerName = this.providerName || this.name || "Provider";
            throw new Error(`Capability '${slug}' is not supported for ${providerName}. Supported capabilities: ${available}`);
        }

        const methodName = capabilityDef.method;
        if (typeof this[methodName] !== "function") {
            throw new Error(`Method '${methodName}' is not implemented on ${this.name}`);
        }

        return await this[methodName](config, params);
    }
}
