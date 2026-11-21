import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // Runs once: refuses to touch anything but TEST_DATABASE_URL, then applies migrations to it.
    globalSetup: ['tests/setup/globalSetup.js'],
    setupFiles: ['tests/setup/perFile.js'],
    // One real database shared by all files, so files run one at a time; each test truncates what it touched.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Test-only values. They win over the repo-root .env because dotenv never overrides variables already set.
    // NODE_ENV=test makes src/config/env.js use TEST_DATABASE_URL (and refuse to run if it equals DATABASE_URL).
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'vitest-only-signing-key-0123456789-abcdefghijklmnopqrstuvwxyz',
      LOG_LEVEL: 'silent',
    },
  },
})
