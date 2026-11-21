import { loadDotenv } from '../../src/config/dotenv.js'
import { sameDatabase } from '../../src/config/sameDatabase.js'
import { describeDb, migrateUp } from '../../scripts/migrate.js'

// Part A "Tooling": tests run against TEST_DATABASE_URL only, never the dev DB, and migrations run before the suite.
export default async function setup() {
  loadDotenv()
  const { DATABASE_URL, TEST_DATABASE_URL } = process.env
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set. Tests only run against the test database (see .env.example).')
  }
  if (DATABASE_URL && sameDatabase(TEST_DATABASE_URL, DATABASE_URL)) {
    throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL. Refusing to run tests.')
  }
  try {
    await migrateUp(TEST_DATABASE_URL, { log: () => {} })
  } catch (err) {
    throw new Error(
      `Could not migrate the test database ${describeDb(TEST_DATABASE_URL)}: ${err.message}. ` +
        'Is it running? Try: docker compose up -d --wait db',
      { cause: err },
    )
  }
}
