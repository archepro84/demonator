import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('raw_list_items')
    .addColumn('content_type', 'varchar(20)', (col) => col.defaultTo('ebook').notNull())
    .execute();

  await db.schema
    .alterTable('raw_work_parse_results')
    .addColumn('content_type', 'varchar(20)')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('raw_work_parse_results')
    .dropColumn('content_type')
    .execute();

  await db.schema
    .alterTable('raw_list_items')
    .dropColumn('content_type')
    .execute();
}
