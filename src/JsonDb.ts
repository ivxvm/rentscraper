import fs from 'fs';
import { Db, RentalRecord } from './types';

export class JsonDb implements Db<RentalRecord> {
    static DB_FILE_PATH = './db.json';
    data: { [key: string]: RentalRecord };

    constructor() {
        this.data = {};
    }

    load(): void {
        this.data = JSON.parse(fs.readFileSync(JsonDb.DB_FILE_PATH).toString());
    }

    save(): void {
        fs.writeFileSync(JsonDb.DB_FILE_PATH, JSON.stringify(this.data, null, 4));
    }

    get(id: string): RentalRecord | undefined {
        return this.data[id];
    }

    set(id: string, record: RentalRecord): void {
        this.data[id] = record;
    }
}
