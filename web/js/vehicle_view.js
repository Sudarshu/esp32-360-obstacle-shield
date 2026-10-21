import * as THREE from "./three.module.js";

/**
 * 3D Vehicle & Obstacle Visualizer
 * Mahindra XUV 3XO High-Fidelity Procedural 3D Model & Surround Acoustic Radar
 * Renders authentic compact SUV bodywork, signature lighting, sensor mounts, range rings, and dynamic obstacle sectors.
 */
export class VehicleView {
  constructor(canvasElement, config) {
    this.canvas = canvasElement;
    this.config = config || {};
    
    /* Configurable Vehicle Dimensions (in meters) - Mahindra XUV 3XO */
    this.carLength = (this.config.vehicle?.length_cm || 399.0) / 100.0;
    this.carWidth = (this.config.vehicle?.width_cm || 182.1) / 100.0;
    this.carHeight = (this.config.vehicle?.height_cm || 164.7) / 100.0;
    this.wheelbase = (this.config.vehicle?.wheelbase_cm || 260.0) / 100.0;
    this.groundClearance = (this.config.vehicle?.ground_clearance_cm || 20.1) / 100.0;

    /* Vehicle Paint Shade - Default: Citrine Gold (3XO Hero Launch Shade) */
    this.paintColor = 0xc99a3e;
    this.paintMaterials = [];
    
    /* Proximity Thresholds (in cm) */
    this.threshRed = this.config.proximity_zones_cm?.red_critical_threshold || 60.0;
    this.threshYellow = this.config.proximity_zones_cm?.yellow_warning_threshold || 150.0;
    this.threshGreen = this.config.proximity_zones_cm?.green_safe_threshold || 300.0;
    
    /* Three.js Scene Setup */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0e17);
    this.scene.fog = new THREE.FogExp2(0x0a0e17, 0.04);
    
