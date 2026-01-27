module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  testTimeout: 15000, // 15 segundos de timeout global
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@exodus/bytes|html-encoding-sniffer|jsdom|isomorphic-dompurify|parse5|@aws-sdk)/)',
  ],
  moduleNameMapper: {
    '^@exodus/bytes$': '<rootDir>/../node_modules/@exodus/bytes/dist/index.js',
  },
};