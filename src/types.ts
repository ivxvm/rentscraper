import { EventEmitter } from 'events';

export interface Logger {
    log(msg: string): void;
    logError(msg: string): void;
    startProgress(format: string, value?: number, total?: number): void;
    updateProgress(value?: number, total?: number): void;
    endProgress(): void;
}

export interface Db<T> {
    load(): void;
    save(): void;
    get(id: string): T | undefined;
    set(id: string, record: T): void;
    take(n: number, sort: (a: T, b: T) => number): void;
}

export type ScraperConfig = {
    query: string;
    quickCheckUpdates: boolean;
    skipExistingRecords: boolean;
    waitSelectorTimeoutMs: number;
    pageQueryIntervalMs: number;
};

export type ScraperContext = {
    config: ScraperConfig;
    logger: Logger;
};

export interface ScraperClass<T> {
    new (context: ScraperContext): Scraper<T>;
}

export interface Scraper<T> extends EventEmitter {
    scrape(db: Db<T>): Promise<void>;
}

export type RentalKind = 'House' | 'Appartment';

export type RentalRecord = {
    source: string;
    url: string;
    kind?: RentalKind;
    title: string;
    description?: string;
    price: string;
    phone?: string;
    guestCount?: number;
    roomCount?: number;
    bedCount?: number;
    bathCount?: number;
    floorCount?: number;
    postedAt?: string;
    firstScrapedAt: string;
    lastScrapedAt: string;
};
