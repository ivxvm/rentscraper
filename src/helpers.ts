import path from 'path';
import os from 'os';

export const tildify = (filePath: string): string =>
    path.resolve(filePath[0] === '~' ? path.join(os.homedir(), filePath.slice(1)) : filePath);
