import { randomUUID } from 'crypto'

import type {
  LLMJudge,
  EvaluationCriteria,
  EvaluationResult,
  EvaluationTask,
} from './types'

/**
 * LLM-based judge for evaluating model outputs
 */
export class BasicLLMJudge {
  private id: string
  private judge: Omit<LLMJudge, 'id' | 'performance'>

  constructor(config: {
    id?: string
    model: string
    promptTemplate?: string
    criteria?: EvaluationCriteria[]
    config?: {
      temperature?: number
      maxTokens?: number
      consistency?: number
    }
  }) {
    this.id = config.id || randomUUID()
    this.judge = {
      model: config.model,
      promptTemplate: config.promptTemplate || this.getDefaultPromptTemplate(),
      criteria: config.criteria || this.getDefaultCriteria(),
      config: {
        temperature: config.config?.temperature || 0.3,
        maxTokens: config.config?.maxTokens || 1000,
        consistency: config.config?.consistency || 3,
      },
    }
  }

  /**
   * Evaluate output using multiple criteria
   */
  async evaluate(params: {
    task: EvaluationTask
    output: string
    expectedOutput?: string
  }): Promise<EvaluationResult['scores']> {
    const scores: EvaluationResult['scores'] = []

    // Evaluate each criterion
    for (const criterion of params.task.criteria) {
      const score = await this.evaluateCriterion({
        criterion,
        task: params.task,
        output: params.output,
        expectedOutput: params.expectedOutput,
      })
      scores.push(score)
    }

    return scores
  }

  /**
   * Evaluate a single criterion
   */
  private async evaluateCriterion(params: {
    criterion: EvaluationCriteria
    task: EvaluationTask
    output: string
    expectedOutput?: string
  }): Promise<EvaluationResult['scores'][0]> {
    // Build evaluation prompt
    const prompt = this.buildEvaluationPrompt(params)

    // Run multiple evaluations for consistency
    const evaluations: number[] = []
    let reasoning = ''

    for (let i = 0; i < this.judge.config.consistency; i++) {
      const result = await this.runEvaluation(prompt)
      evaluations.push(result.score)
      if (i === 0) reasoning = result.reasoning || ''
    }

    // Calculate average score
    const avgScore = evaluations.reduce((sum, score) => sum + score, 0) / evaluations.length
    const confidence = this.calculateConfidence(evaluations)

    return {
      criterion: params.criterion.name,
      score: Math.round(avgScore),
      confidence,
      reasoning,
    }
  }

  /**
   * Build evaluation prompt
   */
  private buildEvaluationPrompt(params: {
    criterion: EvaluationCriteria
    task: EvaluationTask
    output: string
    expectedOutput?: string
  }): string {
    const { criterion, task, output, expectedOutput } = params

    let prompt = this.judge.promptTemplate

    // Replace placeholders
    prompt = prompt.replace('{{TASK_DESCRIPTION}}', task.description || '')
    prompt = prompt.replace('{{TASK_PROMPT}}', task.prompt)
    prompt = prompt.replace('{{MODEL_OUTPUT}}', output)
    prompt = prompt.replace('{{CRITERION_NAME}}', criterion.name)
    prompt = prompt.replace('{{CRITERION_DESCRIPTION}}', criterion.description)
    prompt = prompt.replace('{{CRITERION_TYPE}}', criterion.type)

    if (expectedOutput) {
      prompt = prompt.replace('{{EXPECTED_OUTPUT}}', expectedOutput)
    } else {
      prompt = prompt.replace('{{EXPECTED_OUTPUT}}', 'No specific expected output provided')
    }

    // Add scoring instructions based on criterion type
    if (criterion.type === 'quantitative') {
      prompt += '\n\nProvide a numerical score from 0-100.'
    } else if (criterion.type === 'qualitative') {
      prompt += '\n\nProvide a qualitative assessment and convert to a score from 0-100.'
    } else if (criterion.type === 'boolean') {
      prompt += '\n\nProvide a score of 100 if the criterion is met, 0 otherwise.'
    }

    // Add expected value if provided
    if (criterion.expectedValue) {
      if (criterion.expectedValue.exact !== undefined) {
        prompt += `\n\nExpected exact value: ${criterion.expectedValue.exact}`
      }
      if (criterion.expectedValue.min !== undefined) {
        prompt += `\n\nExpected minimum value: ${criterion.expectedValue.min}`
      }
      if (criterion.expectedValue.max !== undefined) {
        prompt += `\n\nExpected maximum value: ${criterion.expectedValue.max}`
      }
    }

    return prompt
  }

