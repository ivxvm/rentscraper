import assert from 'assert';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { waitForCondition } from './helpers';
import { Db, RentalKind, RentalRecord, Scraper, ScraperClass, ScraperContext } from './types';

const BASE_URL = 'https://www.olx.ua/nedvizhimost';
const SELECTORS = {
    offer: 'table.offers tr.wrap',
    offer_titleLink: '.title-cell a.linkWithHash',
    totalPages: '[data-cy="page-link-last"]',
    postingDate: '.bottom-cell small:last-child',
    price: '.price',
    showPhoneButton: '[data-testid="show-phone"]',
    phones: '[data-testid="phones-container"]',
    description: 'data-cy="ad_description"',
    offerPropertyBox: 'ul li p',
};

const extractIdFromUrl = (url: string) => url.split('/')?.at(-1)?.split('.html')?.at(0);

export const OlxScraper: ScraperClass<RentalRecord> = class implements Scraper<RentalRecord> {
    context: ScraperContext;

    constructor(context: ScraperContext) {
        this.context = context;
    }

    async isSourceUpdated(db: Db<RentalRecord>): Promise<boolean> {
        this.log('Checking if source was updated');
        const city = this.context.config.cityOfInterest;
        const response = await axios.get(`${BASE_URL}/${city}`);
        const dom = new JSDOM(response.data);
        const document = dom.window.document;
        for (const offer of Array.from(document.querySelectorAll(SELECTORS.offer))) {
            const titleLink = offer.querySelector(SELECTORS.offer_titleLink);
            assert.ok(titleLink);
            assert.ok(titleLink instanceof HTMLAnchorElement);
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
        const city = this.context.config.cityOfInterest;
        let total = 999;
        for (let page = 1; page <= total; page++) {
            const listingUrl = `${BASE_URL}/${city}/?page=${page}`;
            this.log(`Querying ${listingUrl}`);
            const listingResponse = await axios.get(listingUrl);
            const listingDOM = new JSDOM(listingResponse.data);
            const listingDocument = listingDOM.window.document;
            const totalPagesElem = listingDocument.querySelector(SELECTORS.totalPages);
            if (totalPagesElem && totalPagesElem.textContent) {
                total = Number.parseInt(totalPagesElem.textContent.trim());
            }
            this.logProgress('Scraping page {value}/{total}', page, total);
            for (const offer of Array.from(listingDocument.querySelectorAll(SELECTORS.offer))) {
                const titleLink = offer.querySelector(SELECTORS.offer_titleLink);
                assert.ok(titleLink);
                assert.ok(titleLink instanceof HTMLAnchorElement);
                const offerUrl = titleLink.href.trim();
                assert.ok(offerUrl);
                const id = extractIdFromUrl(offerUrl);
                assert.ok(id);
                const title = titleLink.textContent?.trim();
                assert.ok(title);
                const postingDate = offer.querySelector(SELECTORS.postingDate)?.textContent?.trim();
                assert.ok(postingDate);
                const price = offer.querySelector(SELECTORS.price)?.textContent?.trim();
                assert.ok(price);
                this.log(`Querying ${offerUrl}`);
                const offerResponse = await axios.get(offerUrl);
                const offerDOM = new JSDOM(offerResponse.data);
                const offerDocument = offerDOM.window.document;
                const showPhoneButton = offerDocument.querySelector(SELECTORS.showPhoneButton);
                assert.ok(showPhoneButton);
                assert.ok(showPhoneButton instanceof HTMLButtonElement);
                showPhoneButton.click();
                const phonesElem = offerDocument.querySelector(SELECTORS.phones);
                await waitForCondition(10_000, 100, () => phonesElem?.textContent?.includes('xxx') === false);
                const phone = phonesElem?.textContent?.trim() || '';
                const description = offerDocument.querySelector(SELECTORS.description)?.textContent?.trim() || '';
                let kind: RentalKind | undefined;
                let roomCount: number | undefined;
                let floorCount: number | undefined;
                for (const propBox of Array.from(document.querySelectorAll(SELECTORS.offerPropertyBox))) {
                    const text = propBox.textContent;
                    if (text?.includes('Тип дома')) {
                        if (text?.includes('Дом')) {
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
                const oldRecord = db.get(id);
                const now = new Date();
                const newRecord: RentalRecord = {
                    source: 'olx',
                    url: offerUrl,
                    kind,
                    roomCount,
                    floorCount,
                    title,
                    phone,
                    description,
                    price,
                    postedAt: postingDate,
                    firstScrapedAt: oldRecord?.firstScrapedAt || now,
                    lastScrapedAt: now,
                };
                if (oldRecord) {
                    this.log(`Previously scraped record ${id} was updated`);
                    const hasImportantDifferences =
                        oldRecord.phone !== newRecord.phone ||
                        oldRecord.description !== newRecord.description ||
                        oldRecord.title !== newRecord.title ||
                        oldRecord.price !== newRecord.price;
                    if (hasImportantDifferences) {
                        this.log(`Old data: ${JSON.stringify(oldRecord)}`);
                        this.log(`New data: ${JSON.stringify(newRecord)}`);
                    }
                }
                db.set(id, newRecord);
            }
        }
    }

    log(msg: string) {
        this.context.logger.log(`OlxScraper: ${msg}`);
    }

    logProgress(format: string, value: number, total: number) {
        this.context.logger.logProgress(`OlxScraper: ${format}`, value, total);
    }
};
