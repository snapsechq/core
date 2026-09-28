/**
 * SnapSec Core (Unified Package)
 * ESM Entrypoint
 */
export * from "./authentication/index.js";
export * from "./authorization/index.js";
export * from "./rabbitmq/index.js";

import createAuth from "./authentication/index.js";
import authorization from "./authorization/index.js";
import mqbroker from "./rabbitmq/index.js";

export { createAuth, authorization, mqbroker };

export default {
    createAuth,
    authorization,
    mqbroker,
};