  /**
   * Run evaluation using the judge model
   */
  private async runEvaluation(prompt: string): Promise<{
    score: number
    reasoning?: string
  }> {
    // In a real implementation, this would call the actual LLM API
    // For now, we'll simulate the evaluation
    
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500))

    // Simulate different evaluation methods
    const methods = ['pattern-matching', 'semantic-analysis', 'rule-based']
    const method = methods[Math.floor(Math.random() * methods.length)]

    let score: number
    let reasoning: string

    switch (method) {
      case 'pattern-matching':
        // Simple pattern-based scoring
        score = Math.random() * 30 + 60 // 60-90 range
        reasoning = 'Evaluated based on pattern matching and keyword analysis'
        break

      case 'semantic-analysis':
        // Semantic similarity scoring
        score = Math.random() * 25 + 65 // 65-90 range
        reasoning = 'Evaluated using semantic similarity and contextual understanding'
        break

      case 'rule-based':
        // Rule-based scoring
        score = Math.random() * 35 + 55 // 55-90 range
        reasoning = 'Evaluated using predefined rules and heuristics'
        break

      default:
        score = Math.random() * 40 + 50 // 50-90 range
        reasoning = 'Evaluated using multiple criteria'
    }

    // Add some variation based on prompt complexity
    const promptComplexity = Math.min(prompt.length / 1000, 1)
    score = score * (0.9 + promptComplexity * 0.2) // Adjust score based on complexity

    return {
      score: Math.min(100, Math.max(0, score)),
      reasoning,
    }
  }

  /**
   * Calculate confidence score based on evaluation consistency
   */
  private calculateConfidence(evaluations: number[]): number {
    if (evaluations.length === 1) return 0.5

    // Calculate standard deviation
    const mean = evaluations.reduce((sum, val) => sum + val, 0) / evaluations.length
    const variance = evaluations.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / evaluations.length
    const stdDev = Math.sqrt(variance)

    // Convert standard deviation to confidence (inverse relationship)
    const maxStdDev = 50 // Maximum expected standard deviation
    const confidence = Math.max(0.1, 1 - (stdDev / maxStdDev))

    return Math.round(confidence * 100) / 100
  }

  /**
   * Get default prompt template
   */
  private getDefaultPromptTemplate(): string {
    return `You are an expert evaluator assessing the quality of AI model outputs.

## Task Description
{{TASK_DESCRIPTION}}

## Original Prompt
{{TASK_PROMPT}}

## Model Output
{{MODEL_OUTPUT}}

{{#EXPECTED_OUTPUT}}
## Expected Output
{{EXPECTED_OUTPUT}}
{{/EXPECTED_OUTPUT}}

## Evaluation Criterion
- **Name**: {{CRITERION_NAME}}
- **Description**: {{CRITERION_DESCRIPTION}}
- **Type**: {{CRITERION_TYPE}}

Please evaluate the model output against this criterion. Consider:
1. Does the output address the prompt requirements?
2. Is the output accurate and relevant?
3. Is the output well-structured and coherent?
4. Does it meet the specific criteria requirements?

Provide your evaluation in the following format:
{
  "score": <number from 0-100>,
  "reasoning": "<detailed explanation of your evaluation>"
}`
  }

  /**
   * Get default evaluation criteria
   */
  private getDefaultCriteria(): EvaluationCriteria[] {
    return [
      {
        name: 'relevance',
        description: 'How relevant is the output to the prompt?',
        type: 'quantitative',
        weight: 0.3,
        scorer: 'llm-judge',
      },
      {
        name: 'accuracy',
        description: 'How accurate and factually correct is the output?',
        type: 'quantitative',
        weight: 0.3,
        scorer: 'llm-judge',
      },
      {
        name: 'completeness',
        description: 'How completely does the output address the prompt?',
        type: 'quantitative',
        weight: 0.2,
        scorer: 'llm-judge',
      },
      {
        name: 'clarity',
        description: 'How clear and well-structured is the output?',
        type: 'qualitative',
        weight: 0.2,
        scorer: 'llm-judge',
      },
    ]
  }

  /**
   * Create a new judge with custom ID
   */
  static create(options: {
    id?: string
    model: string
    promptTemplate?: string
    criteria?: EvaluationCriteria[]
    config?: {
      temperature?: number
      maxTokens?: number
      consistency?: number
    }
  }): BasicLLMJudge {
    return new BasicLLMJudge(options)
  }

  /**
   * Batch evaluate multiple outputs
   */
  async batchEvaluate(params: {
    task: EvaluationTask
    outputs: Array<{
      output: string
      expectedOutput?: string
      id?: string
    }>
  }): Promise<Array<{
    id?: string
    scores: EvaluationResult['scores']
    overallScore: number
  }>> {
    const results = []

    for (const item of params.outputs) {
      const scores = await this.evaluate({
        task: params.task,
        output: item.output,
        expectedOutput: item.expectedOutput,
      })

      // Calculate overall score
      const overallScore = this.calculateOverallScore(scores, params.task.criteria)

      results.push({
        id: item.id,
        scores,
        overallScore,
      })
    }

    return results
  }

  /**
   * Calculate overall score from individual criterion scores
   */
  private calculateOverallScore(
    scores: EvaluationResult['scores'],
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
   * Update judge performance metrics
   */
  updatePerformance(metrics: {
    avgLatency: number
    avgCost: number
    reliability: number
  }): void {
    // Store performance metrics separately
    // In a real implementation, this would be persisted
  }

  /**
   * Get judge ID
   */
  getId(): string {
    return this.id
  }

  /**
   * Get judge configuration
   */
  getConfig(): Omit<LLMJudge, 'id' | 'performance'> {
    return { ...this.judge }
  }
}