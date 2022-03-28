import assert from 'assert';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Db, RentalRecord, Scraper, ScraperClass, ScrapingConfig } from './types';

const BASE_URL = 'https://www.olx.ua/nedvizhimost';
const SELECTORS = {
    offer: 'table.offers tr.wrap',
    offer_titleLink: 'a.linkWithHash',
};

const extractIdFromUrl = (url: string) => url.split('/')?.at(-1)?.split('.html')?.at(0);

export const OlxScraper: ScraperClass<RentalRecord> = class implements Scraper<RentalRecord> {
    readonly config: ScrapingConfig;

    constructor(config: ScrapingConfig) {
        this.config = config;
    }

    async isSourceUpdated(db: Db<RentalRecord>): Promise<boolean> {
        const response = await axios.get(`${BASE_URL}/${this.config.cityOfInterest}`);
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
                return true;
            }
        }
        return false;
    }

    async scrape(db: Db<RentalRecord>): Promise<void> {
        throw new Error('Method not implemented.');
    }
};
