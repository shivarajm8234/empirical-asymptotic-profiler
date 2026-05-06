/**
 * Sandbox Runner — Executes user code safely in an isolated VM context.
 *
 * Uses Node.js `vm` module with strict timeouts to prevent infinite loops,
 * memory leaks, or malicious code from crashing the extension host.
 */
import * as vm from 'vm';

export interface SandboxResult {
    durationMs: number;
    memoryDeltaBytes: number;
    error: string | null;
}

/**
 * Generate appropriate input data for a given size N.
 * Analyzes code to infer what kind of input the function expects.
 */
export function generateInput(code: string, n: number): any[] {
    const lowerCode = code.toLowerCase();

    // Detect if function takes a string
    if (/:\s*string|param.*string|str\s*[,)]/i.test(code)) {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let str = '';
        for (let i = 0; i < n; i++) str += chars[Math.floor(Math.random() * chars.length)];
        return [str];
    }

    // Detect if function takes a 2D array / matrix
    if (/matrix|grid|2d|rows.*cols|board/i.test(code)) {
        const size = Math.floor(Math.sqrt(n));
        const matrix: number[][] = [];
        for (let i = 0; i < size; i++) {
            matrix.push(Array.from({ length: size }, () => Math.floor(Math.random() * 100)));
        }
        return [matrix];
    }

    // Detect if function takes a single number (e.g., fibonacci(n))
    if (/\(\s*n\s*\)|\(\s*n\s*:/.test(code) && !/arr|list|array/i.test(code)) {
        return [n];
    }

    // Detect if function takes two arrays
    if (/arr1.*arr2|a\s*,\s*b\s*[:\)]|first.*second/i.test(code)) {
        const arr1 = Array.from({ length: n }, () => Math.floor(Math.random() * 1000));
        const arr2 = Array.from({ length: n }, () => Math.floor(Math.random() * 1000));
        return [arr1, arr2];
    }

    // Default: single array of random integers
    const arr = Array.from({ length: n }, () => Math.floor(Math.random() * 10000));
    return [arr];
}

/**
 * Execute a JS function in a sandboxed VM context and measure time + memory.
 * Returns -1 for duration on error. Enforces a hard timeout.
 */
export function runInSandbox(
    code: string,
    functionName: string,
    args: any[],
    timeoutMs: number = 2000
): SandboxResult {
    // Build a sandbox with performance API, Math, console, and Array
    const sandbox: Record<string, any> = {
        __args: args,
        __durationMs: 0,
        __memBefore: 0,
        __memAfter: 0,
        Array,
        Math,
        parseInt,
        parseFloat,
        String,
        Number,
        Boolean,
        Object,
        JSON,
        console: { log: () => {}, error: () => {}, warn: () => {} }, // Silence console
        performance: { now: () => performance.now() },
    };

    // Build the script: define the function, warm up, then measure
    const scriptCode = `
        ${code}

        // Warmup: run 3 times to let V8 optimize
        for (let __w = 0; __w < 3; __w++) {
            try { ${functionName}(...__args); } catch(e) {}
        }

        // Measure
        const __start = performance.now();
        ${functionName}(...__args);
        const __end = performance.now();
        __durationMs = __end - __start;
    `;

    try {
        const context = vm.createContext(sandbox);
        const script = new vm.Script(scriptCode, { filename: 'eap-sandbox.js' });
        script.runInContext(context, { timeout: timeoutMs });

        return {
            durationMs: sandbox.__durationMs,
            memoryDeltaBytes: 0, // vm context doesn't expose memory; we approximate elsewhere
            error: null,
        };
    } catch (err: any) {
        const message = err?.message || String(err);
        // Differentiate timeout vs other errors
        if (message.includes('Script execution timed out')) {
            return { durationMs: -1, memoryDeltaBytes: 0, error: `Timeout after ${timeoutMs}ms` };
        }
        return { durationMs: -1, memoryDeltaBytes: 0, error: message };
    }
}

/**
 * Run a full benchmark suite for a function across multiple input sizes.
 * Returns (N, medianTime) pairs suitable for regression.
 *
 * @param code         The raw source code containing the function
 * @param functionName The name of the function to benchmark
 * @param sizes        Array of input sizes to test
 * @param iterations   Number of runs per size (for median calculation)
 */
export function benchmarkFunction(
    code: string,
    functionName: string,
    sizes: number[],
    iterations: number = 7
): { data: { n: number; time: number }[]; errors: string[] } {
    const data: { n: number; time: number }[] = [];
    const errors: string[] = [];

    for (const n of sizes) {
        const args = generateInput(code, n);
        const timings: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const result = runInSandbox(code, functionName, args);
            if (result.error) {
                if (!errors.includes(result.error)) {
                    errors.push(`N=${n}: ${result.error}`);
                }
                break; // Don't keep retrying if there's an error at this size
            }
            if (result.durationMs >= 0) {
                timings.push(result.durationMs);
            }
        }

        if (timings.length >= 3) {
            // Trim outliers: remove top and bottom values
            timings.sort((a, b) => a - b);
            const trimmed = timings.slice(1, -1);
            const median = trimmed[Math.floor(trimmed.length / 2)];
            data.push({ n, time: median });
        }
    }

    return { data, errors };
}
