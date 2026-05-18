import 'dotenv/config';

const hasNewRelicToken = Boolean(process.env.NEW_RELIC_LICENSE_KEY || process.env.SERVER_TOKEN);
const isExplicitlyEnabled = process.env.NEW_RELIC_ENABLED === 'true';

if (hasNewRelicToken && isExplicitlyEnabled) {
    require('newrelic');
}
