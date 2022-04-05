import fs from 'fs';
import chalk from 'chalk';
import { Command } from 'commander';
import { BiLogger } from '../BiLogger';
import { JsonDb } from '../JsonDb';
import { RentalRecord } from '../types';
import { tildify } from '../helpers';
import { OlxScraper, AirbnbScraper } from '../scrapers';

export async function scrape(this: Command, source: string, city: string) {
    const options = this.optsWithGlobals();
    const logger = new BiLogger(options.logfile);
    const db = new JsonDb<RentalRecord>(options.dbfile);
    db.load();
    process.on('exit', () => {
        logger.log('Received exit signal');
        logger.log('Saving database');
        console.log('');
        db.save();
    });
    if (source !== 'olx' && source !== 'airbnb') {
        console.error(chalk.italic(chalk.red(`Unknown source: ${source}`)));
        console.log('');
        printSources();
        process.exit();
    }
    const scraper = (() => ({
        olx: () =>
            new OlxScraper({
                logger,
                config: {
                    query: city,
                    quickCheckUpdates: options.quickCheck,
                    skipExistingRecords: true,
                    waitSelectorTimeoutMs: 5000,
                    pageQueryIntervalMs: 10_000,
                },
            }),
        airbnb: () =>
            new AirbnbScraper({
                logger,
                config: {
                    query: city,
                    quickCheckUpdates: options.quickCheck,
                    skipExistingRecords: true,
                    waitSelectorTimeoutMs: 5000,
                    pageQueryIntervalMs: 10_000,
                },
            }),
    }))()[source]();
    let scrapedRecordsCount = 0;
    scraper.on('recordScraped', () => {
        if (++scrapedRecordsCount % 5 == 0) {
            logger.log('Saving database');
            db.save();
        }
    });
    await scraper.scrape(db);
    process.exit();
}

export async function digest(this: Command, n: string) {
    const options = this.optsWithGlobals();
    const db = new JsonDb<RentalRecord>(options.dbfile);
    db.load();
    const latestRecords = db.take(
        Number.parseInt(n),
        (a, b) => Date.parse(b.firstScrapedAt) - Date.parse(a.firstScrapedAt)
    );
    for (const record of latestRecords) {
        const prefix = chalk.cyan(`[${new Date(record.firstScrapedAt).toLocaleString(undefined, { hour12: false })}]`);
        console.log(`${prefix} ${record.url}`);
    }
}

export function printSources() {
    console.log(chalk.underline('Available sources') + ':');
    console.log(chalk.bold('olx'));
    console.log(chalk.bold('airbnb'));
}

export async function clear(this: Command) {
    const options = this.optsWithGlobals();
    const logFilePath = tildify(options.logfile);
    const dbFilePath = tildify(options.dbfile);
    if (fs.existsSync(logFilePath)) {
        fs.rmSync(logFilePath);
    }
    if (fs.existsSync(dbFilePath)) {
        fs.rmSync(dbFilePath);
    }
}
