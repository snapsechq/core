function extractConfig(config) {
    if (!config) return {};
    if (config?.oracle) {
        config = config.oracle;
    }
    return config;
}

export class OracleProvider {

    static async getCompartments({ tenancyId, userId, keyFingerprint, keyValue, region }) {
        let common, identity;
        try {
            const { createRequire } = await import('node:module');
            const require = createRequire(import.meta.url);
            common = require('oci-common');
            identity = require('oci-identity');
        } catch {
            return [tenancyId];
        }

        let ociRegion = common.Region.US_ASHBURN_1;
        if (region && typeof region === 'string' && region.trim()) {
            try {
                const parsed = common.Region.fromRegionId(region.trim().toLowerCase());
                if (parsed) {
                    ociRegion = parsed;
                }
            } catch (e) {
                console.warn(`[OracleProvider] Error parsing region ID '${region}':`, e.message);
            }
        }

        const normalizedKey = typeof keyValue === 'string' ? keyValue.replace(/\\n/g, '\n') : keyValue;

        const provider = new common.SimpleAuthenticationDetailsProvider(
            tenancyId,
            userId,
            keyFingerprint,
            normalizedKey,
            null,
            ociRegion
        );

        const identityClient = new identity.IdentityClient({ authenticationDetailsProvider: provider });

        // Retrieve all sub-compartments in the tenancy recursively
        const response = await identityClient.listCompartments({
            compartmentId: tenancyId,
            compartmentIdInSubtree: true,
            accessLevel: 'ACCESSIBLE',
            lifecycleState: 'ACTIVE'
        });

        const subCompartments = (response.items || []).map(c => c.id);
        return [tenancyId, ...subCompartments];
    }

    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const tenancyId = config.tenancyId || config.tenancy_id;
        const userId = config.userId || config.user_id;
        const keyFingerprint = config.keyFingerprint || config.key_fingerprint;
        const keyValue = config.keyValue || config.key_value;
        const region = config.region;

        if (!tenancyId || typeof tenancyId !== 'string' || !tenancyId.trim()) {
            throw new Error("Tenancy ID is required for Oracle OCI Adapter");
        }

        if (!userId || typeof userId !== 'string' || !userId.trim()) {
            throw new Error("User ID is required for Oracle OCI Adapter");
        }

        if (!keyFingerprint || typeof keyFingerprint !== 'string' || !keyFingerprint.trim()) {
            throw new Error("Key Fingerprint is required for Oracle OCI Adapter");
        }

        if (!keyValue || typeof keyValue !== 'string' || !keyValue.trim()) {
            throw new Error("Key Value (Private Key) is required for Oracle OCI Adapter");
        }

        try {
            await this.getCompartments({ tenancyId, userId, keyFingerprint, keyValue, region });
            return true;
        } catch (error) {
            throw new Error(`Invalid Oracle OCI Configuration: ${error.message}`);
        }
    }
}
