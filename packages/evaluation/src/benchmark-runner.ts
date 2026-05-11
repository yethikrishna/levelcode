import { randomUUID } from 'crypto'

import type {
  Benchmark,
  BenchmarkRunner,
  EvaluationTask,
  EvaluationResult,
  EvaluationCriteria,
} from './types'

/**
 * Basic implementation of BenchmarkRunner
 */
export class BasicBenchmarkRunner implements BenchmarkRunner {
  private runningBenchmarks = new Map<string, Benchmark>()

  /**
   * Run a complete benchmark
   */
  async run(benchmark: Benchmark): Promise<Benchmark> {
    // Set benchmark to running
    benchmark.status = 'running'
    benchmark.metadata.startedAt = new Date()
    benchmark.results = []
    
    this.runningBenchmarks.set(benchmark.id, benchmark)

    try {
      // Run all tasks for all models
      const results: EvaluationResult[] = []
      
      for (const task of benchmark.tasks) {
        for (const modelId of benchmark.models) {
          if (this.runningBenchmarks.get(benchmark.id)?.status === 'failed') {
            throw new Error('Benchmark was cancelled or failed')
          }
          
          const result = await this.runTask(task, modelId)
          results.push(result)
        }
      }

      // Calculate aggregates
      const aggregates = this.calculateAggregates(results, benchmark.models)
      
      // Update benchmark with results
      benchmark.results = results
      benchmark.aggregates = aggregates
      benchmark.status = 'completed'
      benchmark.metadata.completedAt = new Date()
      benchmark.metadata.duration = 
        benchmark.metadata.completedAt.getTime() - 
        benchmark.metadata.startedAt!.getTime()

    } catch (error) {
      benchmark.status = 'failed'
      benchmark.metadata.completedAt = new Date()
      benchmark.metadata.duration = 
        benchmark.metadata.completedAt.getTime() - 
        benchmark.metadata.startedAt!.getTime()
      throw error
    } finally {
      this.runningBenchmarks.delete(benchmark.id)
    }

    return benchmark
  }

  /**
   * Run a single evaluation task
   */
  async runTask(task: EvaluationTask, modelId: string): Promise<EvaluationResult> {
    const startTime = Date.now()
    
    try {
      // Simulate model inference (in real implementation, this would call the actual model)
      const output = await this.simulateModelInference(task.prompt, modelId)
      const latency = Date.now() - startTime
      
      // Evaluate the output against criteria
      const scores = await this.evaluateOutput(task, output)
      
      // Calculate overall score
      const overallScore = this.calculateOverallScore(scores, task.criteria)
      
      // Simulate token count and cost
      const inputTokens = this.estimateTokens(task.prompt)
      const outputTokens = this.estimateTokens(output)
      const cost = this.calculateCost(modelId, inputTokens, outputTokens)

      return {
        taskId: task.id,
        modelId,
        output,
        scores,
        overallScore,
        metrics: {
          latency,
          tokenCount: {
            input: inputTokens,
            output: outputTokens,
            total: inputTokens + outputTokens,
          },
          cost,
          timestamp: new Date(),
        },
      }
    } catch (error) {
      const latency = Date.now() - startTime
      return {
        taskId: task.id,
        modelId,
        output: '',
        scores: [],
        overallScore: 0,
        metrics: {
          latency,
          tokenCount: { input: 0, output: 0, total: 0 },
          cost: 0,
          timestamp: new Date(),
        },
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  }

  /**
   * Cancel a running benchmark
   */
  async cancel(benchmarkId: string): Promise<void> {
    const benchmark = this.runningBenchmarks.get(benchmarkId)
    if (benchmark) {
      benchmark.status = 'failed'
      benchmark.metadata.completedAt = new Date()
      this.runningBenchmarks.delete(benchmarkId)
    }
  }

  /**
   * Get benchmark status
   */
  async getStatus(benchmarkId: string): Promise<Benchmark | null> {
    return this.runningBenchmarks.get(benchmarkId) || null
  }

  /**
   * Simulate model inference (placeholder implementation)
   */
  private async simulateModelInference(prompt: string, modelId: string): Promise<string> {
    // In a real implementation, this would call the actual LLM API
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500))
    
    // Generate a mock response based on the model
    const responses = {
      'gpt-4': 'This is a high-quality response from GPT-4 that demonstrates advanced reasoning capabilities.',
      'claude-3': 'This is a thoughtful response from Claude that shows careful analysis of the prompt.',
      'gemini-pro': 'This is a comprehensive response from Gemini that provides detailed information.',
    }
    
    return responses[modelId as keyof typeof responses] || `Response from ${modelId}`
  }

