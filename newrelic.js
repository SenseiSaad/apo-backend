'use strict';

const enabled = process.env.NEW_RELIC_ENABLED === 'true' &&
    Boolean(process.env.NEW_RELIC_LICENSE_KEY || process.env.SERVER_TOKEN);

exports.config = {
    app_name: [
        process.env.NEW_RELIC_APP_NAME ||
        process.env.SERVER_ID ||
        'Apothecary Backend'
    ],
    license_key: process.env.NEW_RELIC_LICENSE_KEY || process.env.SERVER_TOKEN || '',
    agent_enabled: enabled,
    distributed_tracing: {
        enabled: true
    },
    logging: {
        level: process.env.NEW_RELIC_LOG_LEVEL || 'info'
    },
    allow_all_headers: false,
    attributes: {
        exclude: [
            'request.headers.authorization',
            'request.headers.cookie',
            'request.headers.x-api-key',
            'request.headers.proxyAuthorization',
            'response.headers.setCookie'
        ]
    },
    transaction_tracer: {
        enabled: true,
        record_sql: 'obfuscated'
    },
    error_collector: {
        enabled: true,
        ignore_status_codes: [400, 401, 403, 404, 422]
    },
    application_logging: {
        forwarding: {
            enabled: process.env.NEW_RELIC_LOG_FORWARDING === 'true'
        }
    }
};
