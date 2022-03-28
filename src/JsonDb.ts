import fs from 'fs';
import { Db } from './types';

export class JsonDb<T> implements Db<T> {
    static DB_FILE_PATH = './db.json';
    data: { [key: string]: T };

    constructor() {
        this.data = {};
    }

    load(): void {
        this.data = JSON.parse(fs.readFileSync(JsonDb.DB_FILE_PATH).toString());
    }

    save(): void {
        fs.writeFileSync(JsonDb.DB_FILE_PATH, JSON.stringify(this.data, null, 4));
    }

    get(id: string): T | undefined {
        return this.data[id];
    }

    set(id: string, record: T): void {
        this.data[id] = record;
    }
}
