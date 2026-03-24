const config = {
  printWidth: 120,
  trailingComma: 'es5',
  tabWidth: 2,
  semi: false,
  singleQuote: true,
  arrowParens: 'avoid',
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '^react$',
    '^react/.*$',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@/engine/.*$',
    '^@/hooks/.*$',
    '^@/components/.*$',
    '^@/styles/.*$',
    '<TYPES>',
  ],
  importOrderTypeScriptVersion: '5.0.0',
  importOrderCaseSensitive: false,
}
export default config
