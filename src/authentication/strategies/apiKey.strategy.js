import axios from "axios";

/**
 * Creates the API Key strategy with injected configuration.
 */
export function createApiKeyStrategy(config = {}) {
    return {
        name: "api_key",

        execute: async (req) => {
            const apiKey = req.headers?.["x-api-key"];
            if (!apiKey) {
                throw new Error("API key is missing");
            }

            const authServiceUrl = config.authServiceUrl || process.env.AUTH_SERVICE_URL;
            if (!authServiceUrl) {
                throw new Error("authServiceUrl is required for API key authentication");
            }

            const response = await axios.get(`${authServiceUrl}/api/org/apikey/validate`, {
                headers: { "x-api-key": apiKey },
                timeout: config.timeout || 5000,
            });

            const isAuth = response.data?.data?.success;
            if (!isAuth) {
                throw new Error("Invalid API key");
            }

            const data = response.data.data;
            return {
                user: data.user,
                authType: data.type === "org" ? "org_api_key" : "user_api_key",
            };
        },
    };
}
