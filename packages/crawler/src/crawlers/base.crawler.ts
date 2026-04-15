import { Browser, BrowserContext, chromium, Page } from 'playwright';

export interface CrawlResult {
  url: string;
  html: string;
  crawledAt: Date;
}

export interface CrawlerInitOptions {
  storageStatePath?: string;
}

export abstract class BaseCrawler {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;

  getPage(): Page {
    if (!this.page) throw new Error('Browser not initialized. Call init() first.');
    return this.page;
  }

  async init(options?: CrawlerInitOptions): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
    });

    this.context = await this.browser.newContext(
      options?.storageStatePath ? { storageState: options.storageStatePath } : undefined,
    );
    this.page = await this.context.newPage();

    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9',
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  protected async fetchPage(url: string): Promise<CrawlResult> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await this.page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    const html = await this.page.content();

    return {
      url,
      html,
      crawledAt: new Date(),
    };
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  abstract crawl(...args: unknown[]): Promise<unknown>;
}