    /* Camera */
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100.0);
    this.defaultCamPos = new THREE.Vector3(5.2, 5.2, 5.8);
    this.camera.position.copy(this.defaultCamPos);
    this.cameraTarget = new THREE.Vector3(0, 0.6, 0);
    this.camera.lookAt(this.cameraTarget);
    
    /* WebGL Renderer */
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    /* Groups */
    this.vehicleGroup = new THREE.Group();
    this.sensorsGroup = new THREE.Group();
    this.sectorsGroup = new THREE.Group();
    this.scene.add(this.vehicleGroup);
    this.scene.add(this.sensorsGroup);
    this.scene.add(this.sectorsGroup);
    
    /* Sensor Meshes and Obstacle Geometries */
    this.sensorMeshes = [];
    this.obstacleSectors = [];
    
    /* Controls and Interaction */
    this.autoRotate = false;
    this.isDragging = false;
    this.prevMousePos = { x: 0, y: 0 };
    this.spherical = { radius: 8.8, phi: Math.PI / 3.2, theta: Math.PI / 4.0 };
    
    this.setupLighting();
    this.setupGroundAndRings();
    this.buildVehicle();
    this.buildSensorsAndSectors();
    this.setupInputHandlers();
    
    this.lastFrameTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setVehicleColor(color) {
    const col = new THREE.Color(color);
    this.paintColor = col.getHex();
    this.paintMaterials.forEach((mat) => {
      mat.color.copy(col);
    });
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe8f0fe, 1.3);
    dirLight.position.set(10, 16, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -6;
    dirLight.shadow.camera.right = 6;
    dirLight.shadow.camera.top = 6;
    dirLight.shadow.camera.bottom = -6;
    this.scene.add(dirLight);

    const blueRimLight = new THREE.DirectionalLight(0x00b0ff, 0.75);
    blueRimLight.position.set(-8, 6, -8);
    this.scene.add(blueRimLight);

    const softFillLight = new THREE.DirectionalLight(0xfff3e0, 0.4);
    softFillLight.position.set(4, 2, -10);
    this.scene.add(softFillLight);
  }

  setupGroundAndRings() {
    /* Ground Grid */
    const gridHelper = new THREE.GridHelper(16, 32, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.01;
    this.scene.add(gridHelper);

    /* Concentric Range Rings (1m, 2m, 3m, 4m) */
    const ranges = [1.0, 2.0, 3.0, 4.0];
    ranges.forEach((r) => {
      const ringGeo = new THREE.RingGeometry(r - 0.015, r + 0.015, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x334155,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      this.scene.add(ring);
    });
  }

  /**
   * Procedural 3D Model: Mahindra XUV 3XO
   * Authentic proportions, sculpted SUV body, floating dual-tone roof,
   * Inverted-C LED DRLs, rear Infinity lightbar, Twin Peaks logo, and 17" diamond-cut alloys.
   */
  buildVehicle() {
    while (this.vehicleGroup.children.length > 0) {
      this.vehicleGroup.remove(this.vehicleGroup.children[0]);
    }
    this.paintMaterials = [];

    const L = this.carLength;        /* ~3.99 m */
    const W = this.carWidth;         /* ~1.821 m */
    const H = this.carHeight;        /* ~1.647 m */
    const WB = this.wheelbase;       /* ~2.60 m */
    const GC = this.groundClearance; /* ~0.201 m */

    /* --- Materials Library for Mahindra XUV 3XO --- */
    
    /* 1. Signature Body Paint Material */
    const bodyPaintMat = new THREE.MeshStandardMaterial({
      color: this.paintColor,
      metalness: 0.82,
      roughness: 0.28,
      envMapIntensity: 1.2
    });
    this.paintMaterials.push(bodyPaintMat);

    /* 2. Gloss Piano Black (Floating Roof, Pillars, Grille, Mirrors) */
    const pianoBlackMat = new THREE.MeshStandardMaterial({
      color: 0x0a0d14,
      metalness: 0.9,
      roughness: 0.15
    });

    /* 3. Matte Charcoal Cladding (Wheel Arches, Bumpers, Rockers) */
    const claddingMat = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      metalness: 0.1,
      roughness: 0.88
    });

    /* 4. Satin Brushed Silver / Aluminum (Skid Plates, Diffuser, Side Blades) */
    const satinSilverMat = new THREE.MeshStandardMaterial({
      color: 0xd6dbe4,
      metalness: 0.88,
      roughness: 0.28
    });

    /* 5. Mirror Chrome (Mahindra Twin Peaks Logo, XUV 3XO Badges) */
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.98,
      roughness: 0.05
    });

    /* 6. Deep Tinted Glass (Windshield, Side & Rear Windows) */
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1320,
      metalness: 0.15,
      roughness: 0.08,
      transmission: 0.65,
      transparent: true,
      opacity: 0.88
    });

    /* 7. Panoramic Skyroof Glass Panel */
    const skyroofMat = new THREE.MeshPhysicalMaterial({
      color: 0x050a12,
      metalness: 0.3,
      roughness: 0.05,
      transmission: 0.5,
      transparent: true,
      opacity: 0.92
    });

    /* 8. Front Inverted-C / Boomerang LED DRLs (Crisp Cold White) */
    const drlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f7ff,
      emissiveIntensity: 2.2
    });

    /* 9. Twin-Pod LED Projector Headlamps (Ice Blue Glow) */
    const projectorMat = new THREE.MeshStandardMaterial({
      color: 0x90caf9,
      emissive: 0x42a5f5,
      emissiveIntensity: 1.8
    });

    /* 10. Rear "Infinity" Connected Lightbar & C-Taillights (Vibrant Red) */
    const lightbarMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 2.5
    });

    /* 11. Rear Roof Spoiler CHMSL (High Mount Stop Lamp) */
    const chmslMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xd50000,
      emissiveIntensity: 2.0
    });

    /* 12. Side Mirror Amber Turn Indicators */
    const amberLedMat = new THREE.MeshStandardMaterial({
      color: 0xff9100,
      emissive: 0xff6d00,
      emissiveIntensity: 1.8
    });

    /* 13. Wheels: Tires, Diamond Cut Face, Pocket, Red Caliper */
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x13171f,
      roughness: 0.92,
      metalness: 0.05
    });
    const alloyFaceMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.9,
      roughness: 0.18
    });
    const alloyPocketMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c10,
      metalness: 0.85,
      roughness: 0.3
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0xd50000,
      metalness: 0.6,
      roughness: 0.3
    });

    /* --- Procedural Geometry Construction --- */

    /* 1. MAIN LOWER BODY (Tub & Door Sections) */
    const bodyHeight = H * 0.36;
    const bodyCenterY = GC + bodyHeight * 0.5 + 0.08;
    const mainBodyGeo = new THREE.BoxGeometry(W * 0.94, bodyHeight, L * 0.92);
    const mainBody = new THREE.Mesh(mainBodyGeo, bodyPaintMat);
    mainBody.position.set(0, bodyCenterY, 0);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    this.vehicleGroup.add(mainBody);

    /* Front Bonnet / Hood (Sloping forward towards front grille) */
    const hoodLen = L * 0.28;
    const hoodGeo = new THREE.BoxGeometry(W * 0.88, H * 0.08, hoodLen);
    const hood = new THREE.Mesh(hoodGeo, bodyPaintMat);
    hood.position.set(0, bodyCenterY + bodyHeight * 0.42, -L * 0.32);
    hood.rotation.x = 0.06;
    hood.castShadow = true;
    this.vehicleGroup.add(hood);

    /* Hood Power Creases (Twin aerodynamic raised ridges) */
    const creaseGeo = new THREE.BoxGeometry(0.04, 0.02, hoodLen * 0.9);
    [-W * 0.26, W * 0.26].forEach((xPos) => {
      const crease = new THREE.Mesh(creaseGeo, bodyPaintMat);
      crease.position.set(xPos, bodyCenterY + bodyHeight * 0.47, -L * 0.32);
      crease.rotation.x = 0.06;
      this.vehicleGroup.add(crease);
    });

    /* 2. GREENHOUSE (Cabin Cockpit) */
    const cabinLen = L * 0.52;
    const cabinH = H * 0.36;
    const cabinCenterY = bodyCenterY + bodyHeight * 0.5 + cabinH * 0.48;
    const cabinGeo = new THREE.BoxGeometry(W * 0.82, cabinH, cabinLen);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, cabinCenterY, L * 0.02);
    cabin.castShadow = true;
    this.vehicleGroup.add(cabin);

    /* 3. BLACK PILLARS (A, B, C Pillars for Floating Roof Effect) */
    /* Windshield Raked A-Pillars */
    const aPillarGeo = new THREE.BoxGeometry(0.06, cabinH * 1.05, 0.06);
    [-W * 0.40, W * 0.40].forEach((xPos) => {
      const aPillar = new THREE.Mesh(aPillarGeo, pianoBlackMat);
      aPillar.position.set(xPos, cabinCenterY, -cabinLen * 0.46);
      aPillar.rotation.x = -0.32;
      this.vehicleGroup.add(aPillar);
    });

    /* Center B-Pillars */
    [-W * 0.405, W * 0.405].forEach((xPos) => {
      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, cabinH, 0.08), pianoBlackMat);
      bPillar.position.set(xPos, cabinCenterY, L * 0.02);
      this.vehicleGroup.add(bPillar);
    });

    /* Rear C-Pillars */
    [-W * 0.40, W * 0.40].forEach((xPos) => {
      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, cabinH * 0.98, 0.10), pianoBlackMat);
      cPillar.position.set(xPos, cabinCenterY, cabinLen * 0.46);
      cPillar.rotation.x = 0.18;
      this.vehicleGroup.add(cPillar);
    });

    /* 4. FLOATING DUAL-TONE ROOF & SKYROOF */
    const roofLen = cabinLen * 1.02;
    const roofGeo = new THREE.BoxGeometry(W * 0.83, 0.05, roofLen);
    const roof = new THREE.Mesh(roofGeo, pianoBlackMat);
    roof.position.set(0, cabinCenterY + cabinH * 0.5 + 0.02, L * 0.02);
    roof.castShadow = true;
    this.vehicleGroup.add(roof);

    /* Panoramic Skyroof Glass Panel */
    const skyroofGeo = new THREE.PlaneGeometry(W * 0.62, roofLen * 0.58);
    const skyroof = new THREE.Mesh(skyroofGeo, skyroofMat);
    skyroof.rotation.x = -Math.PI / 2;
    skyroof.position.set(0, cabinCenterY + cabinH * 0.5 + 0.046, -0.05);
    this.vehicleGroup.add(skyroof);

    /* Functional Satin-Black Roof Rails (Left & Right) */
    const railLen = roofLen * 0.85;
    const railGeo = new THREE.BoxGeometry(0.035, 0.04, railLen);
    [-W * 0.38, W * 0.38].forEach((xPos) => {
      const rail = new THREE.Mesh(railGeo, pianoBlackMat);
      rail.position.set(xPos, cabinCenterY + cabinH * 0.5 + 0.065, L * 0.02);
      this.vehicleGroup.add(rail);

      [-railLen * 0.4, 0, railLen * 0.4].forEach((zOffset) => {
        const stanchion = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.06), pianoBlackMat);
        stanchion.position.set(xPos, cabinCenterY + cabinH * 0.5 + 0.04, L * 0.02 + zOffset);
        this.vehicleGroup.add(stanchion);
      });
    });

    /* Shark-Fin Antenna */
    const finGeo = new THREE.ConeGeometry(0.035, 0.09, 4);
    const fin = new THREE.Mesh(finGeo, pianoBlackMat);
    fin.rotation.y = Math.PI / 4;
    fin.rotation.x = -0.3;
    fin.position.set(0, cabinCenterY + cabinH * 0.5 + 0.07, roofLen * 0.42);
    this.vehicleGroup.add(fin);

    /* Rear Roof Spoiler with CHMSL (High-Mount Stop Lamp) */
    const spoilerGeo = new THREE.BoxGeometry(W * 0.84, 0.06, 0.22);
    const spoiler = new THREE.Mesh(spoilerGeo, pianoBlackMat);
    spoiler.position.set(0, cabinCenterY + cabinH * 0.48, L * 0.44);
    spoiler.castShadow = true;
    this.vehicleGroup.add(spoiler);

    const chmslGeo = new THREE.BoxGeometry(W * 0.28, 0.02, 0.02);
    const chmsl = new THREE.Mesh(chmslGeo, chmslMat);
    chmsl.position.set(0, cabinCenterY + cabinH * 0.48, L * 0.44 + 0.11);
    this.vehicleGroup.add(chmsl);

    /* 5. FRONT FASCIA: GRILLE, MAHINDRA TWIN PEAKS, & AIR DAM */
    const frontZ = -L * 0.46;
    
    /* Gloss Black Upper Grille Bar */
    const grilleBarGeo = new THREE.BoxGeometry(W * 0.80, H * 0.10, 0.06);
    const grilleBar = new THREE.Mesh(grilleBarGeo, pianoBlackMat);
    grilleBar.position.set(0, bodyCenterY + 0.10, frontZ);
    this.vehicleGroup.add(grilleBar);

    /* Chrome Diamond Accent Studs on Grille */
    [-0.24, -0.16, -0.08, 0.08, 0.16, 0.24].forEach((xOff) => {
      const studGeo = new THREE.BoxGeometry(0.025, 0.015, 0.01);
      const stud = new THREE.Mesh(studGeo, chromeMat);
      stud.position.set(xOff, bodyCenterY + 0.10, frontZ - 0.032);
      this.vehicleGroup.add(stud);
    });

    /* Mahindra "Twin Peaks" Front Chrome Emblem */
    const emblemGroup = new THREE.Group();
    const peakGeo = new THREE.CylinderGeometry(0.008, 0.015, 0.07, 4);
    const peakLeft = new THREE.Mesh(peakGeo, chromeMat);
    peakLeft.rotation.z = 0.45;
    peakLeft.position.set(-0.02, 0, 0);
    const peakRight = new THREE.Mesh(peakGeo, chromeMat);
    peakRight.rotation.z = -0.45;
    peakRight.position.set(0.02, 0, 0);
    emblemGroup.add(peakLeft);
    emblemGroup.add(peakRight);
    emblemGroup.position.set(0, bodyCenterY + 0.10, frontZ - 0.035);
    this.vehicleGroup.add(emblemGroup);

    /* Front Inverted-C / Boomerang LED DRLs (Left & Right) */
    [-1, 1].forEach((side) => {
      const drlGroup = new THREE.Group();
      /* Upper horizontal brow */
      const brow = new THREE.Mesh(new THREE.BoxGeometry(W * 0.14, 0.025, 0.04), drlMat);
      brow.position.set(side * (W * 0.32), 0.08, 0);
      drlGroup.add(brow);

      /* Sweeping vertical outer blade (Inverted-C drop) */
      const drop = new THREE.Mesh(new THREE.BoxGeometry(0.025, H * 0.16, 0.04), drlMat);
      drop.position.set(side * (W * 0.385), -0.01, 0);
      drlGroup.add(drop);

      /* Lower inward return hook of the 'C' */
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.04), drlMat);
      hook.position.set(side * (W * 0.36), -H * 0.09, 0);
      drlGroup.add(hook);

      /* Twin-Pod LED Projector Lenses (Vertically Stacked) */
      const projUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 16), projectorMat);
      projUpper.rotation.x = Math.PI / 2;
      projUpper.position.set(side * (W * 0.33), 0.03, -0.01);
      drlGroup.add(projUpper);

      const projLower = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 16), projectorMat);
      projLower.rotation.x = Math.PI / 2;
      projLower.position.set(side * (W * 0.33), -0.045, -0.01);
      drlGroup.add(projLower);

      drlGroup.position.set(0, bodyCenterY + 0.06, frontZ - 0.02);
      this.vehicleGroup.add(drlGroup);
    });

    /* Lower Front Bumper & Air Dam */
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, H * 0.18, 0.12), claddingMat);
    frontBumper.position.set(0, GC + H * 0.10, frontZ - 0.02);
    this.vehicleGroup.add(frontBumper);

    /* Satin Silver Front Skid Plate with 3 Aerodynamic Ribs */
    const skidGeo = new THREE.BoxGeometry(W * 0.44, 0.08, 0.06);
    const frontSkid = new THREE.Mesh(skidGeo, satinSilverMat);
    frontSkid.position.set(0, GC + 0.05, frontZ - 0.07);
    this.vehicleGroup.add(frontSkid);

    [-0.10, 0, 0.10].forEach((rx) => {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.07, 0.04), satinSilverMat);
      rib.position.set(rx, GC + 0.05, frontZ - 0.09);
      this.vehicleGroup.add(rib);
    });

    /* Direction Indicator Chevron on Hood */
    const chevGeo = new THREE.ConeGeometry(W * 0.10, L * 0.10, 3);
    const chevMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    const chev = new THREE.Mesh(chevGeo, chevMat);
    chev.rotation.x = -Math.PI / 2;
    chev.rotation.z = Math.PI;
    chev.position.set(0, bodyCenterY + bodyHeight * 0.48, -L * 0.28);
    this.vehicleGroup.add(chev);

    /* 6. REAR FASCIA: "INFINITY" CONNECTED LIGHTBAR, TAILGATE & DIFFUSER */
    const rearZ = L * 0.46;

    /* Signature Full-Width "Infinity" Connected LED Lightbar */
    const lightbarGeo = new THREE.BoxGeometry(W * 0.78, 0.026, 0.04);
    const lightbar = new THREE.Mesh(lightbarGeo, lightbarMat);
    lightbar.position.set(0, bodyCenterY + 0.14, rearZ + 0.01);
    this.vehicleGroup.add(lightbar);

    /* C-shaped Outer LED Taillight Clusters (Left & Right) */
    [-1, 1].forEach((side) => {
      const cTailGroup = new THREE.Group();
      const vBracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, H * 0.12, 0.04), lightbarMat);
      vBracket.position.set(side * (W * 0.385), 0, 0);
      cTailGroup.add(vBracket);

      const lowerHook = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.026, 0.04), lightbarMat);
      lowerHook.position.set(side * (W * 0.35), -H * 0.05, 0);
      cTailGroup.add(lowerHook);

      cTailGroup.position.set(0, bodyCenterY + 0.14, rearZ + 0.01);
      this.vehicleGroup.add(cTailGroup);
    });

    /* Chrome "XUV 3XO" Rear Badge Plate */
    const badgeBar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.01), chromeMat);
    badgeBar.position.set(0, bodyCenterY + 0.04, rearZ + 0.02);
    this.vehicleGroup.add(badgeBar);

    /* Rear Bumper Matte Cladding */
    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, H * 0.20, 0.14), claddingMat);
    rearBumper.position.set(0, GC + H * 0.11, rearZ + 0.02);
    this.vehicleGroup.add(rearBumper);

    /* Satin Silver Rear Diffuser with Dual Exhaust Recesses */
    const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(W * 0.52, 0.09, 0.05), satinSilverMat);
    rearDiffuser.position.set(0, GC + 0.06, rearZ + 0.08);
    this.vehicleGroup.add(rearDiffuser);

    [-W * 0.18, W * 0.18].forEach((exX) => {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), pianoBlackMat);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(exX, GC + 0.06, rearZ + 0.10);
      this.vehicleGroup.add(exhaust);
    });

    /* 7. SIDE PROFILE: WHEEL ARCH CLADDING & SILL ACCENT BLADES */
    /* Lower Door Sill Claddings with Satin Silver Blades */
    [-1, 1].forEach((side) => {
      const sillCladding = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, WB * 0.88), claddingMat);
      sillCladding.position.set(side * (W * 0.47), GC + 0.06, 0);
      this.vehicleGroup.add(sillCladding);

      const sillBlade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, WB * 0.72), satinSilverMat);
      sillBlade.position.set(side * (W * 0.49), GC + 0.06, 0);
      this.vehicleGroup.add(sillBlade);
    });

    /* Dual-Tone Aerodynamic Side Mirrors with Amber LED Blinkers */
    [-1, 1].forEach((side) => {
      const mirGroup = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.08, 8), claddingMat);
      stalk.rotation.z = side * -0.5;
      stalk.position.set(side * 0.03, 0, 0);
      mirGroup.add(stalk);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.14), pianoBlackMat);
      cap.position.set(side * 0.08, 0.03, 0);
      mirGroup.add(cap);

      const blinker = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.018, 0.12), amberLedMat);
      blinker.position.set(side * 0.135, 0.03, 0);
      mirGroup.add(blinker);

      mirGroup.position.set(side * (W * 0.46), cabinCenterY - 0.04, -L * 0.16);
      this.vehicleGroup.add(mirGroup);
    });

    /* 8. 17-INCH DIAMOND-CUT ALLOY WHEELS & RED BRAKE CALIPERS */
    const tireRadius = H * 0.21;
    const tireW = W * 0.12;
    const trackHalfW = W * 0.44;

    const wheelConfigs = [
      { x: -trackHalfW, z: -WB * 0.5, name: "FL" },
      { x:  trackHalfW, z: -WB * 0.5, name: "FR" },
      { x: -trackHalfW, z:  WB * 0.5, name: "RL" },
      { x:  trackHalfW, z:  WB * 0.5, name: "RR" }
    ];

    wheelConfigs.forEach((cfg) => {
      const wheelGroup = new THREE.Group();
      const isLeft = cfg.x < 0;

      const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireW, 28);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      const barrelGeo = new THREE.CylinderGeometry(tireRadius * 0.68, tireRadius * 0.68, tireW * 1.01, 24);
      const barrel = new THREE.Mesh(barrelGeo, alloyPocketMat);
      barrel.rotation.z = Math.PI / 2;
      wheelGroup.add(barrel);

      const faceGeo = new THREE.CylinderGeometry(tireRadius * 0.65, tireRadius * 0.65, 0.015, 5);
      const face = new THREE.Mesh(faceGeo, alloyFaceMat);
      face.rotation.z = Math.PI / 2;
      face.position.x = isLeft ? -tireW * 0.49 : tireW * 0.49;
      wheelGroup.add(face);

      const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16), chromeMat);
      hubCap.rotation.z = Math.PI / 2;
      hubCap.position.x = isLeft ? -tireW * 0.51 : tireW * 0.51;
      wheelGroup.add(hubCap);

      const disc = new THREE.Mesh(new THREE.CylinderGeometry(tireRadius * 0.52, tireRadius * 0.52, 0.01, 16), satinSilverMat);
      disc.rotation.z = Math.PI / 2;
      wheelGroup.add(disc);

      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.04, tireRadius * 0.28, tireRadius * 0.22), caliperMat);
      caliper.position.set(0, tireRadius * 0.24, 0);
      wheelGroup.add(caliper);

      wheelGroup.position.set(cfg.x, tireRadius, cfg.z);
      this.vehicleGroup.add(wheelGroup);

      const archGeo = new THREE.BoxGeometry(0.06, tireRadius * 1.25, tireRadius * 2.3);
      const arch = new THREE.Mesh(archGeo, claddingMat);
      arch.position.set(cfg.x * 1.02, GC + tireRadius * 0.95, cfg.z);
      this.vehicleGroup.add(arch);
    });

    /* 9. REALISTIC UNDER-CAR SOFT DROP SHADOW */
    const shadowGeo = new THREE.PlaneGeometry(W * 1.25, L * 1.12);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.6
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.005;
    this.vehicleGroup.add(shadowMesh);
  }

  buildSensorsAndSectors() {
    this.sensorsGroup.clear();
    this.sectorsGroup.clear();
    this.sensorMeshes = [];
    this.obstacleSectors = [];

    const sensorsConfig = this.config.sensors || this.getDefaultSensorConfig();

    sensorsConfig.forEach((cfg) => {
      /*
       * Coordinate Mapping:
       * ISO 8855 Vehicle Frame: +X Forward, +Y Left, +Z Up (in cm)
       * Three.js Frame: -Z is Forward, -X is Left, +Y is Up (in meters)
       */
      const x3d = -cfg.position_cm.y / 100.0;
      const y3d = cfg.position_cm.z / 100.0;
      const z3d = -cfg.position_cm.x / 100.0;

      /* Sensor Mount Puck */
      const puckGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16);
      const puckMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.5,
        roughness: 0.3
      });
      const puck = new THREE.Mesh(puckGeo, puckMat);
      puck.position.set(x3d, y3d, z3d);

      /* Direction Arrow */
      const arrowLen = 0.22;
      const arrowGeo = new THREE.ConeGeometry(0.04, arrowLen, 12);
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.y = arrowLen * 0.5;

      const arrowHolder = new THREE.Group();
      arrowHolder.position.set(x3d, y3d, z3d);
      
      /* Calculate Rotation in Three.js horizontal X-Z plane */
      const azimuthRad = (cfg.azimuth_deg * Math.PI) / 180.0;
      const threeYaw = azimuthRad + Math.PI / 2;
      arrowHolder.rotation.y = threeYaw;
      arrow.rotation.x = Math.PI / 2;
      arrowHolder.add(arrow);

      this.sensorsGroup.add(puck);
      this.sensorsGroup.add(arrowHolder);

      /* Obstacle Detection Sector Mesh (Cone of FOV ~60 deg) */
      const fovRad = ((cfg.fov_deg || 60.0) * Math.PI) / 180.0;
      const sectorGeo = new THREE.RingGeometry(0.2, 1.5, 24, 1, -fovRad / 2, fovRad);
      const sectorMat = new THREE.MeshBasicMaterial({
        color: 0x00e676,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
      });
      const sectorMesh = new THREE.Mesh(sectorGeo, sectorMat);
      sectorMesh.rotation.x = -Math.PI / 2;
      sectorMesh.position.set(x3d, 0.02, z3d);
      sectorMesh.rotation.z = -threeYaw - Math.PI / 2;
      this.sectorsGroup.add(sectorMesh);

      /* Obstacle Reflection Arc Curve */
      const arcMat = new THREE.LineBasicMaterial({
        color: 0x00e676,
        linewidth: 3,
        transparent: true,
        opacity: 0.0
      });
      const arcGeo = new THREE.BufferGeometry();
      const arcLine = new THREE.Line(arcGeo, arcMat);
      arcLine.position.set(x3d, 0.03, z3d);
      this.sectorsGroup.add(arcLine);

      this.sensorMeshes.push({
        id: cfg.id,
        puckMat: puckMat,
        arrowMat: arrowMat,
        arrowHolder: arrowHolder,
        sectorMesh: sectorMesh,
        sectorMat: sectorMat,
        arcLine: arcLine,
        arcMat: arcMat,
        origin3d: new THREE.Vector3(x3d, y3d, z3d),
        azimuthRad: azimuthRad,
        fovRad: fovRad,
        threeYaw: threeYaw
      });
    });
  }

  getDefaultSensorConfig() {
    return [
      { id: 0, position_cm: { x: 199.5, y: 65.0, z: 50.0 }, azimuth_deg: 45, fov_deg: 60 },
      { id: 1, position_cm: { x: 199.5, y: 0.0, z: 50.0 }, azimuth_deg: 0, fov_deg: 65 },
      { id: 2, position_cm: { x: 199.5, y: -65.0, z: 50.0 }, azimuth_deg: -45, fov_deg: 60 },
      { id: 3, position_cm: { x: 80.0, y: -91.0, z: 50.0 }, azimuth_deg: -90, fov_deg: 60 },
      { id: 4, position_cm: { x: -80.0, y: -91.0, z: 50.0 }, azimuth_deg: -90, fov_deg: 60 },
      { id: 5, position_cm: { x: -199.5, y: -65.0, z: 50.0 }, azimuth_deg: -135, fov_deg: 60 },
      { id: 6, position_cm: { x: -199.5, y: 65.0, z: 50.0 }, azimuth_deg: 135, fov_deg: 60 },
      { id: 7, position_cm: { x: 0.0, y: 91.0, z: 50.0 }, azimuth_deg: 90, fov_deg: 60 }
    ];
  }

  updateTelemetry(telemetry) {
    if (!telemetry || !telemetry.sensors) return;

    const time = performance.now() * 0.005;

    telemetry.sensors.forEach((s) => {
      const meshObj = this.sensorMeshes[s.id];
      if (!meshObj) return;

      const hasDist = (s.distance_cm !== null && s.distance_cm > 0);
      const isBlind = (s.status === "below_blindzone");

      if (hasDist || isBlind) {
        const distCm = hasDist ? Math.max(12, s.distance_cm) : 20.0;
        const d_m = distCm / 100.0;
        let colorHex = 0x00e676; /* Green */
        let opacity = 0.45;

        if (distCm <= this.threshRed || isBlind) {
          colorHex = 0xff1744; /* Red */
          opacity = 0.75 + 0.2 * Math.sin(time * 8.0); /* Warning pulse */
        } else if (distCm <= this.threshYellow) {
          colorHex = 0xffd600; /* Yellow */
          opacity = 0.55;
        }

        /* Update Sector Mesh Geometry dynamically to match distance */
        const fov = meshObj.fovRad;
        meshObj.sectorMesh.geometry.dispose();
        meshObj.sectorMesh.geometry = new THREE.RingGeometry(0.1, d_m, 24, 1, -fov / 2, fov);
        meshObj.sectorMat.color.setHex(colorHex);
        meshObj.sectorMat.opacity = opacity;
        meshObj.arrowMat.color.setHex(colorHex);

        /* Update Obstacle Reflection Arc */
        const points = [];
        const numPts = 16;
        for (let p = 0; p <= numPts; p++) {
          const a = -fov / 2 + (fov * p) / numPts;
          const rx = d_m * Math.sin(a);
          const rz = -d_m * Math.cos(a);
          const worldX = rx * Math.cos(meshObj.threeYaw) - rz * Math.sin(meshObj.threeYaw);
          const worldZ = rx * Math.sin(meshObj.threeYaw) + rz * Math.cos(meshObj.threeYaw);
          points.push(new THREE.Vector3(worldX, 0.03, worldZ));
        }
        meshObj.arcLine.geometry.dispose();
        meshObj.arcLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
        meshObj.arcMat.color.setHex(colorHex);
        meshObj.arcMat.opacity = Math.min(opacity + 0.3, 1.0);

      } else {
        /* Timeout, out-of-range, or stale: fade out */
        meshObj.sectorMat.opacity = Math.max(0, meshObj.sectorMat.opacity - 0.05);
        meshObj.arcMat.opacity = Math.max(0, meshObj.arcMat.opacity - 0.05);
        meshObj.arrowMat.color.setHex(0x455a64);
      }
    });
  }

  setCameraView(viewName) {
    if (viewName === "top") {
      this.cameraTarget.set(0, 0, 0);
      this.spherical.radius = 8.5;
      this.spherical.phi = 0.01; /* straight down */
      this.spherical.theta = Math.PI / 2;
    } else if (viewName === "iso") {
      this.cameraTarget.set(0, 0.6, 0);
      this.spherical.radius = 8.8;
      this.spherical.phi = Math.PI / 3.2;
      this.spherical.theta = Math.PI / 4.0;
    } else if (viewName === "chase") {
      this.cameraTarget.set(0, 0.6, -1.0);
      this.spherical.radius = 6.8;
      this.spherical.phi = Math.PI / 2.6;
      this.spherical.theta = Math.PI;
    } else if (viewName === "front") {
      this.cameraTarget.set(0, 0.6, 1.0);
      this.spherical.radius = 6.8;
      this.spherical.phi = Math.PI / 2.6;
      this.spherical.theta = 0;
    } else if (viewName === "reset") {
      this.setCameraView("iso");
    }
    this.updateCameraFromSpherical();
  }

  updateCameraFromSpherical() {
    const s = this.spherical;
    const x = s.radius * Math.sin(s.phi) * Math.sin(s.theta);
    const y = s.radius * Math.cos(s.phi);
    const z = s.radius * Math.sin(s.phi) * Math.cos(s.theta);
    this.camera.position.set(x, y, z).add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
  }

  setupInputHandlers() {
    const onStart = (clientX, clientY) => {
      this.isDragging = true;
      this.prevMousePos.x = clientX;
      this.prevMousePos.y = clientY;
    };

    const onMove = (clientX, clientY) => {
      if (!this.isDragging) return;
      const dx = clientX - this.prevMousePos.x;
      const dy = clientY - this.prevMousePos.y;
      this.prevMousePos.x = clientX;
      this.prevMousePos.y = clientY;

      this.spherical.theta -= dx * 0.008;
      this.spherical.phi = Math.max(0.01, Math.min(Math.PI / 2.05, this.spherical.phi - dy * 0.008));
      this.updateCameraFromSpherical();
    };

    const onEnd = () => {
      this.isDragging = false;
    };

    this.canvas.addEventListener("mousedown", (e) => onStart(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", onEnd);

    /* Mobile Touch Events */
    this.canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener("touchend", onEnd);

    /* Zoom with Mouse Wheel */
    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.spherical.radius = Math.max(3.0, Math.min(20.0, this.spherical.radius + e.deltaY * 0.01));
      this.updateCameraFromSpherical();
    }, { passive: false });

    /* Window Resize */
    window.addEventListener("resize", () => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  animate() {
    requestAnimationFrame(this.animate);

    if (this.autoRotate && !this.isDragging) {
      this.spherical.theta += 0.005;
      this.updateCameraFromSpherical();
    }

    this.renderer.render(this.scene, this.camera);
  }
}
