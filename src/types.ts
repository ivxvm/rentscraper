export interface Logger {
    log(msg: string): void;
    logError(msg: string): void;
    logProgress(format: string, value: number, total: number): void;
}

export interface Db<T> {
    load(): void;
    save(): void;
    get(id: string): T | undefined;
    set(id: string, record: T): void;
}

export type ScraperConfig = {
    cityOfInterest: string;
};

export type ScraperContext = {
    config: ScraperConfig;
    logger: Logger;
};

export interface ScraperClass<T> {
    new (context: ScraperContext): Scraper<T>;
}

export interface Scraper<T> {
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
    phone: string;
    roomCount?: number;
    floorCount?: number;
    postedAt: string;
    firstScrapedAt: Date;
    lastScrapedAt: Date;
};
