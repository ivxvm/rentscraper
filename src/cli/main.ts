import { Command } from 'commander';
import * as actions from './actions';

const program = new Command();

program.name('rentscraper').description('Rental property scraper for OLX and Airbnb').version('1.0.0');

program
    .option('-l, --logfile <file>', 'file to write logs to', '~/rentscraper-log.txt')
    .option('-db, --dbfile <file>', 'file to store data in', '~/rentscraper-db.json');

program
    .command('scrape')
    .description('scrape new data from sites into database')
    .argument('<source>', 'site to scrape data from')
    .argument('<city>', 'city of interest')
    .option("-qc, --quick-check', 'quick check for updates, don't scrape if data wasn't updated")
    .action(actions.scrape);

program
    .command('digest')
    .description('return latest rental records')
    .argument('<n>', 'number of records to return')
    .action(actions.digest);

program.command('sources').description('list all available sources').action(actions.printSources);

program.command('clear').description('clear all data and logs').action(actions.clear);

program.parse();
