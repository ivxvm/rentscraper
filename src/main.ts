import { BiLogger } from './BiLogger';
import { JsonDb } from './JsonDb';
import { OlxScraper } from './OlxScraper';
import { RentalRecord } from './types';

(async () => {
    const logger = new BiLogger('./log.txt');
    const db = new JsonDb<RentalRecord>();
    db.load();
    process.on('exit', () => {
        logger.log('Received exit signal');
        logger.log('Saving database');
        db.save();
    });
    const scraper = new OlxScraper({
        logger,
        config: {
            cityOfInterest: 'kanev',
            skipExistingRecords: true,
            waitSelectorTimeoutMs: 5000,
            pageQueryIntervalMs: 1000,
        },
    });
    let scrapedRecordsCount = 0;
    scraper.on('recordScraped', () => {
        if (++scrapedRecordsCount % 5 == 0) {
            logger.log('Saving database');
            db.save();
        }
    });
    if (await scraper.isSourceUpdated(db)) {
        await scraper.scrape(db);
        process.exit();
    }
})();
