import assert from 'assert';
import { EventEmitter } from 'events';
import axios from 'axios';
import pThrottle, { ThrottledFunction } from 'p-throttle';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';
import { CachingResourceLoader, mockMissingApis, waitForCondition } from './helpers';
import { Db, RentalKind, RentalRecord, Scraper, ScraperClass, ScraperContext } from './types';
import * as constants from './constants';

const BASE_URL = 'https://www.olx.ua/nedvizhimost';
const SELECTORS = {
    offer: 'table.offers tr.wrap',
    offer_titleLink: '.title-cell a.linkWithHash',
    totalPages: '[data-cy="page-link-last"]',
    postingDate: '.bottom-cell small:last-child',
    price: '.price',
    showPhoneButton: '[data-testid="show-phone"]',
    authPrompt: '[data-testid="prompt-message"]',
    phones: '[data-testid="phones-container"]',
    description: '[data-cy="ad_description"]',
    offerPropertyBox: 'ul li p',
};

const WINDOW_CLOSE_DELAY_MS = 5000;
const WAIT_FOR_CONDITION_POLL_INTERVAL_MS = 100;

const extractIdFromUrl = (url: string) => url.split('/')?.at(-1)?.split('.html')?.at(0);

export const OlxScraper: ScraperClass<RentalRecord> = class extends EventEmitter implements Scraper<RentalRecord> {
    context: ScraperContext;
    resourceLoader: ResourceLoader;
    throttle: <T extends readonly unknown[], R>(fn: (...args: T) => R) => ThrottledFunction<T, R>;

    constructor(context: ScraperContext) {
        super();
        this.context = context;
        this.resourceLoader = new CachingResourceLoader(context.logger);
        this.throttle = pThrottle({
            limit: 1,
            interval: context.config.pageQueryIntervalMs,
        });
    }

    async isSourceUpdated(db: Db<RentalRecord>): Promise<boolean> {
        this.log('Checking if source was updated');
        const city = this.context.config.cityOfInterest;
        const sourceDOM = await this.openPage(`${BASE_URL}/${city}`);
        const sourceDocument = sourceDOM.window.document;
        for (const offer of Array.from(sourceDocument.querySelectorAll(SELECTORS.offer))) {
            const titleLink = offer.querySelector(SELECTORS.offer_titleLink);
            assert.ok(titleLink);
            assert.ok(titleLink instanceof sourceDOM.window.HTMLAnchorElement);
            assert.ok(titleLink.href);
            const id = extractIdFromUrl(titleLink.href.trim());
            assert.ok(id);
            if (!db.get(id)) {
                this.log('Found new data in source');
                return true;
            }
        }
        this.log('No new data found');
        return false;
    }

    async scrape(db: Db<RentalRecord>): Promise<void> {
        process.on('unhandledRejection', this.logUnhandledRejection);
        const config = this.context.config;
        let total = 999;
        for (let page = 1; page <= total; page++) {
            const listingUrl = `${BASE_URL}/${config.cityOfInterest}/?page=${page}`;
            const listingDOM = await this.openPage(listingUrl);
            const listingDocument = listingDOM.window.document;
            const totalPagesElem = listingDocument.querySelector(SELECTORS.totalPages);
            if (totalPagesElem && totalPagesElem.textContent) {
                total = Number.parseInt(totalPagesElem.textContent.trim());
            }
            this.logProgress('Scraping page {value}/{total}', page, total);
            type OfferHeader = {
                id: string;
                url: string;
                title: string;
                postingDate: string;
                price: string;
            };
            const offerHeaders: OfferHeader[] = [];
            for (const offerElem of Array.from(listingDocument.querySelectorAll(SELECTORS.offer))) {
                const titleLink = offerElem.querySelector(SELECTORS.offer_titleLink);
                assert.ok(titleLink);
                assert.ok(titleLink instanceof listingDOM.window.HTMLAnchorElement);
                const url = titleLink.href.trim();
                assert.ok(url);
                const id = extractIdFromUrl(url);
                assert.ok(id);
                const title = titleLink.textContent?.trim();
                assert.ok(title);
                const postingDate = offerElem.querySelector(SELECTORS.postingDate)?.textContent?.trim();
                assert.ok(postingDate);
                const price = offerElem.querySelector(SELECTORS.price)?.textContent?.trim();
                assert.ok(price);
                offerHeaders.push({ id, url, title, postingDate, price });
            }
            listingDOM.window.onload = () => setTimeout(() => listingDOM.window.close(), WINDOW_CLOSE_DELAY_MS);
            for (const offerHeader of offerHeaders) {
                if (this.context.config.skipExistingRecords && db.get(offerHeader.id)) {
                    this.log(`Found offer ${offerHeader.id} data in database, skipping to next offer`);
                    continue;
                }
                const offerDOM = await this.openPageWithJS(offerHeader.url);
                const offerDocument = offerDOM.window.document;
                try {
                    await waitForCondition(
                        config.waitSelectorTimeoutMs,
                        WAIT_FOR_CONDITION_POLL_INTERVAL_MS,
                        () => !!offerDocument.querySelector(SELECTORS.showPhoneButton)
                    );
                } catch (error) {
                    this.logError(error);
                    this.log('Skipping to next offer');
                    continue;
                }
                let phone: string | undefined;
                if (!offerDocument.querySelector(SELECTORS.authPrompt)) {
                    const showPhoneButton = offerDocument.querySelector(SELECTORS.showPhoneButton);
                    assert.ok(showPhoneButton instanceof offerDOM.window.HTMLButtonElement);
                    showPhoneButton.click();
                    const phonesElem = offerDocument.querySelector(SELECTORS.phones);
                    try {
                        await waitForCondition(
                            config.waitSelectorTimeoutMs,
                            WAIT_FOR_CONDITION_POLL_INTERVAL_MS,
                            () => phonesElem?.textContent?.includes('xxx') === false
                        );
                    } catch (error) {
                        this.logError(error);
                        this.log('Skipping to next offer');
                        continue;
                    }
                    phone = phonesElem?.textContent?.trim();
                }
                const description = offerDocument.querySelector(SELECTORS.description)?.textContent?.trim() || '';
                let kind: RentalKind | undefined;
                let roomCount: number | undefined;
                let floorCount: number | undefined;
                for (const propBox of Array.from(offerDocument.querySelectorAll(SELECTORS.offerPropertyBox))) {
                    const text = propBox.textContent;
                    if (text?.includes('Тип дома')) {
                        if (text?.includes('Дом') || text?.includes('Коттедж') || text?.includes('Дача')) {
                            kind = 'House';
                        } else if (text?.includes('Хрущевка') || text?.includes('Жилой фонд')) {
                            kind = 'Appartment';
                        } else {
                            this.log(`Unknown rental kind ${text.trim()}`);
                        }
                        break;
                    } else if (text?.includes('Количество комнат')) {
                        const roomCountString = text.split(':').at(-1)?.trim();
                        if (roomCountString) {
                            roomCount = +roomCountString;
                        } else {
                            this.log(`Malformed room count: "${text}"`);
                        }
                    } else if (text?.includes('Этажность')) {
                        const floorCountString = text.split(':').at(-1)?.trim();
                        if (floorCountString) {
                            floorCount = +floorCountString;
                        } else {
                            this.log(`Malformed floor count: "${text}"`);
                        }
                    }
                }
                offerDOM.window.onload = () => setTimeout(() => offerDOM.window.close(), WINDOW_CLOSE_DELAY_MS);
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
                    firstScrapedAt: oldRecord?.firstScrapedAt || now,
                    lastScrapedAt: now,
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
        process.off('unhandledRejection', this.logUnhandledRejection);
    }

    logUnhandledRejection = (reason: any) => {
        this.logError(`Unhandled promise rejection: ${reason}`);
    };

    async openPage(url: string): Promise<JSDOM> {
        this.log(`Querying ${url}`);
        const response = await this.throttle(axios.get)(url);
        return new JSDOM(response.data);
    }

    async openPageWithJS(url: string): Promise<JSDOM> {
        this.log(`Querying ${url}`);
        const response = await this.throttle(axios.get)(url);
        const dom = new JSDOM(response.data, {
            url,
            userAgent: constants.USER_AGENT,
            resources: this.resourceLoader,
            runScripts: 'dangerously',
            pretendToBeVisual: true,
            virtualConsole: new VirtualConsole(),
        });
        mockMissingApis(dom);
        return dom;
    }

    log(msg: any) {
        this.context.logger.log(`OlxScraper: ${msg}`);
    }

    logError(msg: any) {
        this.context.logger.logError(`OlxScraper: ${msg}`);
    }

    logProgress(format: string, value: number, total: number) {
        this.context.logger.logProgress(`OlxScraper: ${format}`, value, total);
    }
};
