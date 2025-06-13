// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import promise from 'eslint-plugin-promise';
import jest from 'eslint-plugin-jest';

export default [
	js.configs.recommended,
	...tseslint.configs.recommended, // TypeScript rules
	{
		plugins: {
			promise,
			jest,
		},
		rules: {
			'promise/always-return': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	prettier,
	{
		languageOptions: {
			parser: tseslint.parser,
			ecmaVersion: 2020,
			sourceType: 'module',
		},
		linterOptions: {
			reportUnusedDisableDirectives: true,
		},
		settings: {},
	},
];
