import * as THREE from "./three.module.js";

/**
 * 3D Vehicle & Obstacle Visualizer
 * Renders procedural vehicle, sensor mounts, range rings, and dynamic acoustic obstacle sectors.
 */
export class VehicleView {
  constructor(canvasElement, config) {
    this.canvas = canvasElement;
    this.config = config || {};
    
    /* Configurable Vehicle Dimensions (in meters) */
    this.carLength = (this.config.vehicle?.length_cm || 460.0) / 100.0;
    this.carWidth = (this.config.vehicle?.width_cm || 185.0) / 100.0;
    this.carHeight = (this.config.vehicle?.height_cm || 145.0) / 100.0;
    this.wheelbase = (this.config.vehicle?.wheelbase_cm || 270.0) / 100.0;
    
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
    this.defaultCamPos = new THREE.Vector3(5.5, 6.0, 6.0);
    this.camera.position.copy(this.defaultCamPos);
    this.cameraTarget = new THREE.Vector3(0, 0.5, 0);
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
    this.spherical = { radius: 9.5, phi: Math.PI / 3.2, theta: Math.PI / 4.0 };
    
    this.setupLighting();
    this.setupGroundAndRings();
    this.buildVehicle();
    this.buildSensorsAndSectors();
    this.setupInputHandlers();
    
    this.lastFrameTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
    dirLight.position.set(10, 15, 8);
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

    const blueRimLight = new THREE.DirectionalLight(0x00b0ff, 0.7);
    blueRimLight.position.set(-8, 5, -8);
    this.scene.add(blueRimLight);
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
        opacity: 0.4
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.005;
      this.scene.add(ring);
    });
  }

  buildVehicle() {
    while (this.vehicleGroup.children.length > 0) {
      this.vehicleGroup.remove(this.vehicleGroup.children[0]);
    }

    const L = this.carLength;
    const W = this.carWidth;
    const H = this.carHeight;

    /* Metallic Slate Body Paint */
    const carBodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25
    });

    /* Gloss Dark Glass */
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.6,
      transparent: true,
      opacity: 0.8
    });

    /* Wheels & Rubber */
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });

    /* Lower Chassis */
    const lowerBodyGeo = new THREE.BoxGeometry(W * 0.95, H * 0.38, L * 0.96);
    const lowerBody = new THREE.Mesh(lowerBodyGeo, carBodyMat);
    lowerBody.position.y = H * 0.32;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    this.vehicleGroup.add(lowerBody);

    /* Cabin / Cockpit Roof */
    const cabinGeo = new THREE.BoxGeometry(W * 0.82, H * 0.42, L * 0.52);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, H * 0.65, -L * 0.04);
    cabin.castShadow = true;
    this.vehicleGroup.add(cabin);

    /* Roof Cap */
    const roofGeo = new THREE.BoxGeometry(W * 0.78, H * 0.06, L * 0.48);
    const roof = new THREE.Mesh(roofGeo, carBodyMat);
    roof.position.set(0, H * 0.88, -L * 0.04);
    roof.castShadow = true;
    this.vehicleGroup.add(roof);

    /* Headlights (Front is -Z in standard Three.js view) */
    const headLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xe0f2fe,
      emissiveIntensity: 1.5
    });
    const hlGeo = new THREE.BoxGeometry(W * 0.2, H * 0.08, 0.05);
    const hlLeft = new THREE.Mesh(hlGeo, headLightMat);
    hlLeft.position.set(-W * 0.32, H * 0.35, -L * 0.48);
    const hlRight = new THREE.Mesh(hlGeo, headLightMat);
    hlRight.position.set(W * 0.32, H * 0.35, -L * 0.48);
    this.vehicleGroup.add(hlLeft);
    this.vehicleGroup.add(hlRight);

    /* Taillights (Rear is +Z) */
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 1.5
    });
    const tlGeo = new THREE.BoxGeometry(W * 0.24, H * 0.08, 0.05);
    const tlLeft = new THREE.Mesh(tlGeo, tailLightMat);
    tlLeft.position.set(-W * 0.32, H * 0.38, L * 0.48);
    const tlRight = new THREE.Mesh(tlGeo, tailLightMat);
    tlRight.position.set(W * 0.32, H * 0.38, L * 0.48);
    this.vehicleGroup.add(tlLeft);
    this.vehicleGroup.add(tlRight);

    /* Side Mirrors */
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const mirrorGeo = new THREE.BoxGeometry(W * 0.12, H * 0.08, L * 0.06);
    const mirLeft = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirLeft.position.set(-W * 0.52, H * 0.58, -L * 0.12);
    const mirRight = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirRight.position.set(W * 0.52, H * 0.58, -L * 0.12);
    this.vehicleGroup.add(mirLeft);
    this.vehicleGroup.add(mirRight);

    /* Direction Chevron on Hood */
    const chevGeo = new THREE.ConeGeometry(W * 0.14, L * 0.12, 3);
    const chevMat = new THREE.MeshBasicMaterial({ color: 0x00e676 });
    const chev = new THREE.Mesh(chevGeo, chevMat);
    chev.rotation.x = -Math.PI / 2;
    chev.rotation.z = Math.PI;
    chev.position.set(0, H * 0.52, -L * 0.32);
    this.vehicleGroup.add(chev);

    /* 4 Wheels */
    const tireRadius = H * 0.24;
    const tireWidth = W * 0.12;
    const wheelPositions = [
      { x: -W * 0.48, z: -this.wheelbase * 0.5 }, /* Front-Left */
      { x:  W * 0.48, z: -this.wheelbase * 0.5 }, /* Front-Right */
      { x: -W * 0.48, z:  this.wheelbase * 0.5 }, /* Rear-Left */
      { x:  W * 0.48, z:  this.wheelbase * 0.5 }  /* Rear-Right */
    ];

    wheelPositions.forEach((pos) => {
      const wheelGroup = new THREE.Group();
      const tireGeo = new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 24);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rimGeo = new THREE.CylinderGeometry(tireRadius * 0.65, tireRadius * 0.65, tireWidth * 1.05, 16);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      wheelGroup.position.set(pos.x, tireRadius, pos.z);
      this.vehicleGroup.add(wheelGroup);
    });

    /* Under-car Shadow Decal */
    const shadowGeo = new THREE.PlaneGeometry(W * 1.15, L * 1.08);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.55
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = 0.01;
    this.vehicleGroup.add(shadowMesh);
  }

  buildSensorsAndSectors() {
    this.sensorsGroup.clear();
    this.sectorsGroup.clear();
    this.sensorMeshes = [];
    this.obstacleSectors = [];

    const sensorsConfig = this.config.sensors || this.getDefaultSensorConfig();

    sensorsConfig.forEach((cfg, idx) => {
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
      const threeYaw = azimuthRad + Math.PI / 2; /* align with Three.js forward */
      arrowHolder.rotation.y = threeYaw;
      arrow.rotation.x = Math.PI / 2; /* point horizontal */
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
      { id: 0, position_cm: { x: 230, y: 70, z: 55 }, azimuth_deg: 45, fov_deg: 60 },
      { id: 1, position_cm: { x: 230, y: 0, z: 55 }, azimuth_deg: 0, fov_deg: 65 },
      { id: 2, position_cm: { x: 230, y: -70, z: 55 }, azimuth_deg: -45, fov_deg: 60 },
      { id: 3, position_cm: { x: 100, y: -92.5, z: 55 }, azimuth_deg: -90, fov_deg: 60 },
      { id: 4, position_cm: { x: -100, y: -92.5, z: 55 }, azimuth_deg: -90, fov_deg: 60 },
      { id: 5, position_cm: { x: -230, y: -70, z: 55 }, azimuth_deg: -135, fov_deg: 60 },
      { id: 6, position_cm: { x: -230, y: 70, z: 55 }, azimuth_deg: 135, fov_deg: 60 },
      { id: 7, position_cm: { x: 0, y: 92.5, z: 55 }, azimuth_deg: 90, fov_deg: 60 }
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
          /* Local arc relative to sensor */
          const rx = d_m * Math.sin(a);
          const rz = -d_m * Math.cos(a);
          /* Rotate by sensor yaw */
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
      this.cameraTarget.set(0, 0.5, 0);
      this.spherical.radius = 9.5;
      this.spherical.phi = Math.PI / 3.2;
      this.spherical.theta = Math.PI / 4.0;
    } else if (viewName === "chase") {
      this.cameraTarget.set(0, 0.5, -1.0);
      this.spherical.radius = 7.0;
      this.spherical.phi = Math.PI / 2.6;
      this.spherical.theta = Math.PI;
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
