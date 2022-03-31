import { AbortablePromise, FetchOptions, JSDOM, ResourceLoader } from 'jsdom';
import Abortable from 'promise-abortable';
import * as constants from '../constants';
import { Logger } from '../types';

export const mockMissingApis = (dom: JSDOM) => {
    Object.defineProperty(dom.window, 'matchMedia', {
        writable: true,
        value: (query: any) => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => {},
        }),
    });
};

export class CachingResourceLoader extends ResourceLoader {
    logger: Logger;
    cache: { [url: string]: string };

    constructor(logger: Logger) {
        super({
            strictSSL: true,
            userAgent: constants.USER_AGENT,
        });
        this.logger = logger;
        this.cache = {};
    }

    fetch(url: string, options: FetchOptions): AbortablePromise<Buffer> | null {
        if (this.cache[url]) {
            return new Abortable((resolve) => resolve(Buffer.from(this.cache[url])));
        }
        this.logger.log(`Fetching resource: ${url}`);
        const abortablePromise = super.fetch(url, options);
        abortablePromise?.then((buffer) => {
            this.logger.log(`Caching resource: ${url}`);
            this.cache[url] = buffer.toString();
            return buffer;
        });
        return abortablePromise;
    }
}
