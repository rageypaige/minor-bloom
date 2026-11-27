// BLOOM LAB · OPTICAL MATERIAL AND COMPOSITING SETTINGS
// Every visual property of the light, separate from geometry and movement.
// All are adjustable live with ?dev.
(function () {
  const MB = (window.MB = window.MB || {});

  MB.LabMaterial = {
    // the body of light
    density: 0.6,     // how much light a formation's interior holds
    asym: 0.95,       // interior brighter toward its lit side (0 = even)
    rim: 1.6,         // a defined edge on the lit side, where it is concentrated
    soft: 0.5,        // edge softness (varies along each body around this)
    softVar: 0.8,     // how much edge softness varies along the body
    warp: 0.07,       // how much the slow noise field bends the space
    warpScale: 1.6,   //   its scale (lower = broader folds)
    // compositing
    absorb: 0.45,     // how much a front formation dims the light behind it
    exposure: 1.2,    // overall exposure
    compress: 0.7,    // highlight compression (keeps colour in bright light)
    saturation: 0.85, // colour saturation
    grain: 0.25,      // film grain (very subtle)
    scale: 0.6,       // render resolution (fraction of the screen; lower = cooler laptop)
  };

  // dev panel ranges
  MB.LabMaterialRanges = {
    density: [0, 3, 0.05], asym: [0, 1, 0.05], rim: [0, 3, 0.05], soft: [0.05, 1, 0.01], softVar: [0, 1, 0.05],
    warp: [0, 0.25, 0.005], warpScale: [0.3, 5, 0.1], absorb: [0, 1, 0.05], exposure: [0.2, 4, 0.05],
    compress: [0, 2, 0.05], saturation: [0, 2, 0.05], grain: [0, 1, 0.05], scale: [0.3, 1, 0.05],
  };
})();
