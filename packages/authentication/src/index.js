export * from "./strategies/jwt.strategy.js";
export * from "./strategies/apiKey.strategy.js";
export * from "./strategies/internal.strategy.js";
export * from "./strategies/intermediary.strategy.js";
export * from "./middleware.js";

import { createAuth } from "./middleware.js";
export default createAuth;
