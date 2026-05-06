import * as vscode from 'vscode';
import { analyzeCode, AnalysisResult } from './analyzer';

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('empirical-asymptotic-profiler.analyze', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('EAP: No active text editor found.');
			return;
		}

		const selection = editor.selection;
		const code = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);

		if (!code.trim()) {
			vscode.window.showErrorMessage('EAP: No code found to analyze.');
			return;
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "EAP: Profiling complexity...",
			cancellable: false
		}, async () => {
			const result = analyzeCode(code);
			showResultWebview(context, result);
		});
	});

	context.subscriptions.push(disposable);
}

function showResultWebview(context: vscode.ExtensionContext, result: AnalysisResult) {
	const panel = vscode.window.createWebviewPanel(
		'eapResult',
		`EAP: ${result.functionName} -> ${result.timeComplexity}`,
		vscode.ViewColumn.Beside,
		{ enableScripts: true }
	);

	panel.webview.html = getWebviewContent(result);
}

function getWebviewContent(result: AnalysisResult) {
	const confidencePercent = (result.confidence * 100).toFixed(1);
	const gradeColors: Record<string, string> = {
		'S': '#00e676', 'A': '#76ff03', 'B': '#8bc34a', 'C': '#ffc107', 'D': '#ff5722', 'F': '#f44336',
	};
	const gradeColor = gradeColors[result.grade] || '#ccc';
	const modeLabel = result.analysisMode === 'empirical' ? 'Empirical (runtime profiling)' : 'Structural (static analysis)';

	const modelComparisonRows = result.allModels
		.map(m => {
			const isBest = m.bigO === result.timeComplexity;
			const r2Color = m.r2 > 0.9 ? '#00e676' : m.r2 > 0.7 ? '#ffc107' : '#f44336';
			return `<tr style="${isBest ? 'background: rgba(0,122,204,0.15);' : ''}">
				<td>${isBest ? '> ' : ''}${m.name}</td>
				<td><code>${m.bigO}</code></td>
				<td style="color: ${r2Color}">${m.r2.toFixed(4)}</td>
				<td style="font-size:0.85em;opacity:0.8">${m.formula}</td>
			</tr>`;
		}).join('');

	const warningBlock = result.warnings.length > 0
		? `<div class="card warning-card">
			<h2>Warnings</h2>
			<ul>${result.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
		</div>`
		: '';

	const chartTitle = result.analysisMode === 'empirical' ? 'Empirical Growth Curve' : 'Theoretical Growth Curve (Structural Analysis)';
	const chartLabel = result.analysisMode === 'empirical' ? 'Measured (median)' : 'Theoretical ' + result.timeComplexity;
	const chartColor = result.analysisMode === 'empirical' ? '#007acc' : '#ff9800';

	const chartBlock = result.empiricalData.length > 0
		? `<div class="card">
			<h2>${chartTitle}</h2>
			<p style="margin:0 0 6px;font-size:0.9em;opacity:0.8"><strong>Best fit:</strong> ${result.regressionFormula}</p>
			<div class="chart-container">
				<canvas id="chart"></canvas>
			</div>
		</div>`
		: '';

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>EAP Analysis</title>
	<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
	<style>
		* { box-sizing: border-box; }
		body {
			font-family: var(--vscode-font-family);
			padding: 24px;
			color: var(--vscode-editor-foreground);
			background-color: var(--vscode-editor-background);
			line-height: 1.6;
		}
		.header {
			display: flex;
			align-items: center;
			gap: 16px;
			margin-bottom: 20px;
			border-bottom: 2px solid var(--vscode-panel-border);
			padding-bottom: 16px;
		}
		.header h1 {
			margin: 0;
			font-size: 1.4em;
			color: var(--vscode-textLink-foreground);
		}
		.grade-badge {
			font-size: 1.8em;
			font-weight: 900;
			padding: 6px 16px;
			border-radius: 8px;
			color: #000;
			background: ${gradeColor};
			flex-shrink: 0;
		}
		.big-o {
			font-size: 2.2em;
			font-weight: 900;
			font-family: var(--vscode-editor-font-family);
			color: var(--vscode-textLink-foreground);
		}
		.subtitle {
			font-size: 0.9em;
			opacity: 0.7;
		}
		.mode-badge {
			display: inline-block;
			padding: 2px 8px;
			border-radius: 3px;
			font-size: 0.8em;
			font-weight: 600;
			background: ${result.analysisMode === 'empirical' ? 'rgba(0,230,118,0.15)' : 'rgba(255,193,7,0.15)'};
			color: ${result.analysisMode === 'empirical' ? '#00e676' : '#ffc107'};
			border: 1px solid ${result.analysisMode === 'empirical' ? 'rgba(0,230,118,0.3)' : 'rgba(255,193,7,0.3)'};
		}
		.card {
			background-color: var(--vscode-editorWidget-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 8px;
			padding: 16px;
			margin-bottom: 16px;
		}
		.warning-card {
			border-color: #ffc107;
			border-width: 2px;
		}
		.card h2 {
			margin: 0 0 12px 0;
			font-size: 1.1em;
			color: var(--vscode-editorInfo-foreground);
			border-bottom: 1px solid var(--vscode-panel-border);
			padding-bottom: 6px;
		}
		.metric {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 6px 0;
			border-bottom: 1px solid rgba(128,128,128,0.15);
		}
		.metric:last-child { border-bottom: none; }
		.metric-label {
			font-weight: 600;
			color: var(--vscode-descriptionForeground);
			flex: 1;
			min-width: 160px;
		}
		.metric-value {
			font-family: var(--vscode-editor-font-family);
			background: var(--vscode-textCodeBlock-background);
			padding: 3px 8px;
			border-radius: 4px;
			flex: 2;
			text-align: right;
			font-size: 0.92em;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 0.92em;
		}
		th, td { padding: 6px 8px; text-align: left; }
		th { border-bottom: 1px solid var(--vscode-panel-border); opacity: 0.7; }
		td { border-bottom: 1px solid rgba(128,128,128,0.1); }
		code { font-family: var(--vscode-editor-font-family); }
		.chart-container {
			position: relative;
			height: 280px;
			width: 100%;
			margin: 8px 0;
		}
		ul { padding-left: 20px; margin: 6px 0; }
		li { margin-bottom: 4px; }
		.quiz-answer {
			display: none;
			margin-top: 8px;
			padding: 8px;
			background: rgba(0,122,204,0.1);
			border-radius: 4px;
		}
		.quiz-btn {
			padding: 6px 16px;
			border: 1px solid var(--vscode-button-border);
			background: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border-radius: 4px;
			cursor: pointer;
			margin-top: 8px;
		}
	</style>
</head>
<body>
	<div class="header">
		<span class="grade-badge">${result.grade}</span>
		<div>
			<h1>Empirical Asymptotic Profiler</h1>
			<div><span class="big-o">${result.timeComplexity}</span></div>
			<div class="subtitle">
				${result.functionName}() &middot; ${result.language} &middot; ${confidencePercent}% confidence &middot; ${result.analysisTimeMs.toFixed(0)}ms
				&middot; <span class="mode-badge">${modeLabel}</span>
			</div>
		</div>
	</div>

	${warningBlock}

	${chartBlock}

	<div class="card">
		<h2>Model Comparison</h2>
		<table>
			<thead><tr><th>Model</th><th>Big-O</th><th>R²</th><th>Formula</th></tr></thead>
			<tbody>${modelComparisonRows}</tbody>
		</table>
	</div>

	<div class="card">
		<h2>Core Complexity Profile</h2>
		<div class="metric">
			<span class="metric-label">Time Complexity</span>
			<span class="metric-value">${result.timeComplexity}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Space Complexity</span>
			<span class="metric-value">${result.spaceComplexity}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Phase Transitions</span>
			<span class="metric-value">${result.phaseTransitions}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Amortized Cost</span>
			<span class="metric-value">${result.amortizedCost}</span>
		</div>
	</div>

	<div class="card">
		<h2>Adversarial Analysis</h2>
		<div class="metric">
			<span class="metric-label">Vulnerability Level</span>
			<span class="metric-value">${result.adversarialVulnerability}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Detail</span>
			<span class="metric-value">${result.adversarialDetail}</span>
		</div>
		${result.expectedComplexity ? `
		<div class="metric">
			<span class="metric-label">Expected Complexity</span>
			<span class="metric-value">${result.expectedComplexity}</span>
		</div>
		` : ''}
	</div>

	<div class="card">
		<h2>Algorithmic Intelligence</h2>
		<div class="metric">
			<span class="metric-label">Fingerprint</span>
			<span class="metric-value">${result.complexityFingerprint}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Recursive Call Tree</span>
			<span class="metric-value">${result.recursiveCallTree}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Parallel Speedup</span>
			<span class="metric-value">${result.parallelSpeedupRatio}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Hardware Impact</span>
			<span class="metric-value">${result.hardwareCost}</span>
		</div>
	</div>

	<div class="card">
		<h2>Input Intelligence</h2>
		<div class="metric">
			<span class="metric-label">Inferred Input Shape</span>
			<span class="metric-value">${result.inferredInputShape}</span>
		</div>
		<div class="metric">
			<span class="metric-label">Complexity Boundary</span>
			<span class="metric-value">${result.complexityBoundary}</span>
		</div>
	</div>

	<div class="card">
		<h2>Classroom Mode</h2>
		<p><strong>Plain English:</strong> ${result.naturalLanguageExplanation}</p>
		<p><strong>Step-by-step derivation:</strong></p>
		<ul>
			${result.classroomExplanation.map(s => `<li>${s}</li>`).join('')}
		</ul>
	</div>

	<div class="card">
		<h2>Pop Quiz</h2>
		<p><strong>${result.quizQuestion.question}</strong></p>
		<ul>
			${result.quizQuestion.options.map((o, i) => `<li>${String.fromCharCode(65 + i)}) ${o}</li>`).join('')}
		</ul>
		<button class="quiz-btn" onclick="document.getElementById('quiz-answer').style.display='block'">Show Answer</button>
		<div id="quiz-answer" class="quiz-answer">
			Answer: <strong>${result.quizQuestion.answer}</strong>
		</div>
	</div>

	<div class="card">
		<h2>Certificate</h2>
		<p style="font-family:var(--vscode-editor-font-family);font-size:0.95em">${result.complexityCertificate}</p>
	</div>

	${result.empiricalData.length > 0 ? `
	<script>
		const ctx = document.getElementById('chart').getContext('2d');
		const empiricalData = ${JSON.stringify(result.empiricalData)};

		new Chart(ctx, {
			type: 'scatter',
			data: {
				datasets: [
					{
						label: '${chartLabel}',
						data: empiricalData.map(d => ({ x: d.n, y: d.time })),
						borderColor: '${chartColor}',
						backgroundColor: '${chartColor}',
						pointRadius: 5,
						pointHoverRadius: 7,
						showLine: true,
						tension: 0.2,
						borderWidth: 2,
						fill: false,
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					y: {
						beginAtZero: true,
						title: { display: true, text: 'Execution Time (ms)', color: '#aaa' },
						ticks: { color: '#aaa' },
						grid: { color: 'rgba(128,128,128,0.15)' }
					},
					x: {
						title: { display: true, text: 'Input Size (N)', color: '#aaa' },
						ticks: { color: '#aaa' },
						grid: { color: 'rgba(128,128,128,0.15)' }
					}
				},
				plugins: {
					legend: { labels: { color: '#ccc' } },
					tooltip: {
						callbacks: {
							label: function(context) {
								return 'N=' + context.parsed.x + ', T=' + context.parsed.y.toFixed(4) + 'ms';
							}
						}
					}
				}
			}
		});
	</script>
	` : ''}
</body>
</html>`;
}

export function deactivate() {}
