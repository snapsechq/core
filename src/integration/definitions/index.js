import supportedIntegrationsData from "./supported-integrations.json" with { type: "json" };

export const supportedIntegrations = supportedIntegrationsData;

/**
 * Returns categories list.
 *
 * @returns {Array<{ value: string, label: string }>}
 */
export function getCategories() {
    return Array.isArray(supportedIntegrationsData.categories)
        ? [...supportedIntegrationsData.categories]
        : [];
}

/**
 * Filter and fetch supported integrations by category, product, or id.
 *
 * @param {Object} [filter={}]
 * @param {string} [filter.category] - Filter by category (e.g. 'AI', 'cloud-infra', 'code-repo')
 * @param {string} [filter.product] - Filter by product code (e.g. 'AUTO-PT', 'AUTOMATIONS')
 * @param {string} [filter.id] - Lookup specific integration by id (e.g. 'openai', 'aws')
 * @returns {Array<Object>}
 */
export function getSupportedIntegrations(filter = {}) {
    const list = Array.isArray(supportedIntegrationsData.integrations)
        ? supportedIntegrationsData.integrations
        : [];

    if (!filter || Object.keys(filter).length === 0) {
        return [...list];
    }

    let result = list;

    if (filter.id) {
        const idLower = String(filter.id).toLowerCase().trim();
        result = result.filter(item => (item.id || "").toLowerCase() === idLower);
    }

    if (filter.category) {
        const catLower = String(filter.category).toLowerCase().trim();
        result = result.filter(item => {
            if (!item.category) return false;
            const cats = Array.isArray(item.category) ? item.category : [item.category];
            return cats.some(c => String(c).toLowerCase() === catLower);
        });
    }

    if (filter.product) {
        const prodUpper = String(filter.product).toUpperCase().trim();
        result = result.filter(item => {
            if (!item.products) return false;
            const prods = Array.isArray(item.products) ? item.products : [item.products];
            return prods.some(p => String(p).toUpperCase() === prodUpper);
        });
    }

    return result;
}

/**
 * Get definition for a specific integration by ID.
 *
 * @param {string} integrationId
 * @returns {Object|null}
 */
export function getIntegrationDefinition(integrationId) {
    if (!integrationId) return null;
    const idLower = String(integrationId).toLowerCase().trim();
    const list = Array.isArray(supportedIntegrationsData.integrations)
        ? supportedIntegrationsData.integrations
        : [];
    return list.find(item => (item.id || "").toLowerCase() === idLower) || null;
}
