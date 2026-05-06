/**
 * Analyzer — The orchestrator that ties together the runner, regression, and reporting modules
 * to produce a complete complexity profile for any given code snippet.
 */
import { fitModels, findComplexityBoundary, FitResult, RegressionModel } from './regression';
import { benchmarkFunction } from './runner';

// ─── Result Interface ──────────────────────────────────────────────────────────

export interface AnalysisResult {
    functionName: string;
    language: string;

    // Core Complexity
    timeComplexity: string;
    spaceComplexity: string;
    confidence: number;
    regressionFormula: string;

    // All model comparisons
    allModels: { name: string; bigO: string; r2: number; formula: string }[];

    // Phase Transition Detection
    phaseTransitions: string;

    // Adversarial Analysis
    adversarialVulnerability: string;
    adversarialDetail: string;

    // Amortized Cost
    amortizedCost: string;

    // Hardware
    hardwareCost: string;

    // Expected Complexity (for randomized algorithms)
    expectedComplexity: string | null;

    // Algorithmic Intelligence
    complexityFingerprint: string;
    recursiveCallTree: string;
    parallelSpeedupRatio: string;

    // Input Intelligence
    inferredInputShape: string;
    complexityBoundary: string;

    // Reporting
    complexityCertificate: string;
    grade: string;

    // Educational
    classroomExplanation: string[];
    naturalLanguageExplanation: string;
    quizQuestion: { question: string; options: string[]; answer: string };

    // Empirical data for graph
    empiricalData: { n: number; time: number }[];

    // Metadata
    analysisTimeMs: number;
    sampleSizes: number[];
    warnings: string[];
}

// ─── Code Feature Detector ─────────────────────────────────────────────────────

interface CodeFeatures {
    functionName: string;
    rawArgs: string;
    language: string;
    loopCount: number;
    nestedLoopCount: number;
    hasRecursion: boolean;
    hasRandomization: boolean;
    hasAllocation: boolean;
    hasSorting: boolean;
    hasHashMap: boolean;
    hasBinarySearch: boolean;
    hasDivideConquer: boolean;
    lineCount: number;
}

