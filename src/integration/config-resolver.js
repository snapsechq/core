export class ConfigResolver {
    static create(ProviderClass, options = {}) {
        const { integration } = options;
        return new Proxy(ProviderClass, {
            get(target, property, receiver) {
                if (property === "then" || typeof property === "symbol") {
                    return undefined;
                }

                const utilityMethods = [
                    "hasCapability",
                    "getCapabilities",
                    "resolveCapability",
                    "registerCapability",
                    "isProviderAvailable",
                ];
                if (utilityMethods.includes(property) && typeof target[property] === "function") {
                    return target[property].bind(target);
                }

                let method = target[property] ?? target.prototype?.[property];

                if (!method && typeof target.resolveCapability === "function" && typeof property === "string") {
                    const cap =
                        target.resolveCapability(property) ||
                        target.resolveCapability(property.replace(/^get/, ""));
                    if (cap?.method && typeof target[cap.method] === "function") {
                        method = target[cap.method];
                    }
                }

                if (typeof method !== "function") {
                    return method;
                }

                return async (options = {}, ...rest) => {
                    let opts = options;
                    if (
                        typeof options === "string" ||
                        options?._bsontype === "ObjectId" ||
                        (typeof options === "object" &&
                            options !== null &&
                            options.constructor?.name === "ObjectId")
                    ) {
                        opts = { instanceId: options.toString() };
                    } else if (!options || typeof options !== "object") {
                        opts = {};
                    }

                    let config = opts.config;

                    if (!config && opts.instanceId) {
                        const instance =
                            await integration.getIntegration({
                                id: opts.instanceId,
                            });

                        if (!instance) {
                            throw new Error(
                                `Integration not found: ${opts.instanceId}`
                            );
                        }

                        config = instance.config;
                    }

                    return method.call(
                        target,
                        {
                            ...opts,
                            config,
                        },
                        opts,
                        ...rest
                    );
                };
            },
        });
    }
}
