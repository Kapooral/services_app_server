import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import configFile from './config';
dotenv.config();


const env = process.env.NODE_ENV || 'development';
const config: any = configFile[env];

const sequelize = new Sequelize(
    config.database,
    config.username,
    config.password,
    {
        host: config.host,
        port: config.port ? Number(config.port) : undefined,
        dialect: config.dialect,
        logging: false,
    }
);

export default sequelize;
