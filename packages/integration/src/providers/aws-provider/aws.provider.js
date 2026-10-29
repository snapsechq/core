function extractConfig(config) {
    if (!config) return {};
    if (config?.aws) {
        config = config.aws;
    }
    return config;
}


export class AwsProvider {

    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const accessKeyId = config.accessKeyId || config.access_key || config.accessKey;
        const secretAccessKey = config.secretAccessKey || config.secret_access_key || config.secretKey;

        if (!accessKeyId || typeof accessKeyId !== 'string' || !accessKeyId.trim()) {
            throw new Error("Access Key ID is required for AWS Adapter");
        }

        if (!secretAccessKey || typeof secretAccessKey !== 'string' || !secretAccessKey.trim()) {
            throw new Error("Secret Access Key is required for AWS Adapter");
        }

        return true;
    }

}
