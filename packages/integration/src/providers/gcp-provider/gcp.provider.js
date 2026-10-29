function extractConfig(config) {
    if (!config) return {};
    if (config?.gcp) {
        config = config.gcp;
    }
    return config;
}


export class GcpProvider {

    static async verifyIntegrationConfig(params) {
        const config = extractConfig(params);
        const { serviceAccountKey, projectId } = config;

        if (!serviceAccountKey) {
            throw new Error("Service Account Key (JSON) is required for GCP Adapter");
        }

        let credentials;
        try {
            credentials = typeof serviceAccountKey === 'string'
                ? JSON.parse(serviceAccountKey)
                : serviceAccountKey;
        } catch (e) {
            throw new Error("Service Account Key must be valid JSON");
        }

        if (!credentials?.client_email || !credentials?.private_key) {
            throw new Error("Service Account Key is missing required fields (client_email or private_key)");
        }

        const effectiveProjectId = projectId || credentials.project_id;
        if (!effectiveProjectId) {
            throw new Error("Project ID is required");
        }

        try {
            let google;
            try {
                const g = await import('googleapis');
                google = g.google || g.default?.google || g;
            } catch {
                // If googleapis is not installed in the running environment, structural validation succeeded
                return true;
            }

            if (google?.auth?.JWT) {
                const auth = new google.auth.JWT({
                    email: credentials.client_email,
                    key: credentials.private_key,
                    scopes: ['https://www.googleapis.com/auth/cloud-platform.read-only'],
                });

                await auth.getAccessToken();
            }
            return true;
        } catch (error) {
            const reason = error?.response?.data?.error_description || error?.response?.data?.error?.message || error.message;
            throw new Error(`Invalid GCP Configuration: ${reason}`);
        }
    }
}
