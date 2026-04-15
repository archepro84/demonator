#!/usr/bin/env node
import 'dotenv/config';
import { createInterface } from 'node:readline';
import { readFile, mkdir, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { chromium } from 'playwright';
import { RidiGenre, RidiOrder, RidiContentType, RidiListCrawler, type ListItem } from './crawlers/ridi/ridi-list.crawler';
import { RidiCrawler } from './crawlers/ridi/ridi.crawler';
import { RidiParser } from './crawlers/ridi/ridi.parser';
import { ListValidator } from './validators/list-validator';
import { Publisher } from './refiners/publisher';
import { EnrichmentImportSchema } from './schemas/enrichment.schema';
import { sql } from 'kysely';
import { closeDb, db } from './database/kysely';

const DEFAULT_AUTH_PATH = resolve(import.meta.dirname ?? '.', '../.auth/ridi-storage.json');

async function resolveAuthPath(authOption?: string): Promise<string | undefined> {
  if (authOption) return resolve(authOption);
  try {
    await access(DEFAULT_AUTH_PATH);
    return DEFAULT_AUTH_PATH;
  } catch {
    return undefined;
  }
}

const program = new Command();

program
  .name('demonator-crawler')
  .description('Ridi crawler for demonator')
  .version('1.0.0');

program
  .command('auth:login')
  .description('Open browser to log in to Ridi and save session for adult content access')
  .option('-o, --output <path>', 'Output path for storage state', DEFAULT_AUTH_PATH)
  .action(async (options) => {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://ridibooks.com/account/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    console.log('\n브라우저가 열렸습니다.');
    console.log('1. Ridi 계정으로 로그인하세요.');
    console.log('2. 성인인증이 필요하면 완료하세요.');
    console.log('3. 완료 후 이 터미널에서 Enter를 누르세요.\n');

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((r) => rl.question('', () => { rl.close(); r(); }));

    await context.storageState({ path: outputPath });
    await browser.close();

    console.log(`세션이 저장되었습니다: ${outputPath}`);
  });

program
  .command('crawl:list')
  .description('Crawl bestseller list pages')
  .requiredOption(
    '-g, --genre <genre>',
    `Genre code (all, ${Object.values(RidiGenre).join(', ')})`
  )
  .option(
    '-o, --order <order>',
    `Order (${Object.values(RidiOrder).join(', ')})`,
    RidiOrder.STEADY
  )
  .option('-p, --page <page>', 'Page number', '1')
  .option('--pages <count>', 'Number of pages to crawl', '1')
  .option('-l, --limit <count>', 'Limit total items per genre (max 60 per page)')
  .option(
    '-t, --type <type>',
    `Content type (${Object.values(RidiContentType).join(', ')}, all)`,
    RidiContentType.EBOOK
  )
  .action(async (options) => {
    const allGenres = Object.values(RidiGenre) as string[];
    const validGenres = ['all', ...allGenres];
    if (!validGenres.includes(options.genre)) {
      console.error(`Invalid genre: ${options.genre}`);
      console.error(`Valid genres: ${validGenres.join(', ')}`);
      process.exit(1);
    }
    const validOrders = Object.values(RidiOrder) as string[];
    if (!validOrders.includes(options.order)) {
      console.error(`Invalid order: ${options.order}`);
      console.error(`Valid orders: ${validOrders.join(', ')}`);
      process.exit(1);
    }
    const allContentTypes = Object.values(RidiContentType) as string[];
    const validTypes = ['all', ...allContentTypes];
    if (!validTypes.includes(options.type)) {
      console.error(`Invalid type: ${options.type}`);
      console.error(`Valid types: ${validTypes.join(', ')}`);
      process.exit(1);
    }

    const genres: RidiGenre[] = options.genre === 'all'
      ? allGenres as RidiGenre[]
      : [options.genre as RidiGenre];
    const order = options.order as RidiOrder;
    const contentTypes: RidiContentType[] = options.type === 'all'
      ? allContentTypes as RidiContentType[]
      : [options.type as RidiContentType];

    const ITEMS_PER_PAGE = 60;
    const startPage = parseInt(options.page, 10);
    const limit = options.limit ? parseInt(options.limit, 10) : undefined;
    const pageCount = limit
      ? Math.ceil(limit / ITEMS_PER_PAGE)
      : parseInt(options.pages, 10);

    const crawler = new RidiListCrawler();
    await crawler.init();

    try {
      for (const contentType of contentTypes) {
        for (const genre of genres) {
          const label = `${genre} [${contentType}]`;
          if (genres.length > 1 || contentTypes.length > 1) console.log(`\n=== ${label} ===`);

          let collected: ListItem[] = [];

          for (let i = 0; i < pageCount; i++) {
            const page = startPage + i;
            const result = await crawler.crawl({ genre, page, order, contentType });
            const items = crawler.parseListItems(result.html, contentType);
            collected = collected.concat(items);

            if (limit && collected.length >= limit) break;

            if (i < pageCount - 1) {
              await new Promise((r) => setTimeout(r, 1000));
            }
          }

          if (limit) {
            collected = collected.slice(0, limit);
          }

          await crawler.saveToDb({ genre, page: startPage, order, contentType }, collected);
          console.log(`${label}: Saved ${collected.length} items`);

          if (genres.length > 1 || contentTypes.length > 1) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
    } finally {
      await crawler.close();
      await closeDb();
    }
  });

program
  .command('crawl:books')
  .description('Crawl specific books by ID list (registers to raw_list_items + crawl detail + parse)')
  .option('-i, --ids <ids...>', 'Book IDs (space-separated)')
  .option('-f, --file <path>', 'File with one book ID per line')
  .option('--skip-existing', 'Skip books already parsed', false)
  .action(async (options) => {
    let ids: string[] = [];

    if (options.ids) {
      ids = options.ids.flatMap((id: string) => id.split(',').map((s: string) => s.trim()).filter(Boolean));
    }

    if (options.file) {
      const content = await readFile(options.file, 'utf-8');
      const fileIds = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      ids = ids.concat(fileIds);
    }

    ids = [...new Set(ids)];

    if (ids.length === 0) {
      console.error('No book IDs provided. Use -i or -f option.');
      process.exit(1);
    }

    console.log(`\n=== Crawling ${ids.length} book(s) ===\n`);

    if (options.skipExisting) {
      const existing = await db
        .selectFrom('raw_work_parse_results')
        .select('external_id')
        .where('external_id', 'in', ids)
        .execute();
      const existingSet = new Set(existing.map((r) => r.external_id));
      const before = ids.length;
      ids = ids.filter((id) => !existingSet.has(id));
      if (before !== ids.length) {
        console.log(`Skipping ${before - ids.length} already-parsed books`);
      }
    }

    if (ids.length === 0) {
      console.log('All books already parsed. Nothing to do.');
      await closeDb();
      return;
    }

    // Step 1: Register to raw_list_items
    await db
      .insertInto('raw_list_items')
      .values(
        ids.map((id) => ({
          platform: 'ridi' as const,
          list_type: 'manual' as const,
          external_id: id,
          title: null,
          author: null,
        }))
      )
      .onConflict((oc) =>
        oc.columns(['platform', 'external_id']).doUpdateSet(() => ({
          crawled_at: sql`NOW()`,
        }))
      )
      .execute();
    console.log(`Registered ${ids.length} book(s) to raw_list_items\n`);

    // Step 2: Crawl detail + parse
    const crawler = new RidiCrawler();
    const parser = new RidiParser();
    await crawler.init();

    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        console.log(`[${i + 1}/${ids.length}] Crawling ${id}...`);

        try {
          const result = await crawler.crawl({ externalId: id });
          const pageId = await crawler.saveToDb(id, result);
          const parsed = await parser.parseFromPage(crawler.getPage());
          await parser.saveParseResult(pageId, id, parsed);
          console.log(`  OK: ${parsed.title ?? id}`);
          success++;
        } catch (err) {
          failed++;
          console.error(`  FAIL: ${err instanceof Error ? err.message : err}`);
        }

        if (i < ids.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } finally {
      await crawler.close();
      await closeDb();
    }

    console.log(`\n=== Done: ${success} success, ${failed} failed ===`);
  });

program
  .command('crawl:detail')
  .description('Crawl work detail pages')
  .option('-i, --id <id>', 'External ID to crawl')
  .option('--new', 'Crawl only new works from list', false)
  .option('--recrawl', 'Re-crawl works with missing images (cover or introduction)', false)
  .option('--limit <limit>', 'Limit number of works to crawl')
  .option('--auth [path]', 'Path to auth storage state (uses default if no path given)')
  .action(async (options) => {
    const storageStatePath = await resolveAuthPath(
      typeof options.auth === 'string' ? options.auth : undefined,
    );
    if (storageStatePath) console.log(`Using auth: ${storageStatePath}`);

    const crawler = new RidiCrawler();
    const parser = new RidiParser();
    await crawler.init({ storageStatePath });

    try {
      let ids: string[] = [];

      if (options.id) {
        ids = [options.id];
      } else if (options.recrawl) {
        const validator = new ListValidator();
        ids = await validator.findWorksWithMissingImages('ridi');
        console.log(`Found ${ids.length} works with missing images to re-crawl`);
      } else if (options.new) {
        const validator = new ListValidator();
        const result = await validator.findNewWorks('ridi');
        ids = result.newIds;
        console.log(`Found ${ids.length} new works to crawl`);
      }

      if (options.limit) {
        ids = ids.slice(0, parseInt(options.limit, 10));
      }

      let failed = 0;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        console.log(`[${i + 1}/${ids.length}] Crawling ${id}...`);

        try {
          const result = await crawler.crawl({ externalId: id });
          const pageId = await crawler.saveToDb(id, result);

          const parsed = await parser.parseFromPage(crawler.getPage());
          await parser.saveParseResult(pageId, id, parsed);
        } catch (err) {
          failed++;
          console.error(`Failed ${id}: ${err instanceof Error ? err.message : err}`);
        }

        if (i < ids.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (failed > 0) console.log(`\nCompleted with ${failed} failures out of ${ids.length}`);
    } finally {
      await crawler.close();
      await closeDb();
    }
  });

program
  .command('validate:list')
  .description('Validate list and find new works')
  .action(async () => {
    const validator = new ListValidator();

    try {
      const result = await validator.findNewWorks('ridi');
      const stats = await validator.getStats('ridi');

      console.log('\n=== Validation Result ===');
      console.log(`Total list items: ${stats.totalListItems}`);
      console.log(`Total work pages: ${stats.totalWorkPages}`);
      console.log(`Parsed: ${stats.totalParsed}`);
      console.log(`Unparsed: ${stats.totalUnparsed}`);
      console.log(`\nNew works to crawl: ${result.newIds.length}`);

      if (result.newIds.length > 0 && result.newIds.length <= 20) {
        console.log('IDs:', result.newIds.join(', '));
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('stats')
  .description('Show crawler statistics')
  .action(async () => {
    const validator = new ListValidator();
    const publisher = new Publisher();

    try {
      const crawlStats = await validator.getStats('ridi');
      const publishStats = await publisher.getPublishStats('ridi');

      console.log('\n=== Crawler Statistics ===');
      console.log('\nRaw Zone:');
      console.log(`  List items: ${crawlStats.totalListItems}`);
      console.log(`  Work pages: ${crawlStats.totalWorkPages}`);
      console.log(`  Parsed: ${crawlStats.totalParsed}`);
      console.log(`  Unparsed: ${crawlStats.totalUnparsed}`);

      console.log('\nServing Zone:');
      console.log(`  Published works: ${publishStats.totalPublished}`);
      console.log(`  Unpublished: ${publishStats.unpublished}`);
    } finally {
      await closeDb();
    }
  });

program
  .command('publish')
  .description('Publish refined data to serving zone')
  .option('--dry-run', 'Show what would be published without actually publishing', false)
  .action(async (options) => {
    const publisher = new Publisher();

    try {
      if (options.dryRun) {
        const stats = await publisher.getPublishStats('ridi');
        console.log(`\nDry run: Would publish ${stats.unpublished} works`);
      } else {
        const result = await publisher.publishAll('ridi');
        console.log(`\nPublished: ${result.published}, Skipped: ${result.skipped}, Deduped: ${result.deduped}`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('pipeline')
  .description('Run full pipeline: crawl list -> crawl details -> publish')
  .requiredOption('-g, --genre <genre>', 'Genre code')
  .option('--pages <count>', 'Number of list pages', '1')
  .option('--limit <limit>', 'Limit detail crawls')
  .option('--auth [path]', 'Path to auth storage state (uses default if no path given)')
  .action(async (options) => {
    const storageStatePath = await resolveAuthPath(
      typeof options.auth === 'string' ? options.auth : undefined,
    );
    if (storageStatePath) console.log(`Using auth: ${storageStatePath}`);

    console.log('=== Step 1: Crawl List ===');
    const listCrawler = new RidiListCrawler();
    await listCrawler.init({ storageStatePath });

    try {
      const pageCount = parseInt(options.pages, 10);
      for (let page = 1; page <= pageCount; page++) {
        const result = await listCrawler.crawl({ genre: options.genre, page, contentType });
        const items = listCrawler.parseListItems(result.html, contentType);
        await listCrawler.saveToDb({ genre: options.genre, page, contentType }, items);
        console.log(`Page ${page}: ${items.length} items`);
        if (page < pageCount) await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      await listCrawler.close();
    }

    console.log('\n=== Step 2: Validate & Crawl Details ===');
    const validator = new ListValidator();
    const { newIds } = await validator.findNewWorks('ridi');
    console.log(`Found ${newIds.length} new works`);

    let ids = newIds;
    if (options.limit) {
      ids = ids.slice(0, parseInt(options.limit, 10));
    }

    if (ids.length > 0) {
      const detailCrawler = new RidiCrawler();
      const parser = new RidiParser();
      await detailCrawler.init({ storageStatePath });

      try {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          console.log(`[${i + 1}/${ids.length}] ${id}`);
          const result = await detailCrawler.crawl({ externalId: id });
          const pageId = await detailCrawler.saveToDb(id, result);
          const parsed = await parser.parseFromPage(detailCrawler.getPage());
          await parser.saveParseResult(pageId, id, parsed);
          if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 1000));
        }
      } finally {
        await detailCrawler.close();
      }
    }

    console.log('\n=== Step 3: Publish ===');
    const publisher = new Publisher();
    const publishResult = await publisher.publishAll('ridi');
    console.log(`Published: ${publishResult.published}, Skipped: ${publishResult.skipped}, Deduped: ${publishResult.deduped}`);

    await closeDb();
    console.log('\n=== Pipeline Complete ===');
  });

program
  .command('enrich:list')
  .description('List works that have no enrichment data')
  .option('--limit <limit>', 'Limit number of results')
  .action(async (options) => {
    try {
      const query = db
        .selectFrom('raw_work_parse_results')
        .leftJoin(
          'raw_work_enrichments',
          'raw_work_enrichments.external_id',
          'raw_work_parse_results.external_id'
        )
        .select([
          'raw_work_parse_results.external_id',
          'raw_work_parse_results.title',
          'raw_work_parse_results.author',
          'raw_work_parse_results.keywords',
          db.fn.count('raw_work_enrichments.id').as('enrichment_count'),
        ])
        .where('raw_work_parse_results.title', 'is not', null)
        .groupBy([
          'raw_work_parse_results.external_id',
          'raw_work_parse_results.title',
          'raw_work_parse_results.author',
          'raw_work_parse_results.keywords',
        ])
        .having(db.fn.count('raw_work_enrichments.id'), '=', 0)
        .orderBy('raw_work_parse_results.external_id');

      const results = options.limit
        ? await query.limit(parseInt(options.limit, 10)).execute()
        : await query.execute();

      console.log(`\n=== Works without enrichment: ${results.length} ===\n`);

      for (const r of results) {
        const kwCount = r.keywords?.length ?? 0;
        console.log(
          `  ${r.external_id}  ${r.title}  (${r.author ?? 'unknown'})  keywords: ${kwCount}`
        );
      }

      if (results.length === 0) {
        console.log('  All works have enrichment data.');
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('enrich:import')
  .description('Import enrichment data from JSON file')
  .requiredOption('-f, --file <path>', 'Path to JSON file')
  .action(async (options) => {
    try {
      const raw = await readFile(options.file, 'utf-8');
      const parsed = EnrichmentImportSchema.safeParse(JSON.parse(raw));

      if (!parsed.success) {
        console.error('Validation failed:');
        for (const issue of parsed.error.issues) {
          console.error(`  [${issue.path.join('.')}] ${issue.message}`);
        }
        process.exit(1);
      }

      const { works } = parsed.data;
      let inserted = 0;
      let updated = 0;

      for (const work of works) {
        const exists = await db
          .selectFrom('raw_work_enrichments')
          .select('id')
          .where('external_id', '=', work.external_id)
          .executeTakeFirst();

        const tags = work.tags.length > 0 ? work.tags : null;
        const negativeTags = work.negative_tags.length > 0 ? work.negative_tags : null;

        if (exists) {
          await db
            .updateTable('raw_work_enrichments')
            .set({ tags, negative_tags: negativeTags })
            .where('id', '=', exists.id)
            .execute();
          console.log(`  Updated: ${work.external_id} (${work.tags.length} tags, ${work.negative_tags.length} negative)`);
          updated++;
        } else {
          await db
            .insertInto('raw_work_enrichments')
            .values({ external_id: work.external_id, tags, negative_tags: negativeTags })
            .execute();
          console.log(`  Imported: ${work.external_id} (${work.tags.length} tags, ${work.negative_tags.length} negative)`);
          inserted++;
        }
      }

      console.log(`\nDone: ${inserted} inserted, ${updated} updated`);
    } finally {
      await closeDb();
    }
  });

program.parse();
