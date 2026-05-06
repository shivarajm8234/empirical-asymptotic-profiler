# Empirical Asymptotic Profiler (EAP) 🚀

**Auto-Discover Big-O Complexity via Real-World Execution & Statistical Regression.**

The **Empirical Asymptotic Profiler (EAP)** is a high-performance VS Code extension designed to move beyond theoretical Big-O derivation. Instead of guessing, EAP **executes** your code in a secure sandbox, gathers high-precision timing data, and applies **Ordinary Least Squares (OLS) Regression** to discover the true computational complexity of your functions.

![Complexity Analysis Preview](https://raw.githubusercontent.com/shivarajm8234/empirical-asymptotic-profiler/main/preview.png) *(Placeholder)*

## 🌟 Core Features

### 1. Empirical Regression Engine
- **Statistical Curve Fitting:** Automatically fits execution traces against $O(1)$, $O(\log N)$, $O(N)$, $O(N \log N)$, $O(N^2)$, and $O(N^3)$ models.
- **Adjusted $R^2$ Confidence:** Provides a rigorous statistical confidence score (0-100%) for every analysis.
- **Outlier Rejection:** Uses median-of-median filtering and JIT-warmup dry runs to eliminate background noise.

### 2. Deep Algorithmic Intelligence
- **Complexity Fingerprinting:** Generates a unique cryptographic signature of a function's performance profile to detect regressions.
- **Space Complexity Inference:** Detects heap allocations, recursion depth scaling, and data structure growth.
- **Parallel Speedup Estimator:** Uses Amdahl's Law to predict theoretical speedup on multi-core hardware.

### 3. Input & Adversarial Intelligence
- **Auto-Input Generator:** Infers required parameter shapes (Arrays, Matrices, Strings) and generates randomized test datasets.
- **Complexity Boundary Detection:** Predicts the exact input size ($N$) where your function will exceed 100ms and risk freezing the UI.
- **Adversarial Vulnerability:** Identifies algorithms susceptible to pathological inputs (e.g., sorted arrays for QuickSort).

### 4. Classroom Mode (Pedagogical Tools)
- **Natural Language Explanations:** Explains complexity in plain English for students.
- **Step-by-Step Derivations:** Shows exactly how the profiler arrived at its conclusion.
- **Interactive Pop Quizzes:** Tests your knowledge with dynamic multiple-choice questions based on the analyzed code.

## 🚀 Getting Started

1. **Installation:** Install the `.vsix` file via VS Code Extensions.
2. **Usage:** Highlight any function in your editor.
3. **Analyze:** Press **`Ctrl+P`** (or `Cmd+P` on Mac).
4. **Result:** View the rich, interactive dashboard with scatter plots and certificates.

## 🛠 Technical Architecture

- **Sandbox:** Node.js \`vm\` module with strict timeouts for safe execution.
- **Math:** Custom OLS Regression library with Adjusted $R^2$ scoring.
- **Visuals:** Chart.js integration for real-time empirical growth curves.

## 📄 License

MIT

---
Developed with ❤️ by [shivarajm8234](https://github.com/shivarajm8234)
