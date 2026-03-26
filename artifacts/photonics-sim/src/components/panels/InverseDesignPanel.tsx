import { useState } from 'react';

export function InverseDesignPanel() {
  const [targetWavelength, setTargetWavelength] = useState(1550);
  const [targetPower, setTargetPower] = useState(-3);
  const [targetSNR, setTargetSNR] = useState(30);
  const [maxComponents, setMaxComponents] = useState(10);

  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          Inverse Design
          <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-full">
            Coming Soon
          </span>
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Describe what you want your circuit to achieve, and the AI will generate
          novel circuit topologies that meet your specifications.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Target Wavelength (nm)</label>
          <input
            type="number"
            value={targetWavelength}
            onChange={e => setTargetWavelength(Number(e.target.value))}
            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-background"
            min={400}
            max={2000}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Target Output Power (dBm)</label>
          <input
            type="number"
            value={targetPower}
            onChange={e => setTargetPower(Number(e.target.value))}
            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-background"
            min={-40}
            max={30}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Target SNR (dB)</label>
          <input
            type="number"
            value={targetSNR}
            onChange={e => setTargetSNR(Number(e.target.value))}
            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-background"
            min={0}
            max={100}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Max Components</label>
          <input
            type="number"
            value={maxComponents}
            onChange={e => setMaxComponents(Number(e.target.value))}
            className="w-full mt-1 px-2 py-1.5 text-sm border rounded bg-background"
            min={2}
            max={50}
          />
        </div>
      </div>

      <button
        disabled
        className="w-full py-2 px-4 text-sm font-medium rounded bg-muted text-muted-foreground cursor-not-allowed"
        title="Generative model (cVAE) needs to be trained first"
      >
        Generate Circuit Candidates
      </button>

      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-3 space-y-2">
        <p className="font-medium">How it will work:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Set your target specifications above</li>
          <li>The AI generates 3-5 diverse circuit candidates</li>
          <li>Each candidate is scored by the forward surrogate</li>
          <li>Click any candidate to load it into the canvas</li>
          <li>Verify with the physics engine and refine</li>
        </ol>
        <p className="mt-2 italic">
          Requires training the generative model on ~500K synthetic circuits.
          See the training pipeline in artifacts/training-pipeline/.
        </p>
      </div>
    </div>
  );
}
