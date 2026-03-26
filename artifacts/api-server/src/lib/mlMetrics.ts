/**
 * ML inference metrics collector.
 * Tracks prediction latency, prediction-vs-engine divergence,
 * and model confidence distributions.
 */

interface MetricsSample {
  timestamp: number;
  latencyMs: number;
  source: 'ml' | 'physics' | 'fallback';
  nodeCount: number;
  edgeCount: number;
  divergence?: number;  // |ml_score - physics_score| when both are available
}

class MLMetricsCollector {
  private samples: MetricsSample[] = [];
  private maxSamples = 10000;

  record(sample: MetricsSample): void {
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples = this.samples.slice(-this.maxSamples);
    }
  }

  getSummary(windowMs: number = 3600000): {
    totalPredictions: number;
    mlPredictions: number;
    physicsFallbacks: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgDivergence: number | null;
    avgNodeCount: number;
  } {
    const cutoff = Date.now() - windowMs;
    const recent = this.samples.filter(s => s.timestamp > cutoff);

    if (recent.length === 0) {
      return {
        totalPredictions: 0, mlPredictions: 0, physicsFallbacks: 0,
        avgLatencyMs: 0, p95LatencyMs: 0, avgDivergence: null, avgNodeCount: 0,
      };
    }

    const latencies = recent.map(s => s.latencyMs).sort((a, b) => a - b);
    const divergences = recent.filter(s => s.divergence !== undefined).map(s => s.divergence!);

    return {
      totalPredictions: recent.length,
      mlPredictions: recent.filter(s => s.source === 'ml').length,
      physicsFallbacks: recent.filter(s => s.source === 'physics' || s.source === 'fallback').length,
      avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] ?? 0,
      avgDivergence: divergences.length > 0 ? divergences.reduce((a, b) => a + b, 0) / divergences.length : null,
      avgNodeCount: recent.reduce((a, s) => a + s.nodeCount, 0) / recent.length,
    };
  }

  getRecentSamples(n: number = 100): MetricsSample[] {
    return this.samples.slice(-n);
  }
}

export const mlMetrics = new MLMetricsCollector();
