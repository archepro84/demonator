import 'dotenv/config';
import { Kysely, Migrator, PostgresDialect, FileMigrationProvider } from 'kysely';
import pg from 'pg';
import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  });

  const command = process.argv[2];

  const { error, results } =
    command === 'down'
      ? await migrator.migrateDown()
      : await migrator.migrateToLatest();

  results?.forEach((result) => {
    const direction = command === 'down' ? 'Rolled back' : 'Executed';
    if (result.status === 'Success') {
      console.log(`${direction} "${result.migrationName}" successfully`);
    } else if (result.status === 'Error') {
      console.error(`${direction} "${result.migrationName}" failed`);
    } else if (result.status === 'NotExecuted') {
      console.log(`"${result.migrationName}" was not executed`);
    }
  });

  if (error) {
    console.error('Migration failed');
    console.error(error);
    process.exit(1);
  }

  await db.destroy();
  console.log(command === 'down' ? 'Rollback completed' : 'Migration completed');
}

migrate();
