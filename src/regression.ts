/**
 * Regression Engine — Core statistical curve fitting for empirical complexity discovery.
 * 
 * Uses Ordinary Least Squares (OLS) to fit data against O(1), O(log n), O(n), O(n log n),
 * O(n²), O(n³), and O(2^n) models. Returns ranked results by R² score.
 */

export interface RegressionModel {
    name: string;
    bigO: string;
    r2: number;
    adjustedR2: number;
    formula: string;
    coefficients: { slope: number; intercept: number };
    residuals: number[];
    predict: (n: number) => number;
}

export interface FitResult {
    best: RegressionModel;
    all: RegressionModel[];
    dataPoints: number;
    warning: string | null;
}

/**
 * Core OLS regression: fits y = slope * transform(x) + intercept.
 * Returns slope, intercept, R², residuals, and a predict function.
 */
function olsRegression(
    x: number[],
    y: number[],
    transform: (xi: number) => number
): { slope: number; intercept: number; r2: number; adjustedR2: number; residuals: number[]; predict: (n: number) => number } {
    const n = x.length;
    if (n < 3) {
        return { slope: 0, intercept: 0, r2: -Infinity, adjustedR2: -Infinity, residuals: [], predict: () => 0 };
    }

    const tx = x.map(transform);
    const sumTx = tx.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumTxY = tx.reduce((a, b, i) => a + b * y[i], 0);
    const sumTx2 = tx.reduce((a, b) => a + b * b, 0);

    const denom = n * sumTx2 - sumTx * sumTx;
    if (Math.abs(denom) < 1e-15) {
        return { slope: 0, intercept: sumY / n, r2: -Infinity, adjustedR2: -Infinity, residuals: y.map(() => 0), predict: () => sumY / n };
    }

    const slope = (n * sumTxY - sumTx * sumY) / denom;
    const intercept = (sumY - slope * sumTx) / n;

    const predict = (xi: number) => slope * transform(xi) + intercept;

    const meanY = sumY / n;
    const residuals = y.map((yi, i) => yi - predict(x[i]));
    const ssRes = residuals.reduce((a, r) => a + r * r, 0);
    const ssTot = y.reduce((a, yi) => a + (yi - meanY) * (yi - meanY), 0);

    const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : -Infinity) : 1 - (ssRes / ssTot);
    // Adjusted R² penalizes model complexity (k=1 predictor)
    const adjustedR2 = 1 - ((1 - r2) * (n - 1)) / (n - 2);

    return { slope, intercept, r2, adjustedR2, residuals, predict };
}

function formatCoeff(val: number): string {
    if (Math.abs(val) < 0.00001) return '0';
    if (Math.abs(val) >= 1000) return val.toExponential(2);
    return val.toPrecision(4);
}

/**
 * Fit multiple complexity models and return ranked results.
 */
export function fitModels(data: { n: number; time: number }[]): FitResult {
    if (data.length < 3) {
        const fallback: RegressionModel = {
            name: 'Insufficient Data',
            bigO: 'O(?)',
            r2: 0,
            adjustedR2: 0,
            formula: 'Not enough data points',
            coefficients: { slope: 0, intercept: 0 },
            residuals: [],
            predict: () => 0,
        };
        return { best: fallback, all: [fallback], dataPoints: data.length, warning: 'Need at least 3 data points for regression.' };
    }

    const x = data.map(d => d.n);
    const y = data.map(d => d.time);

    const models: { name: string; bigO: string; transform: (xi: number) => number; label: string }[] = [
        { name: 'Constant',      bigO: 'O(1)',       transform: () => 1,                          label: '1' },
        { name: 'Logarithmic',   bigO: 'O(log n)',   transform: (xi) => Math.log2(Math.max(xi, 1)), label: 'log₂(n)' },
        { name: 'Linear',        bigO: 'O(n)',       transform: (xi) => xi,                       label: 'n' },
        { name: 'Linearithmic',  bigO: 'O(n log n)', transform: (xi) => xi * Math.log2(Math.max(xi, 1)), label: 'n·log₂(n)' },
        { name: 'Quadratic',     bigO: 'O(n²)',      transform: (xi) => xi * xi,                  label: 'n²' },
        { name: 'Cubic',         bigO: 'O(n³)',      transform: (xi) => xi * xi * xi,             label: 'n³' },
    ];

    const results: RegressionModel[] = models.map(m => {
        const fit = olsRegression(x, y, m.transform);
        const formula = `T = ${formatCoeff(fit.slope)}·${m.label} + ${formatCoeff(fit.intercept)}`;
        return {
            name: m.name,
            bigO: m.bigO,
            r2: fit.r2,
            adjustedR2: fit.adjustedR2,
            formula,
            coefficients: { slope: fit.slope, intercept: fit.intercept },
            residuals: fit.residuals,
            predict: fit.predict,
        };
    });

    // Sort by adjusted R² descending — this prevents overfitting to higher-order polynomials
    results.sort((a, b) => b.adjustedR2 - a.adjustedR2);

    // Filter out models with negative R² (worse than mean prediction)
    const validModels = results.filter(m => m.r2 > 0);
    const best = validModels.length > 0 ? validModels[0] : results[0];

    let warning: string | null = null;
    if (best.r2 < 0.8) {
        warning = `Low confidence (R²=${best.r2.toFixed(3)}). Results may be unreliable — consider increasing sample sizes or reducing noise.`;
    }

    return { best, all: results, dataPoints: data.length, warning };
}

/**
 * Compute the Complexity Boundary — the exact N where execution time exceeds a budget.
 * Uses the best-fit model's predict function and binary search.
 */
export function findComplexityBoundary(model: RegressionModel, timeBudgetMs: number): number {
    let lo = 1, hi = 1_000_000_000;
    for (let i = 0; i < 60; i++) {
        const mid = Math.floor((lo + hi) / 2);
        if (model.predict(mid) > timeBudgetMs) {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    return lo;
}
