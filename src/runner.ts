/**
 * Sandbox Runner — Executes user code safely in an isolated VM context.
 *
 * Uses Node.js `vm` module with strict timeouts. Strips imports, exports,
 * and type annotations to handle TypeScript and ES module code. For non-JS
 * languages (Java, Python, C), signals the caller to fall back to static analysis.
 */
import * as vm from 'vm';

export interface SandboxResult {
    durationMs: number;
    error: string | null;
}

/**
 * Strip import/export statements, TypeScript type annotations, and decorators
 * so the vm module can actually parse and run the code.
 */
function sanitizeForVM(code: string): string {
    let cleaned = code;

    // Remove import statements (ES modules and CommonJS require)
    cleaned = cleaned.replace(/^\s*import\s+.*?[;\n]/gm, '');
    cleaned = cleaned.replace(/^\s*const\s+.*?=\s*require\s*\(.*?\)\s*;?/gm, '');

    // Remove export keywords (keep the declarations)
    cleaned = cleaned.replace(/^\s*export\s+(default\s+)?/gm, '');

    // Remove interface/type/enum declarations
    cleaned = cleaned.replace(/^\s*(?:interface|type|enum)\s+\w+[\s\S]*?\n\}/gm, '');

    // Remove type annotations on variable declarations, parameters, and returns:
    // 1. Parameter type annotations: (x: Type, y: Type) -> (x, y)
    cleaned = cleaned.replace(/(\(|,\s*)(\w+)\s*:\s*[^,)=]+/g, '$1$2');

    // 2. Return type annotations: ): Type { -> ) {
    cleaned = cleaned.replace(/\)\s*:\s*[^{=]+(?=\s*[{=])/g, ')');

    // 3. Variable type annotations: let x: Type = ... -> let x = ...
    cleaned = cleaned.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^;=]+/g, '$1 $2');

    // Remove generic type parameters from function calls/declarations: function foo<T>(...)
    cleaned = cleaned.replace(/<\s*[A-Za-z_$][A-Za-z0-9_$]*\s*>/g, '');

    // Remove access modifiers (public, private, protected, readonly)
    cleaned = cleaned.replace(/\b(public|private|protected|readonly)\s+/g, '');

    return cleaned;
}

/**
 * Check if code is a language that the Node.js VM can potentially execute.
 */
export function isExecutableLanguage(code: string): boolean {
    // Java
    if (/public\s+static\s+void\s+main|System\.out\.println|class\s+\w+\s*\{/.test(code) &&
        /\b(int|String|void|boolean|float|double|long)\b/.test(code)) {
        return false;
    }
    // Python
    if (/def\s+\w+\s*\(/.test(code) && !/(function|=>|const|let|var)/.test(code)) {
        return false;
    }
    // C/C++
    if (/#include|printf|scanf|int\s+main\s*\(/.test(code)) {
        return false;
    }
    // Shell scripts / Bash / PowerShell / Batch
    if (/\b(do|done|then|fi|elif)\b/.test(code) || /#!\/(bin|usr)/.test(code)) {
        return false;
    }
    if (/\b(Get-Command|Write-Output|Get-Process|Write-Host|Get-ChildItem)\b/i.test(code)) {
        return false;
    }
    if (/\b(echo\s+off|setlocal|exit\s+\/b)\b/i.test(code)) {
        return false;
    }
    return true;
}

/**
 * Generate appropriate input data for a given size N.
 */
export function generateInput(code: string, n: number): any[] {
    // Detect if function takes a string
    if (/:\s*string|param.*string|str\s*[,)]/i.test(code)) {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        let str = '';
        for (let i = 0; i < n; i++) {str += chars[Math.floor(Math.random() * chars.length)];}
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
    if (/\(\s*n\s*\)|\(\s*n\s*:|\(\s*n\s*,/.test(code) && !/arr|list|array/i.test(code)) {
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
 * Execute a JS/TS function in a sandboxed VM context and measure time.
 * Returns durationMs = -1 on error.
 */
export function runInSandbox(
    code: string,
    functionName: string,
    args: any[],
    timeoutMs: number = 2000
): SandboxResult {
    const sanitized = sanitizeForVM(code);

    const sandbox: Record<string, any> = {
        __args: args,
        __durationMs: 0,
        Array,
        Math,
        parseInt,
        parseFloat,
        String,
        Number,
        Boolean,
        Object,
        JSON,
        Map,
        Set,
        Date,
        RegExp,
        Error,
        Infinity,
        NaN,
        undefined,
        isNaN,
        isFinite,
        console: { log: () => {}, error: () => {}, warn: () => {} },
        performance: { now: () => performance.now() },
    };

    const scriptCode = `
        ${sanitized}

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
            error: null,
        };
    } catch (err: any) {
        const message = err?.message || String(err);
        if (message.includes('Script execution timed out')) {
            return { durationMs: -1, error: `Timeout after ${timeoutMs}ms` };
        }
        return { durationMs: -1, error: message };
    }
}

/**
 * Run a full benchmark suite for a function across multiple input sizes.
 * Returns (N, medianTime) pairs suitable for regression.
 */
export function benchmarkFunction(
    code: string,
    functionName: string,
    sizes: number[],
    iterations: number = 7
): { data: { n: number; time: number }[]; errors: string[] } {
    const data: { n: number; time: number }[] = [];
    const errors: string[] = [];

    // Early exit if code is not executable in Node.js
    if (!isExecutableLanguage(code)) {
        errors.push('Non-JavaScript language detected. Using structural analysis instead of runtime profiling.');
        return { data, errors };
    }

    for (const n of sizes) {
        const args = generateInput(code, n);
        const timings: number[] = [];

        for (let i = 0; i < iterations; i++) {
            const result = runInSandbox(code, functionName, args);
            if (result.error) {
                if (!errors.includes(result.error)) {
                    errors.push(`N=${n}: ${result.error}`);
                }
                break;
            }
            if (result.durationMs >= 0) {
                timings.push(result.durationMs);
            }
        }

        if (timings.length >= 3) {
            timings.sort((a, b) => a - b);
            const trimmed = timings.slice(1, -1);
            const median = trimmed[Math.floor(trimmed.length / 2)];
            data.push({ n, time: median });
        }
    }

    return { data, errors };
}
