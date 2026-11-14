export const settings = {
    leadSeconds: 0.40,
    flashSeconds: 0.32,
    pollMilliseconds: 16,
    maxVisible: 8,
    size: 154,
    heightOffset: 0, // Offset from the animated chest, fallback to actor centre.
    earlyWindup: true,
    windupSeconds: 0.26, // Before native attack-node activation, not before impact.
    // Delayed self-check, so it remains visible after the loading transition.
    startupCheck: false,
    startupDelaySeconds: 5,
    startupSeconds: 8,
    // Visual test only: alternate yellow/red at screen centre.
    preview: false,
    diagnosticSamples: 30,
    combatProbe: false, // Enable only for bounded read-only diagnostics.
};
