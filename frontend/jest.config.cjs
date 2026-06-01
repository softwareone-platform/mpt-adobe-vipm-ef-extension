module.exports = {
  preset: 'ts-jest',
  setupFiles: ['<rootDir>/test/jest.setup.cjs'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    '\\.(scss|css)$': '<rootDir>/test/styleMock.cjs',
  },
  transform: {
    // Transpile-only: type-checking is handled by `npm run check` (tsc) project-wide.
    // This avoids ts-jest's per-file type-acquisition failing to find jest globals.
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
};
