I'll create the main index file for your LLM Evaluation Framework with the comprehensive exports and convenience functions you've outlined:

```typescript
// ============================================================================
// LLM Evaluation Framework - Main Exports
// ============================================================================

// Core Types
export * from './types'

// Evaluation Engine
export { EvaluationEngine, EvaluationEngineFactory } from './evaluation-engine'

// Metrics Collection
export { MetricsCollector } from './metrics-collector'

// Statistical Analysis
export { StatisticalAnalyzer } from './statistical-analyzer'

// Report Generation
export { ReportGenerator } from './reporting'

// Benchmark Suites
export { BenchmarkRegistry, BenchmarkLoader } from './benchmarks'

// Additional Components (would be implemented in separate files)
export { ModelExecutor } from './model-executor'
export { ResultAggregator } from './result-aggregator'
export { CacheManager } from './cache-manager'

// ============================================================================
// Convenience Functions
// ============================================================================

import { EvaluationEngineFactory } from './evaluation-engine'
import type { EvaluationConfig, EvaluationReport, StatisticalSummary } from './types'
import { ReportGenerator } from './reporting'
import { StatisticalAnalyzer } from './statistical-analyzer'

/**
 * Run a complete evaluation with the given configuration
 */
export async function runEvaluation(
  config: EvaluationConfig,
  options?: {
    onDataPoint?: (result: any) => void
    onProgress?: (progress: any) => void
    onError?: (error: Error) => void
  }
): Promise<EvaluationReport> {
  // Create evaluation engine
  const engine = EvaluationEngineFactory.create(config, options)
  
  // Run evaluation
  const result = await engine.runEvaluation()
  
  // Perform statistical analysis
  const analyzer = new StatisticalAnalyzer()
  const statisticalSummary = await analyzer.analyzeResults(result.modelResults)
  
  // Generate report
  const reportGenerator = new ReportGenerator()
  const report = await reportGenerator.generateReport(config, result, statisticalSummary)
  
  return report
}

/**
 * Generate an HTML report from evaluation results
 */
export async function generateHTMLReport(report: EvaluationReport): Promise<string> {
  const reportGenerator = new ReportGenerator()
  return await reportGenerator.generateHTMLReport(report)
}

/**
 * Generate a JSON report from evaluation results
 */
export async function generateJSONReport(report: EvaluationReport): Promise<string> {
  const reportGenerator = new ReportGenerator()
  return await reportGenerator.generateJSONReport(report)
}

/**
 * Generate a CSV report from evaluation results
 */
export async function generateCSVReport(report: EvaluationReport): Promise<string> {
  const reportGenerator = new ReportGenerator()
  return await reportGenerator.generateCSVReport(report)
}

// ============================================================================
// Version Information
// ============================================================================

export const VERSION = '1.0.0'
export const BUILD_DATE = new Date().toISOString()
```

This index file provides:

1. **Organized Exports**: Components are grouped by functionality with clear sections
2. **Specific Named Exports**: Instead of wildcard exports, it exports specific classes for better tree-shaking
3. **Convenience Functions**: High-level functions for common operations like running evaluations and generating reports
4. **Type Safety**: Proper imports and exports with TypeScript types
5. **Version Tracking**: Version and build date information for the framework
6. **Documentation**: Clear section headers and function documentation

The file serves as the main entry point for the evaluation framework, making it easy for users to import what they need either individually or through the convenience functions.
