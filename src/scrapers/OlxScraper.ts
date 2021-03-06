import assert from 'assert';
import { EventEmitter } from 'events';
import { firefox, Page } from 'playwright-firefox';
import { Db, RentalKind, RentalRecord, Scraper, ScraperClass, ScraperContext } from '../types';
import pThrottle, { ThrottledFunction } from 'p-throttle';

const BASE_URL = 'https://www.olx.ua/nedvizhimost';
const SELECTORS = {
    offer: 'table.offers tr.wrap',
    offer_titleLink: '.title-cell a.linkWithHash',
    currentPage: '[data-cy="page-link-current"]',
    totalPages: '[data-cy="page-link-last"]',
    postingDate: '.bottom-cell small:last-child',
    price: '.price',
    showPhoneButton: '[data-testid="show-phone"]',
    authPrompt: '[data-testid="prompt-message"]',
    phones: '[data-testid="phones-container"]',
    description: '[data-cy="ad_description"]',
    offerPropertyBox: 'ul li p',
};

const extractIdFromUrl = (url: string) => url.split('/')?.at(-1)?.split('.html')?.at(0);
const boundGoto = (page: Page) => page.goto.bind(page);

export const OlxScraper: ScraperClass<RentalRecord> = class extends EventEmitter implements Scraper<RentalRecord> {
    private readonly context: ScraperContext;
    private readonly throttle: <T extends readonly unknown[], R>(
        function_: (...args: T) => R
    ) => ThrottledFunction<T, R>;

    constructor(context: ScraperContext) {
        super();
        this.context = context;
        this.throttle = pThrottle({
            interval: context.config.pageQueryIntervalMs,
            limit: 1,
        });
    }

    async scrape(db: Db<RentalRecord>): Promise<void> {
        const config = this.context.config;
        const logger = this.context.logger;
        const browser = await firefox.launch();
        if (config.quickCheckUpdates) {
            this.log('Checking if source was updated');
            const page = await browser.newPage({ acceptDownloads: false });
            await this.throttle(boundGoto(page))(`${BASE_URL}/${config.query}`);
            let sourceWasUpdated = false;
            for (const offer of await page.$$(SELECTORS.offer)) {
                const titleLink = await offer.$(SELECTORS.offer_titleLink);
                assert.ok(titleLink);
                assert.ok(await titleLink.evaluate((elem) => elem instanceof HTMLAnchorElement));
                const href = await titleLink.evaluate((elem: HTMLAnchorElement) => elem.href);
                assert.ok(href);
                const id = extractIdFromUrl(href.trim());
                assert.ok(id);
                if (!db.get(id)) {
                    sourceWasUpdated = true;
                    break;
                }
            }
            await page.close();
            if (sourceWasUpdated) {
                this.log('Found new data in source');
            } else {
                this.log('No new data found');
                await browser.close();
                return;
            }
        }
        let totalPages = 999;
        logger.startProgress('OlxScraper: Scraping page {value}/{total}', 1);
        for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
            const listingUrl = `${BASE_URL}/${config.query}/?page=${pageIndex}`;
            this.log(`Processing ${listingUrl}`);
            const listingPage = await browser.newPage({ acceptDownloads: false });
            await this.throttle(boundGoto(listingPage))(listingUrl, { waitUntil: 'commit' });
            await listingPage.waitForSelector(SELECTORS.currentPage, {
                timeout: config.waitSelectorTimeoutMs,
            });
            const totalPagesElem = await listingPage.$(SELECTORS.totalPages);
            const totalPagesText = totalPagesElem && (await totalPagesElem.textContent());
            if (totalPagesElem && totalPagesText) {
                totalPages = Number.parseInt(totalPagesText.trim());
            }
            logger.updateProgress(pageIndex, totalPages);
            type OfferHeader = {
                id: string;
                url: string;
                title: string;
                postingDate: string;
                price: string;
            };
            const offerHeaders: OfferHeader[] = [];
            for (const offerElem of await listingPage.$$(SELECTORS.offer)) {
                const titleLink = await offerElem.$(SELECTORS.offer_titleLink);
                assert.ok(titleLink);
                assert.ok(await titleLink.evaluate((elem) => elem instanceof HTMLAnchorElement));
                const url = await titleLink.evaluate((elem: HTMLAnchorElement) => elem.href.trim());
                assert.ok(url);
                const id = extractIdFromUrl(url);
                assert.ok(id);
                const title = await titleLink.evaluate((elem) => elem.textContent?.trim());
                assert.ok(title);
                const postingDateElem = await offerElem.$(SELECTORS.postingDate);
                const postingDate = await postingDateElem?.evaluate((elem) => elem.textContent?.trim());
                assert.ok(postingDate);
                const priceElem = await offerElem.$(SELECTORS.price);
                const price = await priceElem?.evaluate((elem) => elem?.textContent?.trim());
                assert.ok(price);
                offerHeaders.push({ id, url, title, postingDate, price });
            }
            await listingPage.close();
            for (const offerHeader of offerHeaders) {
                if (config.skipExistingRecords && db.get(offerHeader.id)) {
                    this.log(`Found offer ${offerHeader.id} data in database, skipping to next offer`);
                    continue;
                }
                this.log(`Processing ${offerHeader.url}`);
                const offerPage = await browser.newPage();
                await this.throttle(boundGoto(offerPage))(offerHeader.url, { timeout: 0 });
                let phoneButtonPresent = true;
                try {
                    await offerPage.waitForSelector(SELECTORS.showPhoneButton, {
                        timeout: config.waitSelectorTimeoutMs,
                    });
                } catch (error) {
                    phoneButtonPresent = false;
                }
                let phone: string | undefined;
                const authPromptElem = await offerPage.$(SELECTORS.authPrompt);
                if (!authPromptElem && phoneButtonPresent) {
                    const showPhoneButton = await offerPage.$(SELECTORS.showPhoneButton);
                    assert.ok(showPhoneButton);
                    assert.ok(await showPhoneButton.evaluate((elem) => elem instanceof HTMLButtonElement));
                    await showPhoneButton.click();
                    const phonesElem = await offerPage.$(SELECTORS.phones);
                    try {
                        await offerPage.waitForFunction(
                            (elem) => elem?.textContent?.includes('xxx') === false,
                            phonesElem
                        );
                    } catch (error) {
                        this.logError(error);
                        this.log('Skipping to next offer');
                        await offerPage.close();
                        continue;
                    }
                    phone = await phonesElem?.evaluate((elem) => elem.textContent?.trim());
                }
                const descriptionElem = await offerPage.$(SELECTORS.description);
                const description = (await descriptionElem?.evaluate((elem) => elem.textContent?.trim())) || '';
                let kind: RentalKind | undefined;
                let roomCount: number | undefined;
                let floorCount: number | undefined;
                for (const propBox of await offerPage.$$(SELECTORS.offerPropertyBox)) {
                    const text = await propBox.textContent();
                    if (text?.includes('?????? ????????')) {
                        if (text?.includes('??????') || text?.includes('??????????????') || text?.includes('????????')) {
                            kind = 'House';
                        } else if (text?.includes('????????????????') || text?.includes('?????????? ????????')) {
                            kind = 'Appartment';
                        } else {
                            this.log(`Unknown rental kind ${text.trim()}`);
                        }
                        break;
                    } else if (text?.includes('???????????????????? ????????????')) {
                        const roomCountString = text.split(':').at(-1)?.trim();
                        if (roomCountString) {
                            roomCount = +roomCountString;
                        } else {
                            this.log(`Malformed room count: "${text}"`);
                        }
                    } else if (text?.includes('??????????????????')) {
                        const floorCountString = text.split(':').at(-1)?.trim();
                        if (floorCountString) {
                            floorCount = +floorCountString;
                        } else {
                            this.log(`Malformed floor count: "${text}"`);
                        }
                    }
                }
                await offerPage.close();
                const oldRecord = db.get(offerHeader.id);
                const now = new Date();
                const newRecord: RentalRecord = {
                    source: 'olx',
                    url: offerHeader.url,
                    kind,
                    roomCount,
                    floorCount,
                    title: offerHeader.title,
                    phone,
                    description,
                    price: offerHeader.price,
                    postedAt: offerHeader.postingDate,
                    firstScrapedAt: oldRecord?.firstScrapedAt || now.toString(),
                    lastScrapedAt: now.toString(),
                };
                if (oldRecord) {
                    this.log(`Previously scraped record ${offerHeader.id} was updated`);
                    const hasImportantDifferences =
                        oldRecord.phone !== newRecord.phone ||
                        oldRecord.description !== newRecord.description ||
                        oldRecord.title !== newRecord.title ||
                        oldRecord.price !== newRecord.price;
                    if (hasImportantDifferences) {
                        this.log(`Old data: ${JSON.stringify(oldRecord)}`);
                    }
                }
                this.log(`New data: ${JSON.stringify(newRecord)}`);
                db.set(offerHeader.id, newRecord);
                this.emit('recordScraped', offerHeader.id, newRecord);
            }
        }
        logger.endProgress();
    }

    private log(msg: any) {
        this.context.logger.log(`OlxScraper: ${msg}`);
    }

    private logError(msg: any) {
        this.context.logger.logError(`OlxScraper: ${msg}`);
    }
};
