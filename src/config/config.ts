// src/config/config.ts
import { Dialect } from 'sequelize';

require('dotenv').config()

interface EnvConfig {
	username?: string;
	password?: string;
	database: string;
	host: string;
	port?: number;
	dialect: string | Dialect;
}

interface AppConfig {
	development: EnvConfig;
	test: EnvConfig;
	production: EnvConfig;
	[key: string]: EnvConfig;
}

const config: AppConfig  = {
	development: {
		username: process.env.DB_USER_DEV,
		password: process.env.DB_PASSWORD_DEV,
		database: process.env.DB_DATABASE_DEV || 'db_dev',
		host: process.env.DB_HOST_DEV || '127.0.0.1',
		port: process.env.DB_PORT_DEV ? Number(process.env.DB_PORT_DEV) : 3306,
		dialect: process.env.DB_DIALECT_DEV || 'mysql'
	},
	test: {
		username: process.env.DB_USER_TEST,
		password: process.env.DB_PASSWORD_TEST,
		database: process.env.DB_DATABASE_TEST || 'db_test',
		host: process.env.DB_HOST_TEST || '127.0.0.1',
		port: process.env.DB_PORT_TEST ? Number(process.env.DB_PORT_TEST) : 3306,
		dialect: process.env.DB_DIALECT_TEST || 'mysql'
	},
	production: {
		username: process.env.DB_USER_PROD,
		password: process.env.DB_PASSWORD_PROD,
		database: process.env.DB_DATABASE_PROD || 'db_prod',
		host: process.env.DB_HOST_PROD || '127.0.0.1',
		port: process.env.DB_PORT_PROD ? Number(process.env.DB_PORT_PROD) : 3306,
		dialect: process.env.DB_DIALECT_PROD || 'mysql'
	}
}

export default config;