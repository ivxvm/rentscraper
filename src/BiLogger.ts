import fs from 'fs';
import { EOL } from 'os';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import { Logger } from './types';

const createDateTimePrefix = () => {
    const date = new Date();
    const localeDateString = date.toLocaleDateString();
    const localeTimeString = date.toLocaleTimeString(undefined, { hour12: false });
    return `[${localeDateString} ${localeTimeString}]`;
};

export class BiLogger implements Logger {
    logFilePath: string;
    progressBarByFormatString: { [key: string]: cliProgress.SingleBar };

    constructor(logFilePath: string) {
        this.logFilePath = logFilePath;
        this.progressBarByFormatString = {};
    }

    log(msg: string): void {
        const prefix = createDateTimePrefix();
        console.log(`${chalk.cyan(prefix)} ${msg}`);
        fs.writeFile(this.logFilePath, `${prefix} ${msg}${EOL}`, { flag: 'a' }, (err) => {
            err && console.error('Error writing to log file:', err);
        });
    }

    logError(msg: string): void {
        const prefix = createDateTimePrefix();
        const prefixedMsg = `${prefix} ${msg}${EOL}`;
        console.error(chalk.red(prefixedMsg));
        fs.writeFile(this.logFilePath, prefixedMsg, { flag: 'a' }, (err) => {
            err && console.error('Error writing to log file:', err);
        });
    }

    logProgress(format: string, value: number, total: number): void {
        const existingBar = this.progressBarByFormatString[format];
        if (existingBar) {
            existingBar.update(value);
            if (value >= total) {
                existingBar.stop();
                delete this.progressBarByFormatString[format];
            }
        } else {
            const bar = new cliProgress.SingleBar({ format: `${format}${EOL}` });
            bar.start(total, value);
            this.progressBarByFormatString[format] = bar;
        }
    }
}
