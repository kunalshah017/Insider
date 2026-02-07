export const IS_DEV = process.env['CLI_CEB_DEV'] === 'true';
export const IS_PROD = !IS_DEV;
export const IS_FIREFOX = process.env['CLI_CEB_FIREFOX'] === 'true';
export const IS_CI = process.env['CEB_CI'] === 'true';

// Insider Extension Configuration
export const CEB_SERVER_URL = process.env['CEB_SERVER_URL'] || 'http://localhost:3001';
export const CEB_CLOB_API_URL = process.env['CEB_CLOB_API_URL'] || 'https://clob.polymarket.com';
export const CEB_GAMMA_API_URL = process.env['CEB_GAMMA_API_URL'] || 'https://gamma-api.polymarket.com';
export const CEB_DATA_API_URL = process.env['CEB_DATA_API_URL'] || 'https://data-api.polymarket.com';
