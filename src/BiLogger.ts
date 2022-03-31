import fs from 'fs';
import { EOL } from 'os';
import chalk from 'chalk';
import { Logger } from './types';
import { tildify } from './helpers';

const createDateTimePrefix = () => {
    const date = new Date();
    const localeDateString = date.toLocaleDateString();
    const localeTimeString = date.toLocaleTimeString(undefined, { hour12: false });
    return `[${localeDateString} ${localeTimeString}]`;
};

const stdout = process.stdout;

export class BiLogger implements Logger {
    logFilePath: string;
    progress?: {
        format: string;
        value?: number;
        total?: number;
    };

    constructor(logFilePath: string) {
        this.logFilePath = tildify(logFilePath);
    }

    log(msg: string): void {
        const prefix = createDateTimePrefix();
        if (this.progress) {
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(`${chalk.cyan(prefix)} ${msg}${EOL}`);
            stdout.write(chalk.yellow(`${prefix} ${this.buildProgressMsg()}`));
        } else {
            stdout.write(`${EOL}${chalk.cyan(prefix)} ${msg}`);
        }
        fs.writeFile(this.logFilePath, `${prefix} ${msg}${EOL}`, { flag: 'a' }, (err) => {
            err && console.error('Error writing to log file:', err);
        });
    }

    logError(msg: string): void {
        const prefix = createDateTimePrefix();
        if (this.progress) {
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(`${chalk.red(prefix)} ${msg}${EOL}`);
            stdout.write(chalk.yellow(`${prefix} ${this.buildProgressMsg()}`));
        } else {
            stdout.write(`${EOL}${chalk.red(prefix)} ${msg}`);
        }
        fs.writeFile(this.logFilePath, `${prefix} ${msg}${EOL}`, { flag: 'a' }, (err) => {
            err && console.error('Error writing to log file:', err);
        });
    }

    startProgress(format: string, value?: number, total?: number): void {
        this.progress = { format, value, total };
        const prefix = createDateTimePrefix();
        stdout.write(chalk.yellow(`${EOL}${prefix} ${this.buildProgressMsg()}`));
    }

    updateProgress(value?: number, total?: number): void {
        if (this.progress) {
            if (value) {
                this.progress.value = value;
            }
            if (total) {
                this.progress.total = total;
            }
            const prefix = createDateTimePrefix();
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(chalk.yellow(`${prefix} ${this.buildProgressMsg()}`));
        }
    }

    endProgress(): void {
        delete this.progress;
    }

    private buildProgressMsg() {
        if (this.progress) {
            const { format, value, total } = this.progress;
            return format.replace('{value}', value?.toString() || '?').replace('{total}', total?.toString() || '?');
        }
    }
}
