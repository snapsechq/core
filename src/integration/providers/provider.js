import { GcpProvider } from "./gcp-provider/gcp.provider.js";
import { AwsProvider } from "./aws-provider/aws.provider.js";
import { AzureProvider } from "./azure-provider/azure.provider.js";
import { OracleProvider } from "./oracle-provider/oracle.provider.js";

const ProviderRegistry = {
    "gcp": GcpProvider,
    "aws": AwsProvider,
    "azure": AzureProvider,
    "oracle": OracleProvider,
};

export class Provider {

    static isProviderAvailable(integrationId) {
        if (!integrationId || typeof integrationId !== "string") {
            return false;
        }

        const providers = Object.keys(ProviderRegistry);
        return providers.includes(integrationId.toLowerCase());
    }

    static getProvider({ integrationId }) {
        if (!this.isProviderAvailable(integrationId)) {
            throw new Error(`${integrationId} is not supported.`);
        }

        return ProviderRegistry[integrationId.toLowerCase()];
    }

    static async verifyIntegrationConfig(integrationIdOrParams, maybeConfig) {
        let integrationId;
        let config;
        if (typeof integrationIdOrParams === "object" && integrationIdOrParams !== null) {
            integrationId = integrationIdOrParams.integrationId;
            config = integrationIdOrParams.config || integrationIdOrParams;
        } else {
            integrationId = integrationIdOrParams;
            config = maybeConfig;
        }
        const provider = this.getProvider({ integrationId });
        return await provider.verifyIntegrationConfig(config);
    }

}

export { ProviderRegistry, GcpProvider, AwsProvider, AzureProvider, OracleProvider };
