import { BaseCrawler, CrawlResult } from '../base.crawler';
import { db } from '../../database/kysely';

export interface RidiDetailCrawlOptions {
  externalId: string;
}

export class RidiCrawler extends BaseCrawler {
  private readonly baseUrl = 'https://ridibooks.com';

  buildUrl(externalId: string): string {
    return `${this.baseUrl}/books/${externalId}`;
  }

  async crawl(options: RidiDetailCrawlOptions): Promise<CrawlResult> {
    const url = this.buildUrl(options.externalId);
    console.log(`Crawling detail: ${url}`);

    const result = await this.fetchPage(url);
    return result;
  }

  async saveToDb(
    externalId: string,
    result: CrawlResult
  ): Promise<number> {
    // Upsert: update if exists, insert if not
    const existing = await db
      .selectFrom('raw_work_pages')
      .select('id')
      .where('platform', '=', 'ridi')
      .where('external_id', '=', externalId)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('raw_work_pages')
        .set({
          html_content: result.html,
          crawled_at: result.crawledAt,
        })
        .where('id', '=', existing.id)
        .execute();

      console.log(`Updated existing page for ${externalId}`);
      return existing.id;
    }

    const page = await db
      .insertInto('raw_work_pages')
      .values({
        platform: 'ridi',
        external_id: externalId,
        url: result.url,
        html_content: result.html,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    console.log(`Saved new page for ${externalId}`);
    return page.id;
  }

  async crawlAndSave(externalId: string): Promise<number> {
    const result = await this.crawl({ externalId });
    return this.saveToDb(externalId, result);
  }
}
