import { useEffect, useRef, useCallback } from 'react';
import { useSimulatorStore } from '../store/use-simulator-store';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const DEBOUNCE_MS = 50;

export function useMlPredictions() {
  const nodes = useSimulatorStore(s => s.nodes);
  const edges = useSimulatorStore(s => s.edges);
  const mlMode = useSimulatorStore(s => s.mlMode);
  const setMlPredictions = useSimulatorStore(s => s.setMlPredictions);
  const setMlModelStatus = useSimulatorStore(s => s.setMlModelStatus);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Check model status on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/predict/status`)
      .then(r => r.json())
      .then(data => setMlModelStatus(data.modelLoaded, data.modelVersion))
      .catch(() => setMlModelStatus(false, null));
  }, [setMlModelStatus]);

  const runPrediction = useCallback(async () => {
    if (mlMode !== 'instant' || nodes.length === 0) {
      setMlPredictions(null);
      return;
    }

    // Cancel previous request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const components = nodes.map(n => ({
        id: n.id,
        type: n.data.type,
        label: n.data.label,
        x: n.position?.x ?? 0,
        y: n.position?.y ?? 0,
        params: n.data.params ?? {},
      }));

      const connections = edges.map(e => ({
        id: e.id,
        fromComponentId: e.source,
        fromPort: e.sourceHandle ?? 'out',
        toComponentId: e.target,
        toPort: e.targetHandle ?? 'in',
      }));

      const resp = await fetch(`${API_BASE}/api/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ components, connections }),
        signal: abortRef.current.signal,
      });

      if (resp.ok) {
        const data = await resp.json();
        setMlPredictions(data);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('ML prediction failed:', err);
      }
    }
  }, [nodes, edges, mlMode, setMlPredictions]);

  // Debounced prediction on graph changes
  useEffect(() => {
    if (mlMode !== 'instant') return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runPrediction, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [nodes, edges, mlMode, runPrediction]);

  return { runPrediction };
}
