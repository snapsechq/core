/**
 * SnapSec Core (Unified Package)
 * ESM Entrypoint
 */
export * from "./authentication/index.js";
export * from "./authorization/index.js";
export * from "./rabbitmq/index.js";
export * from "./integration/index.js";

import createAuth from "./authentication/index.js";
import authorization from "./authorization/index.js";
import mqbroker from "./rabbitmq/index.js";
import { Integration, Provider } from "./integration/index.js";

function snapsecCore(...args) {
    return createAuth(...args);
}

Object.assign(snapsecCore, {
    createAuth,
    authorization,
    mqbroker,
    Integration,
    Provider,
});

export { createAuth, authorization, mqbroker, Integration, Provider };
export default snapsecCore;
