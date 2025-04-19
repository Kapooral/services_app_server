// config/config-cli.js
require('dotenv').config();
require('ts-node/register');
const tsConfig = require('./config.ts');

module.exports = tsConfig.default || tsConfig;