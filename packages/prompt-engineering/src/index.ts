```typescript
// Core Types
export * from './types'

// Template Engine
export * from './template-engine'

// Chain Engine
export * from './chain-engine'

// Composition Engine
export * from './composition-engine'

// Optimization Engine
export * from './optimization-engine'

// Validation Engine
export * from './validation-engine'

// Metrics
export * from './metrics'

// Cache
export * from './cache'

// Re-export commonly used classes and functions
export {
  TemplateEngine,
  TemplateBuilder,
  TemplateParser,
  VariableValidator,
  createTemplate,
  parseTemplate,
  extractVariables,
} from './template-engine'

export {
  ChainExecutor,
  ChainBuilder,
  createChain,
  createTemplateStep,
  createConditionStep,
  createLoopStep,
  createParallelStep,
  createTransformStep,
} from './chain-engine'

export {
  CompositionEngine,
  CompositionBuilder,
  ContentResolverRegistry,
  createComposition,
  createTextPart,
  createTemplatePart,
  createVariablePart,
  createDynamicPart,
  createConditionalPart,
} from './composition-engine'

export {
  OptimizationEngine,
  OptimizationBuilder,
  GridSearchStrategy,
  RandomSearchStrategy,
  BayesianStrategy,
  createOptimization,
  createGridSearch,
  createRandomSearch,
  createBayesianOptimization,
} from './optimization-engine'

// Re-exports for validation
export {
  ValidationEngine,
  ValidationBuilder,
  validateTemplate,
  validateChain,
} from './validation-engine'

// Re-exports for metrics
export {
  MetricsCollector,
  collectMetrics,
  getMetricsReport,
} from './metrics'

// Re-exports for cache
export {
  CacheManager,
  createCache,
  clearCache,
} from './cache'
```

The updated index.ts now includes:
1. All original exports from the core engines
2. New module exports for Validation Engine, Metrics, and Cache
3. Re-exports of commonly used classes and functions from the new modules
4. Maintains the same clean structure and organization

The library now supports additional functionality for validation, metrics collection, and caching alongside the existing template processing, chain execution, content composition, and optimization capabilities.
