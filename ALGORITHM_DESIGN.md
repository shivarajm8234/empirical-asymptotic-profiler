# Algorithm Design, Pseudocode, and Tools & Techniques

This document provides a comprehensive overview of the design, architectural strategies, core algorithms (with pseudocode), and the mathematical formulations powering the **Empirical Asymptotic Profiler (EAP)**.

---

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Dual-Tier Complexity Analysis Strategy](#2-dual-tier-complexity-analysis-strategy)
3. [Empirical Profiling Engine & Sandbox](#3-empirical-profiling-engine--sandbox)
   - [Pseudocode: VM Sanitization](#pseudocode-vm-sanitization)
   - [Pseudocode: Input Data Generation](#pseudocode-input-data-generation)
   - [Pseudocode: Benchmarking Flow](#pseudocode-benchmarking-flow)
4. [Statistical Regression Engine](#4-statistical-regression-engine)
   - [Mathematical Formulations](#mathematical-formulations)
   - [Pseudocode: OLS Regression & Multi-Model Fitting](#pseudocode-ols-regression--multi-model-fitting)
   - [Pseudocode: Complexity Boundary Solver](#pseudocode-complexity-boundary-solver)
5. [Structural (Static) Analysis Engine](#5-structural-static-analysis-engine)
   - [Pseudocode: Loop Nesting Depth Solver](#pseudocode-loop-nesting-depth-solver)
   - [Pseudocode: Static Complexity Inference](#pseudocode-static-complexity-inference)
6. [Advanced Analysis & Heuristics](#6-advanced-analysis--heuristics)
   - [Phase Transition Detection](#phase-transition-detection)
   - [Space Complexity Inference](#space-complexity-inference)
   - [Adversarial Risk & Parallel Speedup](#adversarial-risk--parallel-speedup)
7. [Tools, Libraries & Technologies Used](#7-tools-libraries--technologies-used)

---

## 1. System Architecture Overview

The Empirical Asymptotic Profiler integrates runtime profiling with static structural analysis to evaluate the computational complexity ($O(N)$) of user-provided code.

```mermaid
graph TD
    A[User Code Selection] --> B[Code Validator]
    B -- Invalid --> C[Error Report]
    B -- Valid --> D[Feature Detector]
    D --> E{Is JS/TS/Executable?}
    E -- Yes --> F[Empirical Mode: Run Sandbox Benchmarks]
    E -- No --> G[Structural Mode: Static Analysis]
    F --> H[Regression Engine: Fit Models & Calc R²]
    H --> I{Is R² Valid & Worst-Case Aligned?}
    I -- Yes --> J[Select Best Empirical Fit]
    I -- No / Low R² --> G
    G --> K[Compute Nesting Depth, Patterns & Space O(N)]
    J --> L[Consolidate Metrics & Heuristics]
    K --> L
    L --> M[Generate Educational Explanations]
    L --> N[Invoke Ollama pop-quiz fallback]
    L --> O[Render Webview Dashboard]
```

---

## 2. Dual-Tier Complexity Analysis Strategy

To support multiple languages while offering highly accurate complexity measurements, EAP utilizes a **Dual-Tier Analysis Engine**:

1. **Empirical Mode (JavaScript/TypeScript):** 
   - Code runs in an isolated sandbox (`vm` module).
   - Gathers execution time metrics over varying input sizes ($N$).
   - Fits empirical curves to theoretical runtime profiles ($O(1), O(\log N), O(N), O(N \log N), O(N^2), O(N^3)$) using linear regression on transformed coordinates.
2. **Structural Mode (Java/Python/C/C++/Shell scripts):** 
   - Triggered when runtime execution is unavailable or when worst-case complexity overrides average-case empirical results (e.g. quicksort sorting pre-sorted data resulting in $O(N^2)$ statically, but profiling average data shows $O(N \log N)$).
   - Parses code patterns, loop nesting levels, recursion branching ratios, and core signatures.

---

## 3. Empirical Profiling Engine & Sandbox

### Sanitization and Isolation
To run TS/JS code within Node's `vm` module, EAP strips ES module imports, TypeScript type annotations, generic parameters, and access modifiers. It executes code in a context with a strict execution timeout to prevent infinite loops from freezing VS Code.

### Pseudocode: VM Sanitization
```javascript
Function sanitizeForVM(code):
    cleaned = code
    // Remove imports and requires
    cleaned = replace(cleaned, /import\s+.*?[;\n]/g, "")
    cleaned = replace(cleaned, /const\s+.*?=\s*require\s*\(.*?\)\s*;?/g, "")
    // Remove export keyword
    cleaned = replace(cleaned, /export\s+(default\s+)?/g, "")
    // Remove interfaces, types, and enums
    cleaned = replace(cleaned, /(interface|type|enum)\s+\w+[\s\S]*?\n\}/g, "")
    // Remove type annotations on parameters
    cleaned = replace(cleaned, /(\(|,\s*)(\w+)\s*:\s*[^,)=]+/g, "$1$2")
    // Remove return type annotations
    cleaned = replace(cleaned, /\)\s*:\s*[^{=]+(?=\s*[{=])/g, ")")
    // Remove variable type annotations
    cleaned = replace(cleaned, /(const|let|var)\s+(\w+)\s*:\s*[^;=]+/g, "$1 $2")
    // Remove generic parameters and access modifiers
    cleaned = replace(cleaned, /<\s*[A-Za-z_$][A-Za-z0-9_$]*\s*>/g, "")
    cleaned = replace(cleaned, /(public|private|protected|readonly)\s+/g, "")
    Return cleaned
```

### Pseudocode: Input Data Generation
Before executing the functions, the engine inspects the code signatures to generate valid input configurations:
```javascript
Function generateInput(code, n):
    If code matches /:\s*string|param.*string|str\s*[,)]/:
        // String input: generate a random string of length n
        Return [randomStringOfLength(n)]
    
    Else if code matches /matrix|grid|2d|rows.*cols|board/:
        // 2D Array input: generate a square matrix of size sqrt(n) x sqrt(n)
        size = floor(sqrt(n))
        Return [random2DMatrix(size, size)]
        
    Else if code matches /\(\s*n\s*\)|\(\s*n\s*:|\(\s*n\s*,/ and does not match /arr|list|array/:
        // Number input: e.g. fibonacci(n)
        Return [n]
        
    Else if code matches /arr1.*arr2|a\s*,\s*b\s*[:\)]|first.*second/:
        // Double array input
        Return [randomArrayOfLength(n), randomArrayOfLength(n)]
        
    Else:
        // Default: 1D array of random integers of length n
        Return [randomArrayOfLength(n)]
```

### Pseudocode: Benchmarking Flow
To mitigate JIT compiler warm-up spikes and execution noise, the sandbox performs **dry-runs** and calculates the **trimmed median** execution time.
```javascript
Function benchmarkFunction(code, functionName, sizes):
    dataPoints = []
    errors = []
    
    If not isExecutableLanguage(code):
        errors.push("Non-JS language. Switching to structural analysis.")
        Return (dataPoints, errors)
        
    For each n in sizes:
        args = generateInput(code, n)
        timings = []
        
        For iteration from 1 to 7:
            // runInSandbox handles sanitization, timeout context, and JIT warmups:
            // 1. context = vm.createContext(sanitizedGlobals)
            // 2. Perform 3 warmup iterations
            // 3. Measure duration = performance.now() differences
            result = runInSandbox(code, functionName, args, timeoutMs=2000)
            
            If result.error:
                errors.push("N=" + n + ": " + result.error)
                Break // abort benchmark for this size
            Else:
                timings.push(result.durationMs)
                
        If length(timings) >= 3:
            Sort(timings)
            // Trim outliers (remove minimum and maximum)
            trimmedTimings = timings.slice(1, -1)
            medianTime = trimmedTimings[floor(length(trimmedTimings) / 2)]
            dataPoints.push({ n: n, time: medianTime })
            
    Return (dataPoints, errors)
```

---

## 4. Statistical Regression Engine

### Mathematical Formulations

The regression engine fits a set of data points $(N_i, T_i)$ against multiple complexity models using **Ordinary Least Squares (OLS)**. Since complexity curves are non-linear, the engine transforms the independent variable $N$ based on the complexity class shape $f(N)$:

| Complexity Class | Transforming Function $f(N)$ | Formulated Line equation |
| :--- | :--- | :--- |
| **Constant $O(1)$** | $f(N) = 1$ | $T = m \cdot 1 + c$ |
| **Logarithmic $O(\log N)$** | $f(N) = \log_2(N)$ | $T = m \cdot \log_2(N) + c$ |
| **Linear $O(N)$** | $f(N) = N$ | $T = m \cdot N + c$ |
| **Linearithmic $O(N \log N)$** | $f(N) = N \log_2(N)$ | $T = m \cdot (N \log_2(N)) + c$ |
| **Quadratic $O(N^2)$** | $f(N) = N^2$ | $T = m \cdot N^2 + c$ |
| **Cubic $O(N^3)$** | $f(N) = N^3$ | $T = m \cdot N^3 + c$ |

For each model, the slope ($m$) and intercept ($c$) are calculated as follows:
$$m = \frac{k\sum_{i=1}^k (f(N_i) \cdot T_i) - \sum_{i=1}^k f(N_i) \sum_{i=1}^k T_i}{k\sum_{i=1}^k (f(N_i))^2 - (\sum_{i=1}^k f(N_i))^2}$$

$$c = \frac{\sum_{i=1}^k T_i - m \sum_{i=1}^k f(N_i)}{k}$$

#### Goodness of Fit ($R^2$ and Adjusted $R^2$)
To evaluate the quality of the fit, the sum of squared residuals ($SS_{\text{res}}$) and total sum of squares ($SS_{\text{tot}}$) are calculated:
$$SS_{\text{res}} = \sum_{i=1}^k (T_i - \hat{T}_i)^2$$
$$SS_{\text{tot}} = \sum_{i=1}^k (T_i - \bar{T})^2$$
$$R^2 = 1 - \frac{SS_{\text{res}}}{SS_{\text{tot}}}$$

To prevent overfitting to higher-order polynomials (e.g. fitting linear growth into a quadratic formula with a small coefficient), EAP uses the **Adjusted $R^2$** value, penalizing complexity:
$$R^2_{\text{adjusted}} = 1 - \frac{(1 - R^2)(k - 1)}{k - 2}$$
*(Where $k$ is the number of data samples, with 1 predictor degrees of freedom).*

---

### Pseudocode: OLS Regression & Multi-Model Fitting

```javascript
Function olsRegression(x, y, transformFn):
    n = length(x)
    If n < 3:
        Return { slope: 0, intercept: 0, r2: -Infinity, adjustedR2: -Infinity }
        
    tx = map(x, transformFn)
    sumTx = sum(tx)
    sumY = sum(y)
    sumTxY = sum(map2(tx, y, (txi, yi) => txi * yi))
    sumTx2 = sum(map(tx, txi => txi * txi))
    
    denom = n * sumTx2 - (sumTx * sumTx)
    If abs(denom) < 1e-15:
        Return { slope: 0, intercept: sumY/n, r2: -Infinity, adjustedR2: -Infinity }
        
    slope = (n * sumTxY - sumTx * sumY) / denom
    intercept = (sumY - slope * sumTx) / n
    
    meanY = sumY / n
    predictedY = map(x, xi => slope * transformFn(xi) + intercept)
    residuals = map2(y, predictedY, (yi, pyi) => yi - pyi)
    ssRes = sum(map(residuals, r => r * r))
    ssTot = sum(map(y, yi => (yi - meanY) * (yi - meanY)))
    
    r2 = (ssTot == 0) ? (ssRes == 0 ? 1 : -Infinity) : (1 - (ssRes / ssTot))
    adjustedR2 = 1 - ((1 - r2) * (n - 1)) / (n - 2)
    
    Return { slope, intercept, r2, adjustedR2, predictFn: (n) => slope * transformFn(n) + intercept }
```

---

### Pseudocode: Complexity Boundary Solver
Predicts the boundary input size ($N$) where the algorithm will exceed a budget of 100ms.
```javascript
Function findComplexityBoundary(bestModel, timeBudgetMs = 100):
    lo = 1
    hi = 1,000,000,000
    
    // Execute binary search to identify the crossover point
    For iteration from 1 to 60:
        mid = floor((lo + hi) / 2)
        expectedTime = bestModel.predictFn(mid)
        
        If expectedTime > timeBudgetMs:
            hi = mid
        Else:
            lo = mid + 1
            
    Return lo
```

---

## 5. Structural (Static) Analysis Engine

When benchmarking is not possible, EAP defaults to structural static analysis.

### Pseudocode: Loop Nesting Depth Solver
Calculates the loop nesting depth dynamically based on language structure:
```javascript
Function computeNestingDepth(code, languageId):
    lines = splitLines(code)
    maxNesting = 0
    
    If languageId is "python":
        loopIndentStack = []
        For each line in lines:
            If line is empty or line starts with "#": Continue
            indent = getLeadingSpacesCount(line)
            
            // Pop out of scope loops
            While length(loopIndentStack) > 0 and loopIndentStack.top() >= indent:
                loopIndentStack.pop()
                
            If line starts with "for" or "while" and line ends with ":":
                loopIndentStack.push(indent)
                maxNesting = max(maxNesting, length(loopIndentStack))
                
    Else if languageId is "shellscript":
        currentDepth = 0
        For each line in lines:
            If line starts with "for" or "while" or "until":
                currentDepth++
                maxNesting = max(maxNesting, currentDepth)
            If line starts with "done":
                currentDepth = max(0, currentDepth - 1)
                
    Else: // C-style, Java, JS, TS, C++
        currentLoopDepth = 0
        braceStack = [] // boolean flags indicating if brace opens a loop
        
        For each line in lines:
            If line is comment: Continue
            isLoopHeader = line matches /\b(for|while|do)\b|\.(forEach|map)\b/
            
            For each char in line:
                If char == '{':
                    If isLoopHeader:
                        currentLoopDepth++
                        braceStack.push(true)
                        maxNesting = max(maxNesting, currentLoopDepth)
                    Else:
                        braceStack.push(false)
                Else if char == '}':
                    isLoopBrace = braceStack.pop()
                    If isLoopBrace:
                        currentLoopDepth = max(0, currentLoopDepth - 1)
                        
    Return maxNesting
```

---

### Pseudocode: Static Complexity Inference
Matches structural features against heuristic complexity bands:
```javascript
Function inferComplexityStatically(features, code):
    heuristics = []
    
    // 1. Check domain patterns (e.g. training loops or matrix multiplication signatures)
    If code matches /\.fit\(|\.train\(|Adam\(|SGD/:
         heuristics.push({ magnitude: LINEAR, confidence: 0.85 })
    If code matches /matmul|dot\s*\(|@\s*[a-zA-Z]/:
         heuristics.push({ magnitude: CUBIC, confidence: 0.85 })
    If code matches /\.sort\(|Arrays\.sort|sorted\(/:
         heuristics.push({ magnitude: LINEARITHMIC, confidence: 0.85 })
         
    // 2. Loop structural patterns
    If features.maxNesting == 1:
        hasHalving = code matches /\/=\s*2|>>=\s*1|floor\(.+\/2\)/
        heuristics.push({ 
            magnitude: hasHalving ? LOG : LINEAR, 
            confidence: 0.90 
        })
    Else if features.maxNesting == 2:
        mag = (length(features.relevantParams) >= 2) ? LINEAR : QUADRATIC
        heuristics.push({ magnitude: mag, confidence: 0.85 })
    Else if features.maxNesting >= 3:
        heuristics.push({ magnitude: CUBIC, confidence: 0.80 })
        
    // 3. Recursion heuristics
    If features.hasRecursion:
        If features.hasDivideConquer and (features.loopCount > 0 or features.maxNesting > 0):
            heuristics.push({ magnitude: LINEARITHMIC, confidence: 0.95 })
        Else if features.recursionCalls >= 2 and code does not match /mid|partition|\/2/:
            heuristics.push({ magnitude: EXPONENTIAL, confidence: 0.90 })
        Else if code matches /\/2|>>1|mid/ or features.hasBinarySearch:
            heuristics.push({ magnitude: LOG, confidence: 0.90 })
        Else:
            heuristics.push({ magnitude: LINEAR, confidence: 0.85 })
            
    If length(heuristics) == 0:
        Return { bigO: "O(1)", confidence: 0.95 }
        
    SortDescendingByMagnitude(heuristics)
    best = heuristics[0]
    avgConfidence = sum(all confidence) / length(heuristics)
    
    Return { bigO: best.bigO, confidence: avgConfidence }
```

---

## 6. Advanced Analysis & Heuristics

### Phase Transition Detection
Identifies shifts in algorithmic performance scaling (e.g. cache boundaries, branch predictor failure zones, or algorithms shifting from $O(N)$ to $O(N^2)$).

$$\text{Growth Ratio}_i = \frac{T_i / T_{i-1}}{N_i / N_{i-1}}$$

If the deviation of any sample's growth ratio exceeds two times the average ratio, a phase transition boundary is flagged at that coordinate.

```javascript
Function detectPhaseTransitions(data, bigO):
    If length(data) < 5: Return "Insufficient data"
    
    ratios = []
    For i from 1 to length(data) - 1:
        nRatio = data[i].n / data[i-1].n
        tRatio = data[i].time / max(data[i-1].time, 1e-9)
        ratios.push(tRatio / nRatio)
        
    avgRatio = mean(ratios)
    maxDeviation = max_element(map(ratios, r => abs(r - avgRatio)))
    
    If maxDeviation > avgRatio * 2:
        idx = findIndex(ratios, r => abs(r - avgRatio) == maxDeviation)
        Return "Phase transition detected near N=" + data[idx+1].n
        
    Return "Steady growth - consistent " + bigO + " scaling"
```

### Space Complexity Inference
Predicts auxiliary space consumption by checking stack depth and dynamic allocations:
- **Nested loop allocation** $\rightarrow O(N^2)$
- **Linear allocations / hash maps / list push actions inside standard loops** $\rightarrow O(N)$
- **Divide and conquer call stacks** $\rightarrow O(N)$ (due to merge buffers) or $O(\log N)$
- **Linear recursion** $\rightarrow O(N)$ call stack allocation

### Adversarial Risk & Parallel Speedup
- **Adversarial Risk:** Flagged as high for polynomial algorithms ($O(N^2)$ and $O(N^3)$) and deterministic sorting functions where sorted inputs degrade performance (e.g. quicksort with static pivoting).
- **Parallel Speedup:** Employs **Amdahl's Law** to estimate speedup ratio across $M=8$ hardware cores:
  $$S = \frac{1}{(1 - P) + \frac{P}{M}}$$
  - Simple loops: $P = 85\%$ parallelizable.
  - Nested loops: $P = 90\%$ parallelizable.
  - Divide-and-conquer: $P = 70\%$ parallelizable.

---

## 7. Tools, Libraries & Technologies Used

The extension is constructed on a modern typescript development stack, prioritizing speed, sandbox security, and mathematical precision:

1. **TypeScript & Node.js:** The core runtime for code extraction and compiler-like token scan regexes.
2. **VS Code Extension API:** Enables deep integration with active editors, handling text selection, progress indicators, and webview rendering.
3. **Node.js `vm` (Virtual Machine):** Provides an isolated, timeout-guarded context to run arbitrary JavaScript blocks.
4. **Chart.js:** An HTML5 canvas charting engine loaded directly within the output Webview, enabling the presentation of growth curves.
5. **Ollama Integration:** Uses a fallback chain (`qwen2.5-coder:3b` $\rightarrow$ `deepseek-coder:1.3b` $\rightarrow$ `llama3.2:1b` $\rightarrow$ custom prompt fallback) over `http://localhost:11434` to generate pop quiz questions.
6. **Ordinary Least Squares (OLS) Linearization:** A customized numerical engine that fits non-linear functions without external math library dependencies.
