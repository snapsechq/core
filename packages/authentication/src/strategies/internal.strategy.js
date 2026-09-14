/**
 * Creates the internal service-to-service authentication strategy.
 */
export function createInternalStrategy(config = {}) {
    return {
        name: "internal",

        execute: async (req) => {
            const serviceKey = config.serviceKey || process.env.SERVICE_KEY;
            const specialToken = config.specialAccessToken || process.env.SPECIAL_ACCESS_TOKEN || serviceKey;

            const serviceKeyValue = req.headers?.["service-api-key"];
            if (serviceKeyValue) {
                if (!serviceKey || serviceKeyValue !== serviceKey) {
                    throw new Error("Invalid service key");
                }
                return {
                    user: { role: "Super" },
                    authType: "service_key",
                    service_req: true,
                };
            }

            const specialAccessToken = req.headers?.["x-special-access-token"] || req.query?.special_token;
            if (specialAccessToken) {
                if (!specialToken || specialAccessToken !== specialToken) {
                    throw new Error("Invalid special access token");
                }
                return {
                    user: { role: "Super" },
                    authType: "special_token",
                    service_req: true,
                };
            }

            throw new Error("Internal authentication credentials missing");
        },
    };
}
