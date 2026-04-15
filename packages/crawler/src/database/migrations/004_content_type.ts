import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('raw_list_items')
    .addColumn('content_type', 'varchar(20)', (col) => col.defaultTo('ebook').notNull())
    .execute();

  await db.schema
    .alterTable('raw_work_parse_results')
    .addColumn('content_type', 'varchar(20)')
    .execute();

  await db.schema
    .alterTable('raw_work_pages')
    .dropColumn('html_content')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('raw_work_pages')
    .addColumn('html_content', 'text', (col) => col.notNull().defaultTo(''))
    .execute();

  await db.schema
    .alterTable('raw_work_parse_results')
    .dropColumn('content_type')
    .execute();

  await db.schema
    .alterTable('raw_list_items')
    .dropColumn('content_type')
    .execute();
}
