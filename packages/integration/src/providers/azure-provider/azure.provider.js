function extractConfig(config) {
    if (!config) return {};
    if (config?.azure) {
        config = config.azure;
    }
    return config;
}

export class AzureProvider {

    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const applicationId = config.ApplicationID || config.applicationId || config.application_id;
        const keyValue = config.KeyValue || config.keyValue || config.key_value;
        const directoryId = config.DirectoryID || config.directoryId || config.directory_id;
        const subscriptionId = config.SubscriptionID || config.subscriptionId || config.subscription_id;

        if (!applicationId || typeof applicationId !== 'string' || !applicationId.trim()) {
            throw new Error("Application ID is required for Azure Adapter");
        }

        if (!keyValue || typeof keyValue !== 'string' || !keyValue.trim()) {
            throw new Error("Key Value (Client Secret) is required for Azure Adapter");
        }

        if (!directoryId || typeof directoryId !== 'string' || !directoryId.trim()) {
            throw new Error("Directory ID is required for Azure Adapter");
        }

        if (!subscriptionId || typeof subscriptionId !== 'string' || !subscriptionId.trim()) {
            throw new Error("Subscription ID is required for Azure Adapter");
        }

        return true;
    }
}
