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
}

export type ScraperConfig = {
    skipExistingRecords: boolean;
    cityOfInterest: string;
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
    isSourceUpdated(db: Db<T>): Promise<boolean>;
    scrape(db: Db<T>): Promise<void>;
}

export type RentalKind = 'House' | 'Appartment';

export type RentalRecord = {
    source: string;
    url: string;
    kind?: RentalKind;
    title: string;
    description: string;
    price: string;
    phone?: string;
    roomCount?: number;
    floorCount?: number;
    postedAt: string;
    firstScrapedAt: Date;
    lastScrapedAt: Date;
};
