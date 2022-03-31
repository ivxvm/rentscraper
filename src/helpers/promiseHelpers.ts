export const waitForCondition = (timeoutMs: number, intervalMs: number, condition: () => boolean) =>
    new Promise<void>((resolve, reject) => {
        let timePassed = 0;
        const intervalHandle = setInterval(() => {
            timePassed += intervalMs;
            if (condition()) {
                clearInterval(intervalHandle);
                resolve();
                return;
            }
            if (timePassed >= timeoutMs) {
                clearInterval(intervalHandle);
                reject(new Error(`waitForCondition timed out while waiting for ${condition.toString()}`));
                return;
            }
        }, intervalMs);
    });
