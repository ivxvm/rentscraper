import fs from 'fs';
import chalk from 'chalk';
import { Command } from 'commander';
import { BiLogger } from './BiLogger';
import { JsonDb } from './JsonDb';
import { OlxScraper } from './OlxScraper';
import { RentalRecord } from './types';
import { tildify } from './helpers';

const program = new Command();

program.name('rentscraper').description('Rental property scraper for OLX and Airbnb').version('1.0.0');

program
    .option('-l, --logfile <file>', 'file to write logs to', '~/rentscraper-log.txt')
    .option('-db, --dbfile <file>', 'file to store data in', '~/rentscraper-db.json');

program
    .command('scrape')
    .description('scrape new data from sites into database')
    .argument('<city>', 'city of interest')
    .option("-qc, --quick-check', 'quick check for updates, don't scrape if data wasn't updated")
    .action(async (city: string) => {
        const options = program.optsWithGlobals();
        const logger = new BiLogger(options.logfile);
        const db = new JsonDb<RentalRecord>(options.dbfile);
        db.load();
        process.on('exit', () => {
            logger.log('Received exit signal');
            logger.log('Saving database');
            logger.log('');
            db.save();
        });
        const scraper = new OlxScraper({
            logger,
            config: {
                cityOfInterest: city,
                quickCheckUpdates: options.quickCheck,
                skipExistingRecords: true,
                waitSelectorTimeoutMs: 5000,
                pageQueryIntervalMs: 10_000,
            },
        });
        let scrapedRecordsCount = 0;
        scraper.on('recordScraped', () => {
            if (++scrapedRecordsCount % 5 == 0) {
                logger.log('Saving database');
                db.save();
            }
        });
        await scraper.scrape(db);
        process.exit();
    });

program
    .command('digest')
    .description('return latest rental records')
    .argument('<n>', 'number of records to return')
    .action((n: string) => {
        const options = program.optsWithGlobals();
        const db = new JsonDb<RentalRecord>(options.dbfile);
        db.load();
        const latestRecords = db.take(
            Number.parseInt(n),
            (a, b) => Date.parse(b.firstScrapedAt) - Date.parse(a.firstScrapedAt)
        );
        for (const record of latestRecords) {
            const prefix = chalk.cyan(
                `[${new Date(record.firstScrapedAt).toLocaleString(undefined, { hour12: false })}]`
            );
            console.log(`${prefix} ${record.url}`);
        }
    });

program
    .command('clear')
    .description('clear all data and logs')
    .action(() => {
        const options = program.optsWithGlobals();
        const logFilePath = tildify(options.logfile);
        const dbFilePath = tildify(options.dbfile);
        if (fs.existsSync(logFilePath)) {
            fs.rmSync(logFilePath);
        }
        if (fs.existsSync(dbFilePath)) {
            fs.rmSync(dbFilePath);
        }
    });

program.parse();
