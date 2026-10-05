import { buildApp } from './app';
import { loadConfig } from './config/env';

const config = loadConfig();
const app = buildApp();

app.listen(config.PORT);

// eslint-disable-next-line no-console
console.log(`BookEasy backend listening on :${config.PORT} (${config.NODE_ENV})`);
