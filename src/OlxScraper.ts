import assert from 'assert';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Db, RentalRecord, Scraper, ScraperClass, ScraperContext } from './types';

const BASE_URL = 'https://www.olx.ua/nedvizhimost';
const SELECTORS = {
    offer: 'table.offers tr.wrap',
    offer_titleLink: 'a.linkWithHash',
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
            const id = extractIdFromUrl(titleLink.href?.trim());
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
        throw new Error('Method not implemented.');
    }

    log(msg: string) {
        this.context.logger.log(`OlxScraper: ${msg}`);
    }
};
