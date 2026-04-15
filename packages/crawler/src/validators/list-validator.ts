import { db } from '../database/kysely';

export interface ValidationResult {
  newIds: string[];
  existingIds: string[];
  totalChecked: number;
}

export class ListValidator {
  async findNewWorks(platform: string): Promise<ValidationResult> {
    // Get all external IDs from list items
    const listItems = await db
      .selectFrom('raw_list_items')
      .select('external_id')
      .where('platform', '=', platform)
      .distinct()
      .execute();

    const allIds = listItems.map((item) => item.external_id);

    if (allIds.length === 0) {
      return { newIds: [], existingIds: [], totalChecked: 0 };
    }

    // Check which ones already have detail pages
    const existingPages = await db
      .selectFrom('raw_work_pages')
      .select('external_id')
      .where('platform', '=', platform)
      .where('external_id', 'in', allIds)
      .execute();

    const existingSet = new Set(existingPages.map((p) => p.external_id));

    const newIds = allIds.filter((id) => !existingSet.has(id));
    const existingIds = allIds.filter((id) => existingSet.has(id));

    return {
      newIds,
      existingIds,
      totalChecked: allIds.length,
    };
  }

  async findWorksWithMissingImages(platform: string): Promise<string[]> {
    const results = await db
      .selectFrom('raw_work_parse_results')
      .innerJoin('raw_work_pages', 'raw_work_pages.id', 'raw_work_parse_results.raw_page_id')
      .select('raw_work_parse_results.external_id')
      .where('raw_work_pages.platform', '=', platform)
      .where((eb) =>
        eb.or([
          eb('raw_work_parse_results.cover_image_url', 'is', null),
          eb('raw_work_parse_results.introduction_images', 'is', null),
        ]),
      )
      .execute();

    return results.map((r) => r.external_id);
  }

  async findUnparsedWorks(platform: string): Promise<string[]> {
    // Find work pages that don't have parse results
    const unparsed = await db
      .selectFrom('raw_work_pages')
      .leftJoin(
        'raw_work_parse_results',
        'raw_work_parse_results.raw_page_id',
        'raw_work_pages.id'
      )
      .select('raw_work_pages.external_id')
      .where('raw_work_pages.platform', '=', platform)
      .where('raw_work_parse_results.id', 'is', null)
      .execute();

    return unparsed.map((p) => p.external_id);
  }

  async getStats(platform: string): Promise<{
    totalListItems: number;
    totalWorkPages: number;
    totalParsed: number;
    totalUnparsed: number;
  }> {
    const [listItems, workPages, parsed] = await Promise.all([
      db
        .selectFrom('raw_list_items')
        .where('platform', '=', platform)
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst(),
      db
        .selectFrom('raw_work_pages')
        .where('platform', '=', platform)
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst(),
      db
        .selectFrom('raw_work_parse_results')
        .innerJoin('raw_work_pages', 'raw_work_pages.id', 'raw_work_parse_results.raw_page_id')
        .where('raw_work_pages.platform', '=', platform)
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst(),
    ]);

    const totalListItems = Number(listItems?.count ?? 0);
    const totalWorkPages = Number(workPages?.count ?? 0);
    const totalParsed = Number(parsed?.count ?? 0);

    return {
      totalListItems,
      totalWorkPages,
      totalParsed,
      totalUnparsed: totalWorkPages - totalParsed,
    };
  }
}
