import type { ResourceMonitor as IResourceMonitor } from './types'

// ============================================================================
// Resource Monitor
// ============================================================================

export class ResourceMonitor implements IResourceMonitor {
  private monitoringInterval?: NodeJS.Timeout
  private isMonitoring: boolean = false
  private history: Array<IResourceMonitor & { timestamp: Date }> = []
  private maxHistorySize: number = 1000

  constructor() {}

  async startMonitoring(intervalMs: number = 1000): Promise<void> {
    if (this.isMonitoring) {
      return
    }

    this.isMonitoring = true
    this.monitoringInterval = setInterval(async () => {
      const usage = await this.getCurrentUsage()
      this.history.push({
        ...usage,
        timestamp: new Date()
      })

      // Trim history if needed
      if (this.history.length > this.maxHistorySize) {
        this.history = this.history.slice(-this.maxHistorySize)
      }
    }, intervalMs)
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
    }
    this.isMonitoring = false
  }

  async getCurrentUsage(): Promise<IResourceMonitor> {
    const cpuUsage = await this.getCPUUsage()
    const memoryUsage = await this.getMemoryUsage()
    const gpuUsage = await this.getGPUUsage()
    const diskUsage = await this.getDiskUsage()
    const networkIO = await this.getNetworkIO()

    return {
      cpuUsage,
      memoryUsage,
      gpuMemoryUsage: gpuUsage.map(gpu => gpu.memoryUsed),
      diskUsage,
      networkIO,
      timestamp: new Date()
    }
  }

  getHistory(): Array<IResourceMonitor & { timestamp: Date }> {
    return [...this.history]
  }

  getAverageUsage(durationMs?: number): Partial<IResourceMonitor> {
    if (this.history.length === 0) {
      return {}
    }

    let relevantHistory = this.history

    if (durationMs) {
      const cutoffTime = new Date(Date.now() - durationMs)
      relevantHistory = this.history.filter(entry => entry.timestamp >= cutoffTime)
    }

    if (relevantHistory.length === 0) {
      return {}
    }

    const avgCPU = relevantHistory.reduce((sum, entry) => sum + entry.cpuUsage, 0) / relevantHistory.length
    const avgMemory = relevantHistory.reduce((sum, entry) => sum + entry.memoryUsage, 0) / relevantHistory.length
    const avgDisk = relevantHistory.reduce((sum, entry) => sum + entry.diskUsage, 0) / relevantHistory.length

    const avgGPUMemory = relevantHistory
      .filter(entry => entry.gpuMemoryUsage && entry.gpuMemoryUsage.length > 0)
      .map(entry => entry.gpuMemoryUsage!.reduce((sum, mem) => sum + mem, 0) / entry.gpuMemoryUsage!.length)
    
    const avgNetworkIn = relevantHistory
      .filter(entry => entry.networkIO)
      .reduce((sum, entry) => sum + entry.networkIO!.bytesIn, 0) / relevantHistory.length
    
    const avgNetworkOut = relevantHistory
      .filter(entry => entry.networkIO)
      .reduce((sum, entry) => sum + entry.networkIO!.bytesOut, 0) / relevantHistory.length

    return {
      cpuUsage: avgCPU,
      memoryUsage: avgMemory,
      gpuMemoryUsage: avgGPUMemory.length > 0 ? avgGPUMemory : undefined,
      diskUsage: avgDisk,
      networkIO: avgNetworkIn > 0 || avgNetworkOut > 0 ? {
        bytesIn: avgNetworkIn,
        bytesOut: avgNetworkOut
      } : undefined
    }
  }

  getPeakUsage(): Partial<IResourceMonitor> {
    if (this.history.length === 0) {
      return {}
    }

    const peakCPU = Math.max(...this.history.map(entry => entry.cpuUsage))
    const peakMemory = Math.max(...this.history.map(entry => entry.memoryUsage))
    const peakDisk = Math.max(...this.history.map(entry => entry.diskUsage))

    const peakGPUMemory = this.history
      .filter(entry => entry.gpuMemoryUsage && entry.gpuMemoryUsage.length > 0)
      .map(entry => Math.max(...entry.gpuMemoryUsage!))
    
    const peakNetworkIn = Math.max(...this.history
      .filter(entry => entry.networkIO)
      .map(entry => entry.networkIO!.bytesIn))
    
    const peakNetworkOut = Math.max(...this.history
      .filter(entry => entry.networkIO)
      .map(entry => entry.networkIO!.bytesOut))

    return {
      cpuUsage: peakCPU,
      memoryUsage: peakMemory,
      gpuMemoryUsage: peakGPUMemory.length > 0 ? peakGPUMemory : undefined,
      diskUsage: peakDisk,
      networkIO: (peakNetworkIn > 0 || peakNetworkOut > 0) ? {
        bytesIn: peakNetworkIn,
        bytesOut: peakNetworkOut
      } : undefined
    }
  }

  getResourceTrends(): {
    cpu: 'increasing' | 'decreasing' | 'stable'
    memory: 'increasing' | 'decreasing' | 'stable'
    gpu: 'increasing' | 'decreasing' | 'stable'
    disk: 'increasing' | 'decreasing' | 'stable'
    network: 'increasing' | 'decreasing' | 'stable'
  } {
    if (this.history.length < 10) {
      return {
        cpu: 'stable',
        memory: 'stable',
        gpu: 'stable',
        disk: 'stable',
        network: 'stable'
      }
    }

    const calculateTrend = (values: number[]): 'increasing' | 'decreasing' | 'stable' => {
      if (values.length < 2) return 'stable'
      
      const recent = values.slice(-5)
      const older = values.slice(-10, -5)
      
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length
      
      const change = (recentAvg - olderAvg) / olderAvg
      
      if (Math.abs(change) < 0.05) {
        return 'stable'
      } else if (change > 0) {
        return 'increasing'
      } else {
        return 'decreasing'
      }
    }

    const cpuValues = this.history.map(entry => entry.cpuUsage)
    const memoryValues = this.history.map(entry => entry.memoryUsage)
    const diskValues = this.history.map(entry => entry.diskUsage)
    const gpuValues = this.history
      .filter(entry => entry.gpuMemoryUsage && entry.gpuMemoryUsage.length > 0)
      .map(entry => entry.gpuMemoryUsage!.reduce((a, b) => a + b, 0) / entry.gpuMemoryUsage!.length)
    const networkInValues = this.history
      .filter(entry => entry.networkIO)
      .map(entry => entry.networkIO!.bytesIn)
    const networkOutValues = this.history
      .filter(entry => entry.networkIO)
      .map(entry => entry.networkIO!.bytesOut)

    return {
      cpu: calculateTrend(cpuValues),
      memory: calculateTrend(memoryValues),
      gpu: gpuValues.length > 0 ? calculateTrend(gpuValues) : 'stable',
      disk: calculateTrend(diskValues),
      network: (networkInValues.length > 0 || networkOutValues.length > 0) 
        ? calculateTrend([...networkInValues, ...networkOutValues])
        : 'stable'
    }
  }

  // Private methods
  private async getCPUUsage(): Promise<number> {
    try {
      const os = await import('os')
      const cpus = os.cpus()
      const totalIdle = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0)
      const totalTick = cpus.reduce((sum, cpu) => 
        sum + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle, 0
      )
      
      return ((totalTick - totalIdle) / totalTick) * 100
    } catch {
      return 0
    }
  }

  private async getMemoryUsage(): Promise<number> {
    try {
      const os = await import('os')
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const usedMem = totalMem - freeMem
      
      return (usedMem / totalMem) * 100
    } catch {
      return 0
    }
  }

  private async getGPUUsage(): Promise<Array<{
    id: number
    name: string
    memoryTotal: number
    memoryUsed: number
    utilization: number
    temperature: number
    powerUsage: number
  }>> {
    // In production, use nvidia-ml-py or similar to get GPU info
    // For now, return simulated data
    
    const gpuCount = await this.getGPUCount()
    const gpus = []

    for (let i = 0; i < gpuCount; i++) {
      gpus.push({
        id: i,
        name: `GPU ${i}`,
        memoryTotal: 8000 + Math.random() * 8000, // 8-16 GB
        memoryUsed: 4000 + Math.random() * 4000, // 4-8 GB used
        utilization: 20 + Math.random() * 60, // 20-80% utilization
        temperature: 30 + Math.random() * 50, // 30-80°C
        powerUsage: 150 + Math.random() * 200 // 150-350W
      })
    }

    return gpus
  }

  private async getGPUCount(): Promise<number> {
    // In production, detect actual GPU count
    // For now, return simulated count
    return process.env.CUDA_VISIBLE?.split(',').length || 0
  }

  private async getDiskUsage(): Promise<number> {
    try {
      const fs = await import('fs/promises')
      const pathModule = await import('path')
      
      const stats = await fs.statfs(pathModule.resolve('.'))
      const total = stats.blocks * stats.bsize
      const free = stats.bavail * stats.bsize
      const used = total - free
      
      return (used / total) * 100
    } catch {
      return 0
    }
  }

  private async getNetworkIO(): Promise<{
    bytesIn: number
    bytesOut: number
  } | undefined> {
    try {
      // In production, use platform-specific network monitoring
      // For now, return undefined (network monitoring not implemented)
      return undefined
    } catch {
      return undefined
    }
  }

  // Advanced monitoring features
  async getProcessInfo(): Promise<{
    pid: number
    ppid: number
    memoryUsage: number
    cpuTime: number
    startTime: Date
  }> {
    try {
      const process = await import('process')
      
      return {
        pid: process.pid,
        ppid: process.ppid,
        memoryUsage: process.memoryUsage().rss,
        cpuTime: process.cpuUsage().user,
        startTime: new Date()
      }
    } catch {
      return {
        pid: 0,
        ppid: 0,
        memoryUsage: 0,
        cpuTime: 0,
        startTime: new Date()
      }
    }
  }

  async getSystemInfo(): Promise<{
    platform: string
    arch: string
    nodeVersion: string
    totalMemory: number
    cpuCount: number
    gpuCount: number
  }> {
    const os = await import('os')
    
    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      totalMemory: os.totalmem(),
      cpuCount: os.cpus().length,
      gpuCount: await this.getGPUCount()
    }
  }

  detectResourceBottlenecks(): {
    cpu: boolean
    memory: boolean
    gpu: boolean
    disk: boolean
    network: boolean
  } {
    const avg = this.getAverageUsage(60000) // Last minute average
    const trends = this.getResourceTrends()

    return {
      cpu: avg.cpuUsage !== undefined && avg.cpuUsage > 80,
      memory: avg.memoryUsage !== undefined && avg.memoryUsage > 85,
      gpu: avg.gpuMemoryUsage !== undefined && avg.gpuMemoryUsage[0] > 90,
      disk: avg.diskUsage !== undefined && avg.diskUsage > 90,
      network: trends.network === 'increasing'
    }
  }

  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = []
    const bottlenecks = this.detectResourceBottlenecks()

    if (bottlenecks.cpu) {
      suggestions.push('Consider reducing batch size or enabling gradient accumulation')
      suggestions.push('Use mixed precision training to reduce CPU load')
    }

    if (bottlenecks.memory) {
      suggestions.push('Enable gradient checkpointing to reduce memory usage')
      suggestions.push('Use ZeRO or FSDP for memory optimization')
      suggestions.push('Consider reducing model size or using parameter-efficient fine-tuning')
    }

    if (bottlenecks.gpu) {
      suggestions.push('Enable mixed precision (fp16/bf16) training')
      suggestions.push('Use gradient accumulation to increase effective batch size')
      suggestions.push('Consider model parallelism for larger models')
    }

    if (bottlenecks.disk) {
      suggestions.push('Use faster storage (SSD) for checkpoints and data')
      suggestions.push('Reduce checkpoint frequency or use compression')
      suggestions.push('Clean up old checkpoints and logs')
    }

    if (bottlenecks.network) {
      suggestions.push('Use local data caching to reduce network I/O')
      suggestions.push('Compress data transfers')
      suggestions.push('Consider using faster network infrastructure')
    }

    const trends = this.getResourceTrends()
    
    if (trends.memory === 'increasing') {
      suggestions.push('Monitor for memory leaks')
      suggestions.push('Consider implementing memory garbage collection')
    }

    if (trends.cpu === 'increasing' && trends.memory === 'increasing') {
      suggestions.push('System may be overheating - consider throttling')
      suggestions.push('Check for runaway processes')
    }

    return suggestions
  }

  // Export and reporting
  generateReport(): {
    summary: any
    trends: any
    peaks: any
    bottlenecks: any
    suggestions: string[]
  } {
    const summary = this.getAverageUsage()
    const trends = this.getResourceTrends()
    const peaks = this.getPeakUsage()
    const bottlenecks = this.detectResourceBottlenecks()
    const suggestions = this.getOptimizationSuggestions()

    return {
      summary,
      trends,
      peaks,
      bottlenecks,
      suggestions
    }
  }

  exportMetrics(format: 'json' | 'csv'): string {
    const report = this.generateReport()

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2)
      
      case 'csv':
        const headers = ['timestamp', 'cpu_usage', 'memory_usage', 'gpu_memory_0', 'disk_usage', 'network_in', 'network_out']
        const rows = this.history.map(entry => [
          entry.timestamp.toISOString(),
          entry.cpuUsage.toFixed(2),
          entry.memoryUsage.toFixed(2),
          (entry.gpuMemoryUsage?.[0] || 0).toFixed(2),
          entry.diskUsage.toFixed(2),
          (entry.networkIO?.bytesIn || 0).toString(),
          (entry.networkIO?.bytesOut || 0).toString()
        ])
        
        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
      
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }
}