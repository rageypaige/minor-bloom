// BLOOM LAB · OPTICAL MATERIAL AND COMPOSITING SETTINGS
// How light passes through the sheets, separate from their shape. All are
// adjustable live with ?dev.
(function () {
  const MB = (window.MB = window.MB || {});

  MB.LabMaterial = {
    flux: 0.7,         // light passing through a sheet seen face-on
    concentrate: 7,    // how bright an edge-on or folded stretch can get
    edgeSoft: 1,       // scales each sheet's edge softness
    backDim: 0.35,     // the far side of a curled sheet is a little dimmer
    exposure: 1.5,
    compress: 0.8,     // highlight compression (keeps colour in bright light)
    saturation: 0.9,
    grain: 0.25,
    scale: 0.6,        // render resolution (lower = cooler laptop)
  };

  MB.LabMaterialRanges = {
    flux: [0, 1.5, 0.01], concentrate: [1, 12, 0.5], edgeSoft: [0.2, 3, 0.05], backDim: [0, 1, 0.05],
    exposure: [0.2, 4, 0.05], compress: [0, 2, 0.05], saturation: [0, 2, 0.05], grain: [0, 1, 0.05], scale: [0.3, 1, 0.05],
  };
})();
