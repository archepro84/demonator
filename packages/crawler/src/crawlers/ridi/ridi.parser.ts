import { Page } from 'playwright';
import { db } from '../../database/kysely';
import type { ParsedWorkData } from '../../schemas/raw.schema';
import type { RidiContentType } from './ridi-list.crawler';

const NOISE_KEYWORDS = new Set([
  // 플랫폼/포맷
  'RIDI_ONLY', '리다무', '웹소설', '웹툰', '연재중', '연재완결',
  '단행본', 'e북', '대여', '해외소설', '웹툰원작',
  // 시점/서사 메타
  '3인칭시점', '1인칭시점', '공시점', '수시점', '이야기중심',
  // 출판 레이블
  '할리킹',
  // 페어링 메타
  '서브공있음', '서브수있음', '다공일수', '여공남수',
]);
const NOISE_RE = /^(평점|리뷰|별점)\d+/;
const PRICE_OR_VOLUME_RE = /^\d+%할인$|^\d+[만천]?원|^\d+~|^\d+권이상$/;
const ADULT_PLACEHOLDER_RE = /cover_adult/;

export class RidiParser {
  async parseFromPage(page: Page, externalId: string): Promise<ParsedWorkData> {
    const [title, author, description, keywords, introductionImages, volumeCount, contentType] =
      await Promise.all([
        this.extractTitle(page),
        this.extractAuthor(page),
        this.extractDescription(page),
        this.extractKeywords(page),
        this.extractIntroductionImages(page),
        this.extractVolumeCount(page),
        this.detectContentType(page),
      ]);

    const coverImageUrl = `https://img.ridicdn.net/cover/${externalId}/xxlarge#1`;

    return { title, author, description, keywords, volumeCount, coverImageUrl, introductionImages, contentType };
  }

  private async metaContent(page: Page, attr: string, value: string): Promise<string | undefined> {
    const el = page.locator(`meta[${attr}="${value}"]`);
    const content = await el.getAttribute('content').catch(() => null);
    return content ?? undefined;
  }

  private async extractCoverImage(page: Page): Promise<string | undefined> {
    const ogImage = await this.metaContent(page, 'property', 'og:image');
    if (ogImage && !ADULT_PLACEHOLDER_RE.test(ogImage)) {
      return ogImage;
    }

    const coverSelectors = [
      '#ISLANDS__Header img[src*="/cover/"]',
      'img[src*="/cover/"][src*="xlarge"]',
      'img[src*="/cover/"]',
    ];
    for (const selector of coverSelectors) {
      const img = page.locator(selector).first();
      if (await img.count() > 0) {
        const src = await img.getAttribute('src').catch(() => null);
        if (src && !src.startsWith('data:') && !ADULT_PLACEHOLDER_RE.test(src)) {
          return src;
        }
      }
    }

    return ogImage;
  }

  private async extractTitle(page: Page): Promise<string> {
    const ogTitle = await this.metaContent(page, 'property', 'og:title');
    const raw = ogTitle ?? await page.title();
    return raw
      .replace(/\s*-\s*(?:리디|최신권|독점).*$/, '')
      .replace(/\s+\d+[권화]?\s*$/, '')
      .trim();
  }

  private async extractAuthor(page: Page): Promise<string | undefined> {
    const authorLink = page.locator('#ISLANDS__Header li:has-text("저자") a').first();
    if (await authorLink.count() > 0) {
      const text = await authorLink.textContent();
      if (text?.trim()) return text.trim();
    }
    const metaKw = await this.metaContent(page, 'name', 'keywords');
    if (metaKw) {
      const tokens = metaKw.split(',').map((t) => t.trim());
      const idx = tokens.findIndex((t) => t === '저자');
      if (idx > 0) return tokens[idx - 1];
    }
    return undefined;
  }

