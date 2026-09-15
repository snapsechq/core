/**
 * Builds an AMQP connection URL from discrete parameters or environment variables.
 *
 * @param {Object|string} [config]
 * @param {string} [config.url] - Direct URL override (e.g. amqp://user:pass@host:5672)
 * @param {string} [config.user] - RabbitMQ username
 * @param {string} [config.pass] - RabbitMQ password
 * @param {string} [config.host] - RabbitMQ host
 * @param {string|number} [config.port] - RabbitMQ port
 * @param {string} [config.vhost] - Virtual host (optional)
 * @param {string} [config.protocol] - Protocol ("amqp" or "amqps")
 * @returns {string} Fully formed AMQP connection URL
 */
export function buildRabbitmqUrl(config = {}) {
    if (typeof config === "string") {
        return config;
    }

    if (config.url) {
        return config.url;
    }

    if (process.env.RABBITMQ_URL) {
        return process.env.RABBITMQ_URL;
    }

    const protocol = config.protocol || process.env.RABBITMQ_PROTOCOL || "amqp";
    const user = config.user ?? (process.env.RABBITMQ_USER || "guest");
    const pass = config.pass ?? (process.env.RABBITMQ_PASS || "guest");
    const host = config.host || process.env.RABBITMQ_HOST || "localhost";
    const port = config.port || process.env.RABBITMQ_PORT || 5672;
    const vhost = config.vhost || process.env.RABBITMQ_VHOST || "";

    const userAuth = user ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : "";
    const cleanVhost = vhost ? (vhost.startsWith("/") ? vhost : `/${vhost}`) : "";

    return `${protocol}://${userAuth}${host}:${port}${cleanVhost}`;
}
