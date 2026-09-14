import jwt from "jsonwebtoken";
import fs from "fs";
import { getTokenFromRequest } from "./jwt.strategy.js";

/**
 * Creates the intermediary token strategy.
 */
export function createIntermediaryStrategy(config = {}) {
    let cachedPublicKey = config.publicKey || null;

    const getPublicKey = () => {
        if (cachedPublicKey) return cachedPublicKey;
        if (config.publicKeyPath) {
            cachedPublicKey = fs.readFileSync(config.publicKeyPath, "utf8");
            return cachedPublicKey;
        }
        throw new Error("Public key or publicKeyPath must be provided for intermediary token authentication");
    };

    return {
        name: "intermediary",

        execute: async (req, options = {}) => {
            const token = getTokenFromRequest(req);
            if (!token) {
                throw new Error("Authentication token is missing");
            }

            const publicKey = getPublicKey();
            const algorithms = options.algorithms || config.algorithms || ["RS256"];

            const decoded = jwt.verify(token, publicKey, { algorithms });
            if (decoded.type !== "intermediary" || (options.scope && decoded.scope !== options.scope)) {
                throw new Error("Invalid token type for this endpoint");
            }

            return {
                user: decoded,
                authType: "intermediary",
            };
        },
    };
}
