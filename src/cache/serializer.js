/**
 * Safely serializes values for cache storage.
 * Objects and arrays are converted to JSON strings.
 */
export function serialize(value) {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

/**
 * Safely deserializes values retrieved from cache storage.
 * Parses JSON strings back into objects/arrays/primitives where applicable.
 */
export function deserialize(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}
