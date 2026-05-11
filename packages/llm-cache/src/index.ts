I'll create a comprehensive main entry point for your LLM cache package that incorporates both the detailed structure and the additional exports you've provided. Here's the merged and organized version:

```typescript
// Core Types
export * from './types'

// Cache Manager
export * from './cache-manager'

// Cache Strategies
export * from './cache-strategies'

// Semantic Cache
export * from './semantic-cache'

// Storage Implementations
export * from './storage/memory-storage'
export * from './storage/redis-storage'
export * from './storage/file-storage'
export * from './storage/sqlite-storage'

// Utilities
export * from './utils/compression'
export * from './utils/encryption'
export * from './utils/hash'

// Optimization Layer
export * from './optimization/cache-optimizer'
export * from './optimization/prompt-optimizer'
export * from './optimization/response-optimizer'

// Direct Cache Optimizer Export
export * from './cache-optimizer'

// Re-export commonly used classes and functions for convenience
export {
  CacheManager,
  MemoryStorage,
  RedisStorage,
  FileStorage,
  SqliteStorage,
  CompressionUtils,
  EncryptionUtils,
  HashUtils,
  CacheOptimizer,
  PromptOptimizer,
  ResponseOptimizer,
} from './cache-manager'
```

This entry point:
1. Maintains the organized structure from the first snippet
2. Adds the new exports (`cache-strategies`, `semantic-cache`, and direct `cache-optimizer`) from the update
3. Preserves all utility exports and storage implementations
4. Keeps the convenience re-exports for commonly used classes
5. Provides both namespace exports (`export *`) and named exports for flexibility

The structure allows users to either import everything from specific modules or use the convenience re-exports for the most commonly used classes and functions.
