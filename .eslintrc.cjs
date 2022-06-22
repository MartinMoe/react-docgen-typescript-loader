module.exports = {
	root: true,
	env: {
		es6: true,
		browser: true,
		jest: true,
	},
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint', 'prettier'],
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
	ignorePatterns: ['./dist/*'],
	rules: {
		'import/no-unresolved': 0,
		'no-undef': 'error',
		'@typescript-eslint/prefer-interface': 0,
		'@typescript-eslint/explicit-function-return-type': 0,
		'@typescript-eslint/explicit-member-accessibility': 0,
		'@typescript-eslint/no-explicit-any': 'error',
		'@typescript-eslint/no-unused-vars': 'error',
		'@typescript-eslint/no-use-before-define': 0,
		'@typescript-eslint/no-var-requires': 0,
		'@typescript-eslint/explicit-module-boundary-types': 0,
		'@typescript-eslint/no-empty-function': 0,
	},
	parserOptions: {
		tsconfigRootDir: './',
		project: './tsconfig.json',
	},
}
