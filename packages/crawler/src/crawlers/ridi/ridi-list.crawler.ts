import { BaseCrawler, CrawlResult } from '../base.crawler';
import { sql } from 'kysely';
import { db } from '../../database/kysely';

export const RidiGenre = {
  FANTASY: 'fantasy',
  ROMANCE_FANTASY: 'romance_fantasy',
  ROMANCE: 'romance',
  BL: 'bl-novel',
} as const;

export type RidiGenre = (typeof RidiGenre)[keyof typeof RidiGenre];

export const RidiOrder = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  STEADY: 'steady',
} as const;

export type RidiOrder = (typeof RidiOrder)[keyof typeof RidiOrder];

export interface RidiListCrawlOptions {
  genre: RidiGenre;
  page: number;
  order?: RidiOrder;
  adultExclude?: boolean;
}

export interface ListItem {
  externalId: string;
  title?: string;
  author?: string;
}

export class RidiListCrawler extends BaseCrawler {
  private readonly baseUrl = 'https://ridibooks.com';

  buildUrl(options: RidiListCrawlOptions): string {
    const { genre, page, order = RidiOrder.STEADY, adultExclude = false } = options;
    const params = new URLSearchParams({
      order,
      adult_exclude: adultExclude ? 'y' : 'n',
      page: String(page),
    });
    return `${this.baseUrl}/bestsellers/${genre}?${params.toString()}`;
  }

  async crawl(options: RidiListCrawlOptions): Promise<CrawlResult> {
    const url = this.buildUrl(options);
    console.log(`Crawling list: ${url}`);

    const result = await this.fetchPage(url);
    return result;
  }

  parseListItems(html: string): ListItem[] {
    const nextDataItems = this.parseFromNextData(html);
    if (nextDataItems.length > 0) return nextDataItems;

    return this.parseFromHref(html);
  }

  private parseFromNextData(html: string): ListItem[] {
    const scriptMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/
    );
    if (!scriptMatch) return [];

    try {
      const data = JSON.parse(scriptMatch[1]);
      const queries =
        data?.props?.pageProps?.dehydratedState?.queries ?? [];
      const bsQuery = queries.find(
        (q: Record<string, unknown>) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === 'BestSellers'
      );
      const bsItems: Array<{
        book: {
          id: string;
          title?: { main?: string };
          authors?: Array<{ name?: string; role?: string }>;
        };
      }> = bsQuery?.state?.data?.bestsellers?.items ?? [];

      return bsItems.map((item) => {
        const mainTitle = item.book.title?.main
          ?.replace(/^개정판\s*\|\s*/, '')
          .replace(/\s*세트\s*\(전\s*\d+권\)\s*$/, '')
          .replace(/\s*\([^)]*(?:삽화본|증보판|개정판|완전판|합본)[^)]*\)/g, '')
          .replace(/\s+(?:Part\s+\d+\s*:\s*)?(?:\d+부\s+)?\d+[권화]?\s*$/, '')
          .trim();
        const authorEntry = item.book.authors?.find(
          (a) => a.role === 'AUTHOR'
        );
        return {
          externalId: String(item.book.id),
          title: mainTitle,
          author: authorEntry?.name,
        };
      });
    } catch {
      return [];
    }
  }

  private parseFromHref(html: string): ListItem[] {
    const items: ListItem[] = [];
    const regex = /href="\/books\/(\d+)[^"]*"/g;
    let match;
    const seen = new Set<string>();

    while ((match = regex.exec(html)) !== null) {
      const externalId = match[1];
      if (!seen.has(externalId)) {
        seen.add(externalId);
        items.push({ externalId });
      }
    }

    return items;
  }

  async saveToDb(
    options: RidiListCrawlOptions,
    items: ListItem[]
  ): Promise<void> {
    if (items.length === 0) {
      console.log(`No items to save for page ${options.page}`);
      return;
    }

    await db
      .insertInto('raw_list_items')
      .values(
        items.map((item) => ({
          platform: 'ridi' as const,
          list_type: 'bestseller' as const,
          external_id: item.externalId,
          title: item.title ?? null,
          author: item.author ?? null,
        }))
      )
      .onConflict((oc) =>
        oc.columns(['platform', 'external_id']).doUpdateSet((eb) => ({
          list_type: 'bestseller',
          title: eb.ref('excluded.title'),
          author: eb.ref('excluded.author'),
          crawled_at: sql`NOW()`,
        }))
      )
      .execute();

    console.log(`Saved ${items.length} items from page ${options.page}`);
  }
}