  private async extractDescription(page: Page): Promise<string | undefined> {
    const heading = page.locator('#ISLANDS__IntroduceTab h2:has-text("작품 소개")').first();
    if (await heading.count() > 0) {
      const text = await heading.locator('~ *').first().textContent().catch(() => null);
      if (text?.trim()) return text.trim();
    }
    const metaDesc = await this.metaContent(page, 'name', 'description');
    if (metaDesc) return metaDesc.replace(/^.+?작품소개:\s*/, '').trim();
    return undefined;
  }

  private async extractKeywords(page: Page): Promise<string[]> {
    const buttons = page.locator('#ISLANDS__Keyword button[aria-label]');
    const count = await buttons.count();
    const tags: string[] = [];
    for (let i = 0; i < count; i++) {
      const label = await buttons.nth(i).getAttribute('aria-label');
      if (label && !NOISE_KEYWORDS.has(label.trim()) && !NOISE_RE.test(label.trim()) && !PRICE_OR_VOLUME_RE.test(label.trim())) {
        tags.push(label.trim());
      }
    }
    return tags;
  }

  private async extractIntroductionImages(page: Page): Promise<string[]> {
    const srcs: string[] = [];
    const selectors = ['#ISLANDS__IntroduceTab img', '#ISLANDS__LowerPanelList img'];
    for (const selector of selectors) {
      const imgs = page.locator(selector);
      const count = await imgs.count();
      for (let i = 0; i < count; i++) {
        const img = imgs.nth(i);
        const src = await img.getAttribute('src');
        if (!src || src.startsWith('data:') || src.includes('static.ridicdn.net') || src.includes('/cover/')) {
          continue;
        }
        const isLinked = await img.evaluate(el => !!el.closest('a'));
        if (isLinked) continue;
        srcs.push(src);
      }
    }
    return srcs;
  }

  private async detectContentType(page: Page): Promise<RidiContentType | undefined> {
    const breadcrumb = await page.locator('nav[aria-label="breadcrumb"], ol[class*="breadcrumb"], [class*="Breadcrumb"]').textContent().catch(() => null);
    if (breadcrumb) {
      if (/웹소설/.test(breadcrumb)) return 'webnovel';
      if (/e북|ebook/i.test(breadcrumb)) return 'ebook';
    }

    const categoryText = await page.locator('#ISLANDS__Header').textContent().catch(() => null);
    if (categoryText) {
      if (/웹소설/.test(categoryText)) return 'webnovel';
      if (/e북/i.test(categoryText)) return 'ebook';
    }

    const metaKeywords = await this.metaContent(page, 'name', 'keywords');
    if (metaKeywords) {
      if (/웹소설/.test(metaKeywords)) return 'webnovel';
      if (/e북/.test(metaKeywords)) return 'ebook';
    }

    return undefined;
  }

  private async extractVolumeCount(page: Page): Promise<number | undefined> {
    const headerText = await page.locator('#ISLANDS__Header').textContent().catch(() => null);
    if (headerText) {
      const match = headerText.match(/총\s*([\d,]+)권/);
      if (match) return parseInt(match[1].replace(/,/g, ''), 10);
    }
    return 1;
  }

  async saveParseResult(rawPageId: number, externalId: string, data: ParsedWorkData): Promise<number> {
    await db
      .deleteFrom('raw_work_parse_results')
      .where('raw_page_id', '=', rawPageId)
      .execute();

    const result = await db
      .insertInto('raw_work_parse_results')
      .values({
        raw_page_id: rawPageId,
        external_id: externalId,
        title: data.title,
        author: data.author ?? null,
        description: data.description ?? null,
        keywords: data.keywords.length > 0 ? data.keywords : null,
        volume_count: data.volumeCount ?? null,
        cover_image_url: data.coverImageUrl ?? null,
        introduction_images:
          data.introductionImages.length > 0 ? data.introductionImages : null,
        content_type: data.contentType ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const typeLabel = data.contentType ? ` [${data.contentType}]` : '';
    console.log(`Saved parse result for ${externalId}: "${data.title}"${typeLabel}`);
    return result.id;
  }
}
