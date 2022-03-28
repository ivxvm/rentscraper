export interface Db<T> {
    load(): void;
    save(): void;
    get(id: string): T | undefined;
    set(id: string, record: T): void;
}

export interface Scraper<T> {
    isSourceUpdated(db: Db<T>): Promise<boolean>;
    scrape(db: Db<T>): Promise<void>;
}

export type RentalKind = 'House' | 'Appartment';

export type RentalRecord = {
    source: string;
    title: string;
    price: string;
    phone: string;
    kind?: RentalKind;
    roomCount?: number;
    floorCount?: number;
};
