/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	transformIgnorePatterns: ['<rootDir>/node_modules/'],
	testMatch: ['**/tests/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
	testTimeout: 15000,
	clearMocks: true,
};
