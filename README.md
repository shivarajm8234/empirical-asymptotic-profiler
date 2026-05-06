# Empirical Asymptotic Profiler (EAP)

**Automatic Big-O Complexity Discovery via Runtime Profiling and Structural Analysis.**

The Empirical Asymptotic Profiler (EAP) is a production-grade VS Code extension that determines the computational complexity of code snippets using a dual-tier analysis engine. Unlike traditional static analyzers, EAP combines secure sandbox execution with deep structural pattern matching to provide high-confidence complexity reports across multiple programming languages.

## Core Analysis Engine

### 1. Dual-Tier Analysis Strategy
- **Empirical Mode (JavaScript/TypeScript):** Executes code in a secure Node.js `vm` sandbox across variable input sizes (N). It applies Ordinary Least Squares (OLS) regression to execution traces to find the best-fitting complexity model.
- **Structural Mode (Java/Python/C/C++):** For non-JavaScript languages, the engine performs deep AST-like analysis of loop nesting depths, recursion patterns, and algorithmic signatures (e.g., Divide & Conquer, Binary Search) to derive complexity.

### 2. Statistical Regression Suite
- **Multi-Model Fitting:** Fits data against $O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, $O(N^3)$, and $O(2^N)$.
- **Adjusted R² Scoring:** Uses adjusted R² to penalize model overfitting and ensure the most accurate complexity class is selected.
- **Theoretical Curve Generation:** Generates high-fidelity synthetic growth curves for structural analysis, allowing for model comparison and visualization even when runtime profiling is unavailable.

### 3. Algorithmic & Input Intelligence
- **Complexity Boundary Solver:** Predicts the precise input size where a function will exceed 100ms, helping developers identify performance bottlenecks before they hit production.
- **Adversarial Risk Profiling:** Identifies algorithms vulnerable to pathological inputs (e.g., worst-case scenarios for deterministic sorting).
- **Space Complexity Inference:** Detects heap allocation patterns, recursion depth scaling, and auxiliary storage growth.
- **Parallel Speedup Estimation:** Applies Amdahl's Law to estimate theoretical performance gains on multi-core hardware.

### 4. Educational Features (Classroom Mode)
- **Step-by-Step Derivations:** Provides a transparent breakdown of how the engine arrived at a specific Big-O conclusion.
- **Natural Language Explanations:** Translates complex Big-O notation into plain English summaries.
- **Interactive Pop Quizzes:** Automatically generates multiple-choice questions based on the analyzed code to reinforce learning.

## Supported Languages

| Language | Analysis Mode | Features |
| --- | --- | --- |
| JavaScript / TypeScript | Empirical + Structural | Full Sandbox Execution, Regression Fitting, JIT Warmup |
| Java | Structural | Pattern Matching, Nesting Depth, Theoretical Curves |
| Python | Structural | Recursion Analysis, Pattern Detection, Theoretical Curves |
| C / C++ | Structural | Loop Depth Analysis, Theoretical Curves |

## Getting Started

1. **Installation:** Install the provided `.vsix` file through the VS Code Extensions menu.
2. **Selection:** Highlight a function or a block of code in your editor.
3. **Execution:** Press `Ctrl+P` (or `Cmd+P` on macOS) to trigger the analysis.
4. **Report:** An interactive dashboard will open, displaying growth curves, model comparisons, and complexity certificates.

## Technical Architecture

- **Sandbox:** Node.js `vm` module with strict timeouts and sanitized global context.
- **Mathematical Engine:** Custom OLS Regression library with Adjusted R² metrics.
- **Visualization:** Integrated Chart.js for rendering empirical and theoretical growth curves.

## License

MIT

---
Developed by [shivarajm8234](https://github.com/shivarajm8234)
