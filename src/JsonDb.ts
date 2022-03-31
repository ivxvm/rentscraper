import fs from 'fs';
import { tildify } from './helpers';
import { Db } from './types';

export class JsonDb<T> implements Db<T> {
    dbFilePath: string;
    data: { [key: string]: T };

    constructor(filePath: string) {
        this.dbFilePath = tildify(filePath);
        this.data = {};
        if (!fs.existsSync(this.dbFilePath)) {
            fs.writeFileSync(this.dbFilePath, '{}');
        }
    }

    load(): void {
        this.data = JSON.parse(fs.readFileSync(this.dbFilePath).toString());
    }

    save(): void {
        fs.writeFileSync(this.dbFilePath, JSON.stringify(this.data, null, 4));
    }

    get(id: string): T | undefined {
        return this.data[id];
    }

    set(id: string, record: T): void {
        this.data[id] = record;
    }
}