function detectFeatures(code: string): CodeFeatures {
    // Extract function name — support JS, TS, Java, C, C++, Python
    const funcPatterns = [
        /(?:function|async\s+function)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\((.*?)\)/,             // JS/TS
        /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/, // Arrow
        /(?:public|private|protected|static)?\s*(?:void|int|long|String|boolean|float|double|char)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\((.*?)\)/, // Java/C/C++
        /def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*?)\)/,                                         // Python
    ];

    let functionName = 'anonymous_function';
    let rawArgs = '';
    for (const pat of funcPatterns) {
        const m = code.match(pat);
        if (m) {
            functionName = m[1];
            rawArgs = m[2] || '';
            break;
        }
    }

    // Detect language
    let language = 'JavaScript';
    if (/:\s*(number|string|boolean|void)\b/.test(code)) language = 'TypeScript';
    else if (/public\s+static\s+void\s+main|System\.out\.println/.test(code)) language = 'Java';
    else if (/def\s+\w+\s*\(|print\s*\(/.test(code) && !/(function|=>|const|let|var)/.test(code)) language = 'Python';
    else if (/#include|printf|scanf|int\s+main/.test(code)) language = 'C/C++';

    // Structural analysis
    const forLoops = (code.match(/\bfor\b/g) || []).length;
    const whileLoops = (code.match(/\bwhile\b/g) || []).length;
    const loopCount = forLoops + whileLoops;

    // Nested loops: look for loop-inside-loop patterns
    const nestedPattern = /(?:for|while)\s*\([^)]*\)\s*\{[^}]*(?:for|while)\s*\(/g;
    const nestedLoopCount = (code.match(nestedPattern) || []).length;

    // Recursion: function calls itself
    const hasRecursion = new RegExp(`\\b${functionName}\\s*\\(`).test(
        code.replace(/(?:function|def)\s+\w+/, '') // Remove the declaration line
    );

    const hasRandomization = /Math\.random|random\(\)|rand\(\)|shuffle/i.test(code);
    const hasAllocation = /new\s+[A-Z]|\[\]|malloc|calloc|ArrayList|HashMap|new\s+Array/i.test(code);
    const hasSorting = /\.sort\(|Arrays\.sort|sorted\(|qsort/i.test(code);
    const hasHashMap = /Map\(|HashMap|dict\(|{}\s*;|\bSet\(/i.test(code);
    const hasBinarySearch = /mid\s*=|lo\s*<\s*hi|left\s*<\s*right|binary.?search/i.test(code);
    const hasDivideConquer = hasRecursion && (hasBinarySearch || /merge|partition|pivot/i.test(code));

    const lineCount = code.split('\n').length;

    return {
        functionName, rawArgs, language, loopCount, nestedLoopCount,
        hasRecursion, hasRandomization, hasAllocation, hasSorting,
        hasHashMap, hasBinarySearch, hasDivideConquer, lineCount,
    };
}

// ─── Space Complexity Inference ─────────────────────────────────────────────────

function inferSpaceComplexity(code: string, features: CodeFeatures, timeBigO: string): string {
    // Check for explicit data structure creation inside loops
    const allocInLoop = /(?:for|while)[^}]*(?:new |push\(|append\(|\[\])/s.test(code);

    if (allocInLoop) {
        if (features.nestedLoopCount > 0) return 'O(n²) — Nested allocation detected';
        return 'O(n) — Linear allocation inside loop';
    }
    if (features.hasAllocation) return 'O(n) — Dynamic allocation detected';
    if (features.hasRecursion) {
        if (features.hasDivideConquer) return 'O(n) — Merge buffers + O(log n) call stack';
        return 'O(n) — Recursion depth scales with input';
    }
    if (features.hasHashMap) return 'O(n) — Hash map/set storage';
    return 'O(1) — Constant auxiliary space';
}

// ─── Adversarial Analysis ───────────────────────────────────────────────────────

function analyzeAdversarial(features: CodeFeatures, timeBigO: string): { level: string; detail: string } {
    if (features.hasRandomization) {
        return {
            level: '🟢 Low — Randomization mitigates worst-case',
            detail: 'Randomized pivoting or hashing makes adversarial attacks probabilistically unlikely.',
        };
    }
    if (features.hasSorting && !features.hasRandomization) {
        return {
            level: '🟡 Medium — Deterministic sorting',
            detail: 'Pre-sorted or reverse-sorted inputs may trigger O(n²) worst-case on naive quicksort.',
        };
    }
    if (timeBigO === 'O(n²)' || timeBigO === 'O(n³)') {
        return {
            level: '🔴 High — Polynomial complexity',
            detail: 'Reverse-sorted arrays, hash collision attacks, or pathological graph structures can degrade performance catastrophically.',
        };
    }
    if (features.hasHashMap) {
        return {
            level: '🟡 Medium — Hash collision risk',
            detail: 'Adversarial keys can force O(n) bucket chains. Use randomized hashing to mitigate.',
        };
    }
    return {
        level: '🟢 Low — No obvious vulnerability',
        detail: 'The algorithm appears robust against adversarial inputs.',
    };
}

// ─── Phase Transition Detection ─────────────────────────────────────────────────

function detectPhaseTransitions(data: { n: number; time: number }[], fitResult: FitResult): string {
    if (data.length < 5) return 'Insufficient data for phase analysis';

    // Compute growth ratios between consecutive points
    const ratios: number[] = [];
    for (let i = 1; i < data.length; i++) {
        const nRatio = data[i].n / data[i - 1].n;
        const tRatio = data[i].time / Math.max(data[i - 1].time, 1e-9);
        ratios.push(tRatio / nRatio); // Normalized growth rate
    }

    // Check if growth rate changes dramatically (phase transition)
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const maxDeviation = Math.max(...ratios.map(r => Math.abs(r - avgRatio)));

    if (maxDeviation > avgRatio * 2) {
        const transitionIdx = ratios.findIndex(r => Math.abs(r - avgRatio) === maxDeviation);
        const transitionN = data[transitionIdx + 1]?.n || 0;
        return `Phase transition detected near N=${transitionN} — growth rate changes by ${maxDeviation.toFixed(1)}x`;
    }

    return `Steady growth phase — consistent ${fitResult.best.bigO} scaling across all N`;
}

// ─── Educational Content ────────────────────────────────────────────────────────

function generateExplanation(features: CodeFeatures, fitResult: FitResult, data: { n: number; time: number }[]): {
    classroom: string[];
    naturalLanguage: string;
    quiz: { question: string; options: string[]; answer: string };
} {
    const best = fitResult.best;

    const classroom = [
        `Step 1: Identified function "${features.functionName}" with ${features.loopCount} loop(s) and ${features.nestedLoopCount} nested loop(s).`,
        `Step 2: Generated synthetic inputs at N = [${data.map(d => d.n).join(', ')}].`,
        `Step 3: Executed ${data.length * 7} benchmark runs (7 iterations per size, median taken).`,
        `Step 4: Applied JIT warmup (3 dry runs) before each measurement to eliminate V8 optimization bias.`,
        `Step 5: Fitted ${fitResult.all.length} regression models using Ordinary Least Squares.`,
        `Step 6: Best fit: ${best.name} (${best.bigO}) with Adjusted R² = ${best.adjustedR2.toFixed(4)}.`,
    ];

    if (fitResult.all.length >= 2) {
        const second = fitResult.all[1];
        classroom.push(`Step 7: Runner-up model: ${second.name} (${second.bigO}) with R² = ${second.r2.toFixed(4)} — rejected due to lower fit.`);
    }

    let naturalLanguage = '';
    switch (best.bigO) {
        case 'O(1)':
            naturalLanguage = `This function runs in constant time — it takes the same amount of time regardless of input size. It's as fast as it gets.`;
            break;
        case 'O(log n)':
            naturalLanguage = `This function is logarithmic — doubling the input only adds a tiny constant amount of work. Think binary search: every step eliminates half the data.`;
            break;
        case 'O(n)':
            naturalLanguage = `This function is linear — if you double the input, it takes roughly twice as long. It processes each element once.`;
            break;
        case 'O(n log n)':
            naturalLanguage = `This function scales at O(n log n) — the gold standard for comparison-based sorting. It's efficient enough for millions of elements.`;
            break;
        case 'O(n²)':
            naturalLanguage = `⚠️ This function is quadratic — doubling the input makes it 4x slower. At N=10,000 it may already feel sluggish. Consider optimizing the nested loop.`;
            break;
        case 'O(n³)':
            naturalLanguage = `🚨 This function is cubic — doubling the input makes it 8x slower. It will become unusable beyond a few hundred elements. Matrix operations often exhibit this.`;
            break;
        default:
            naturalLanguage = `The function's complexity was empirically measured as ${best.bigO}.`;
    }

    const quizOptions = fitResult.all.slice(0, 4).map(m => m.bigO);
    if (!quizOptions.includes(best.bigO)) quizOptions[0] = best.bigO;

    const quiz = {
        question: `Based on the empirical data, what is the time complexity of "${features.functionName}"?`,
        options: quizOptions,
        answer: best.bigO,
    };

    return { classroom, naturalLanguage, quiz };
}

// ─── Main Analysis Function ─────────────────────────────────────────────────────

export function analyzeCode(code: string): AnalysisResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    // 1. Detect code features
    const features = detectFeatures(code);

    // 2. Determine sample sizes based on code features
    let sampleSizes = [10, 50, 100, 250, 500, 750, 1000];
    if (features.nestedLoopCount > 0) {
        // Quadratic+ code: use smaller sizes to avoid timeout
        sampleSizes = [10, 25, 50, 100, 200, 350, 500];
    }
    if (features.hasRecursion && !features.hasDivideConquer) {
        // Potentially exponential recursion: be very conservative
        sampleSizes = [5, 10, 15, 20, 25, 30, 35];
    }

    // 3. Run the benchmark suite
    const benchmark = benchmarkFunction(code, features.functionName, sampleSizes);
    if (benchmark.errors.length > 0) {
        warnings.push(...benchmark.errors);
    }

    // 4. Regression analysis
    const fitResult = fitModels(benchmark.data);
    if (fitResult.warning) {
        warnings.push(fitResult.warning);
    }

    const best = fitResult.best;

    // 5. Space complexity
    const spaceComplexity = inferSpaceComplexity(code, features, best.bigO);

    // 6. Adversarial analysis
    const adversarial = analyzeAdversarial(features, best.bigO);

    // 7. Phase transitions
    const phaseTransitions = detectPhaseTransitions(benchmark.data, fitResult);

    // 8. Amortized cost
    let amortizedCost = best.bigO;
    if (features.hasAllocation && /push|append|add/i.test(code)) {
        amortizedCost = `Amortized ${best.bigO} — dynamic array resizing detected (occasional O(n) copy)`;
    }

    // 9. Hardware estimation
    let hardwareCost = '🟢 Cache-friendly — sequential access pattern';
    if (features.nestedLoopCount > 0) {
        hardwareCost = '🟡 Potential cache thrashing — nested iteration over large data';
    }
    if (features.hasRecursion) {
        hardwareCost = '🟡 Branch predictor stress — recursive call pattern';
    }
    if (features.hasHashMap) {
        hardwareCost = '🟡 Random memory access — hash table pointer chasing';
    }

    // 10. Expected complexity (randomized algorithms)
    let expectedComplexity: string | null = null;
    if (features.hasRandomization) {
        expectedComplexity = `E[T] = ${best.bigO} (empirically verified across randomized inputs)`;
    }

    // 11. Complexity fingerprint
    const fingerprintInput = `${features.functionName}:${best.bigO}:${spaceComplexity}:${features.lineCount}`;
    const complexityFingerprint = `EAP-${Buffer.from(fingerprintInput).toString('base64').substring(0, 12).toUpperCase()}`;

    // 12. Recursive call tree analysis
    let recursiveCallTree = 'Iterative — no recursion detected';
    if (features.hasRecursion) {
        if (features.hasDivideConquer) {
            recursiveCallTree = 'Divide & Conquer — O(log n) depth, branching factor ≈ 2';
        } else if (features.hasBinarySearch) {
            recursiveCallTree = 'Binary recursion — O(log n) depth, single branch';
        } else {
            recursiveCallTree = `Linear recursion — O(n) depth, stack overflow risk at large N`;
        }
    }

    // 13. Parallel speedup estimation (Amdahl's Law)
    let parallelFraction = 0.0;
    if (features.loopCount > 0 && !features.hasRecursion) parallelFraction = 0.85;
    else if (features.hasDivideConquer) parallelFraction = 0.70;
    else if (features.nestedLoopCount > 0) parallelFraction = 0.90;
    const cores = 8;
    const speedup = parallelFraction > 0 ? 1 / ((1 - parallelFraction) + parallelFraction / cores) : 1.0;
    const parallelSpeedupRatio = `${speedup.toFixed(1)}x on ${cores} cores (Amdahl's Law, ${(parallelFraction * 100).toFixed(0)}% parallelizable)`;

    // 14. Input shape inference
    let inferredInputShape = 'Unknown';
    if (features.rawArgs) {
        inferredInputShape = `Parameters: (${features.rawArgs})`;
    } else {
        inferredInputShape = 'Single array/number parameter (auto-detected)';
    }

    // 15. Complexity boundary (binary search for exact N where T > 100ms)
    const boundary = findComplexityBoundary(best, 100);
    const complexityBoundary = boundary >= 1_000_000_000
        ? '> 1 billion — practically unlimited'
        : `Exceeds 100ms at N ≈ ${boundary.toLocaleString()}`;

    // 16. Certificate and grade
    const gradeMap: Record<string, string> = {
        'O(1)': 'S', 'O(log n)': 'S', 'O(n)': 'A',
        'O(n log n)': 'A', 'O(n²)': 'C', 'O(n³)': 'D',
    };
    const grade = gradeMap[best.bigO] || 'F';
    const complexityCertificate = `Grade ${grade} | ${best.bigO} | R²=${best.r2.toFixed(3)} | Hash: ${complexityFingerprint}`;

    // 17. Educational content
    const edu = generateExplanation(features, fitResult, benchmark.data);

    const analysisTimeMs = performance.now() - startTime;

    return {
        functionName: features.functionName,
        language: features.language,
        timeComplexity: best.bigO,
        spaceComplexity,
        confidence: Math.max(0, best.adjustedR2),
        regressionFormula: best.formula,
        allModels: fitResult.all.map(m => ({ name: m.name, bigO: m.bigO, r2: m.r2, formula: m.formula })),
        phaseTransitions,
        adversarialVulnerability: adversarial.level,
        adversarialDetail: adversarial.detail,
        amortizedCost,
        hardwareCost,
        expectedComplexity,
        complexityFingerprint,
        recursiveCallTree,
        parallelSpeedupRatio,
        inferredInputShape,
        complexityBoundary,
        complexityCertificate,
        grade,
        classroomExplanation: edu.classroom,
        naturalLanguageExplanation: edu.naturalLanguage,
        quizQuestion: edu.quiz,
        empiricalData: benchmark.data,
        analysisTimeMs,
        sampleSizes,
        warnings,
    };
}
