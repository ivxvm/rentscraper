import assert from 'assert';
import { EventEmitter } from 'events';
import { firefox } from 'playwright-firefox';
import { Db, RentalRecord, Scraper, ScraperClass, ScraperContext } from '../types';

const BASE_URL = 'https://www.airbnb.com';

namespace Selectors {
    export const OFFER = '[itemprop="itemListElement"]';
    export const OFFER_NAME = '[itemprop="name"]';
    export const OFFER_URL = '[itemprop="url"]';
    export const OFFER_DETAILS = '.i1wgresd.dir.dir-ltr';
    export const OFFER_PRICE = '.p1qe1cgb.dir.dir-ltr .a8jt5op';
    export const PAGINATION = '[aria-label="Search results pagination"]';
    export const PREV_PAGE = '[aria-label="Previous"]';
    export const NEXT_PAGE = '[aria-label="Next"]';
    export const WAIT_SELECTOR = Selectors.PAGINATION;
}

export const AirbnbScraper: ScraperClass<RentalRecord> = class extends EventEmitter implements Scraper<RentalRecord> {
    context: ScraperContext;

    constructor(context: ScraperContext) {
        super();
        this.context = context;
    }

    async scrape(db: Db<RentalRecord>): Promise<void> {
        const config = this.context.config;
        const logger = this.context.logger;
        const browser = await firefox.launch();
        const page = await browser.newPage();
        this.log(`Processing ${BASE_URL}/${this.context.config.query}/stays`);
        await page.goto(`${BASE_URL}/${this.context.config.query}/stays`);
        for (const link of await page.$$('a')) {
            const text = await link.textContent();
            if (text?.toLowerCase().includes('show all')) {
                this.log(`Processing ${await link.evaluate((a) => a.href)}`);
                await page.goto(`${await link.evaluate((a) => a.href)}`);
                this.log(`Waiting for dynamic content rendering`);
                await page.waitForSelector(Selectors.WAIT_SELECTOR, { timeout: config.waitSelectorTimeoutMs });
                break;
            }
        }
        const totalPages = await page.$eval(Selectors.PAGINATION, (elem) => elem.querySelectorAll('a').length);
        logger.startProgress('AirbnbScraper: Scraping page {value}/{total}', 1, totalPages);
        for (let pageIndex = 1; ; ) {
            for (const offerElem of await page.$$(Selectors.OFFER)) {
                const title = await offerElem.$eval(Selectors.OFFER_NAME, (elem: HTMLMetaElement) => elem.content);
                const url = await offerElem.$eval(Selectors.OFFER_URL, (elem: HTMLMetaElement) => elem.content);
                const id = 'airbnb_' + url.split('rooms/').at(-1)?.split('?').at(0);
                if (config.skipExistingRecords && db.get(id)) {
                    this.log(`Found offer ${id} data in database, skipping to next offer`);
                    continue;
                }
                const price = await offerElem.$eval(Selectors.OFFER_PRICE, (elem: HTMLElement) => elem.textContent);
                assert.ok(price);
                const details = await offerElem.$eval(Selectors.OFFER_DETAILS, (elem: HTMLElement) => elem.textContent);
                const guestCount = +(details?.match(/(\d*\.?\d+) guests?/)?.[1] || '0');
                const bedroomCount = +(details?.match(/(\d*\.?\d+) bedrooms? /)?.[1] || '0');
                const bedCount = +(details?.match(/(\d*\.?\d+) beds? /)?.[1] || '0');
                const bathCount = +(details?.match(/(\d*\.?\d+) (shared )?baths?/)?.[1] || '0');
                const oldRecord = db.get(id);
                const now = new Date();
                const newRecord: RentalRecord = {
                    source: 'airbnb',
                    url,
                    title,
                    price,
                    guestCount,
                    roomCount: bedroomCount,
                    bedCount,
                    bathCount,
                    firstScrapedAt: oldRecord?.firstScrapedAt || now.toString(),
                    lastScrapedAt: now.toString(),
                };
                if (oldRecord) {
                    this.log(`Previously scraped record ${id} was updated`);
                    const hasImportantDifferences =
                        oldRecord.title !== newRecord.title ||
                        oldRecord.roomCount !== newRecord.roomCount ||
                        oldRecord.price !== newRecord.price;
                    if (hasImportantDifferences) {
                        this.log(`Old data: ${JSON.stringify(oldRecord)}`);
                    }
                }
                this.log(`New data: ${JSON.stringify(newRecord)}`);
                db.set(id, newRecord);
                this.emit('recordScraped', id, newRecord);
            }
            const nextPageBtn = await page.$(Selectors.NEXT_PAGE);
            if (nextPageBtn && (await nextPageBtn.isEnabled())) {
                pageIndex += 1;
                this.log(`Proceeding to page ${pageIndex}`);
                await nextPageBtn.click();
                logger.updateProgress(pageIndex);
                await page.waitForTimeout(config.pageQueryIntervalMs);
                this.log(`Waiting for dynamic content rendering`);
                await page.waitForSelector(Selectors.WAIT_SELECTOR, { timeout: config.waitSelectorTimeoutMs });
            } else {
                this.log(`Reached last page, exiting`);
                break;
            }
        }
        logger.endProgress();
    }

    private log(msg: any) {
        this.context.logger.log(`AirbnbScraper: ${msg}`);
    }
};