  /**
   * Evaluate output against task criteria
   */
  private async evaluateOutput(
    task: EvaluationTask, 
    output: string
  ): Promise<Array<{ criterion: string; score: number; confidence?: number; reasoning?: string }>> {
    const scores = []
    
    for (const criterion of task.criteria) {
      let score = 0
      let confidence = 0.8
      let reasoning = ''
      
      switch (criterion.scorer) {
        case 'exact-match':
          if (task.expectedOutput) {
            score = output === task.expectedOutput ? 100 : 0
            reasoning = score === 100 ? 'Exact match found' : 'No exact match'
          }
          break
          
        case 'similarity':
          if (task.expectedOutput) {
            // Simple similarity calculation (in real implementation, use embeddings)
            score = this.calculateSimilarity(output, task.expectedOutput) * 100
            reasoning = `Similarity score: ${score.toFixed(1)}%`
          }
          break
          
        case 'llm-judge':
          // Simulate LLM judge evaluation
          score = Math.random() * 40 + 60 // 60-100 range
          confidence = 0.7
          reasoning = 'Evaluated by LLM judge'
          break
          
        default:
          score = Math.random() * 100
          reasoning = 'Default scoring applied'
      }
      
      scores.push({
        criterion: criterion.name,
        score: Math.round(score),
        confidence,
        reasoning,
      })
    }
    
    return scores
  }

  /**
   * Calculate overall score from individual criterion scores
   */
  private calculateOverallScore(
    scores: Array<{ criterion: string; score: number }>,
    criteria: EvaluationCriteria[]
  ): number {
    let totalScore = 0
    let totalWeight = 0
    
    for (const criterion of criteria) {
      const score = scores.find(s => s.criterion === criterion.name)
      if (score) {
        totalScore += score.score * criterion.weight
        totalWeight += criterion.weight
      }
    }
    
    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0
  }

  /**
   * Calculate benchmark aggregates
   */
  private calculateAggregates(
    results: EvaluationResult[],
    models: string[]
  ): Benchmark['aggregates'] {
    const byModel: Record<string, any> = {}
    const byTask: Record<string, any> = {}
    
    // Calculate per-model aggregates
    for (const modelId of models) {
      const modelResults = results.filter(r => r.modelId === modelId)
      const completed = modelResults.filter(r => !r.metadata?.error)
      const failed = modelResults.filter(r => r.metadata?.error)
      
      byModel[modelId] = {
        avgScore: completed.length > 0 
          ? completed.reduce((sum, r) => sum + r.overallScore, 0) / completed.length 
          : 0,
        avgLatency: completed.length > 0
          ? completed.reduce((sum, r) => sum + r.metrics.latency, 0) / completed.length
          : 0,
        avgCost: completed.length > 0
          ? completed.reduce((sum, r) => sum + r.metrics.cost, 0) / completed.length
          : 0,
        totalTasks: modelResults.length,
        completedTasks: completed.length,
        failedTasks: failed.length,
      }
    }
    
    // Calculate per-task aggregates
    const taskIds = [...new Set(results.map(r => r.taskId))]
    for (const taskId of taskIds) {
      const taskResults = results.filter(r => r.taskId === taskId)
      const completed = taskResults.filter(r => !r.metadata?.error)
      
      if (completed.length > 0) {
        const scores = completed.map(r => ({ modelId: r.modelId, score: r.overallScore }))
        const sorted = scores.sort((a, b) => b.score - a.score)
        
        byTask[taskId] = {
          avgScore: completed.reduce((sum, r) => sum + r.overallScore, 0) / completed.length,
          bestModel: sorted[0].modelId,
          worstModel: sorted[sorted.length - 1].modelId,
        }
      }
    }
    
    return { byModel, byTask }
  }

  /**
   * Calculate simple string similarity
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4)
  }

  /**
   * Calculate cost based on model and token usage
   */
  private calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const costs = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'claude-3': { input: 0.015, output: 0.075 },
      'gemini-pro': { input: 0.0005, output: 0.0015 },
    }
    
    const modelCosts = costs[modelId as keyof typeof costs] || { input: 0.01, output: 0.02 }
    const inputCost = (inputTokens / 1000) * modelCosts.input
    const outputCost = (outputTokens / 1000) * modelCosts.output
    
    return inputCost + outputCost
  }
}