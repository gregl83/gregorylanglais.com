import * as THREE from 'three';

/**
 * Deep Space Starscape with Multi-Layer Parallax
 * Starscape in the deepest layer, UI elements in the foreground
 */

(function initStarscape() {
    const canvas = document.getElementById('space-canvas');
    if (!canvas) return;

    // Respect accessibility reduced-motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // 1. Scene, Camera & Renderer Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0007);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 3000);
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1.0);

    const clock = new THREE.Clock();
    const commonUniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    };

    // 2. Star Shader Materials (Realistic Shimmer & Diffraction Spikes)
    const starVertexShader = `
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aTwinkleSpeed;
        attribute float aTwinklePhase;
        attribute float aBrightness;
        attribute float aFlare;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;

        void main() {
            vColor = aColor;
            vFlare = aFlare;

            // Harmonic organic twinkling
            float t = uTime * aTwinkleSpeed + aTwinklePhase;
            float pulse = sin(t) * 0.5 + 0.5;
            float pulseFast = sin(t * 2.1 + 1.3) * 0.25 + 0.25;
            float combined = mix(pulse, pulseFast, 0.35);

            float intensity = aBrightness * (0.6 + 0.4 * combined);
            vAlpha = intensity;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            float sizeScale = (aFlare > 0.5) ? (1.0 + 0.3 * combined) : (0.85 + 0.25 * combined);
            // Attenuate point size by distance into negative Z
            gl_PointSize = aSize * uPixelRatio * sizeScale * (450.0 / -mvPosition.z);
            gl_PointSize = max(gl_PointSize, 1.2);
        }
    `;

    const starFragmentShader = `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            // Intense core with smooth Gaussian starlight falloff
            float core = exp(-dist * 12.0);
            float glow = exp(-dist * 4.5) * 0.4;
            float alpha = core + glow;

            // Telescope 4-point optical diffraction spikes on glistening stars
            if (vFlare > 0.5) {
                float spikeX = max(0.0, 1.0 - abs(coord.y) * 16.0) * exp(-abs(coord.x) * 4.0);
                float spikeY = max(0.0, 1.0 - abs(coord.x) * 16.0) * exp(-abs(coord.y) * 4.0);
                alpha += (spikeX + spikeY) * 0.7;
            }

            alpha *= vAlpha;

            // Blend spectral hue with pure white stellar core
            vec3 finalColor = mix(vColor, vec3(1.0, 1.0, 1.0), core * 0.85);

            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: commonUniforms,
        vertexShader: starVertexShader,
        fragmentShader: starFragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    // Astronomical Stellar Spectral Colors
    const stellarPalette = [
        new THREE.Color('#9db4ff'), // O/B: Blue giant
        new THREE.Color('#bbccff'), // B: Azure
        new THREE.Color('#f8f9ff'), // A: Pure white
        new THREE.Color('#ffffff'), // Core white
        new THREE.Color('#fff4e8'), // F: Warm white
        new THREE.Color('#ffd2a1'), // G: Solar gold
        new THREE.Color('#ffb366')  // K: Amber
    ];

    function getRandomColor() {
        const r = Math.random();
        if (r < 0.35) return stellarPalette[2]; // White
        if (r < 0.60) return stellarPalette[0]; // Blue
        if (r < 0.75) return stellarPalette[1]; // Azure
        if (r < 0.90) return stellarPalette[4]; // Warm white
        return stellarPalette[5]; // Solar gold
    }

    // 3. Create Starfield in the DEEP Background (z = -350 to -1800)
    const starLayers = [];

    function buildStarField(count, zMin, zMax, sizeMin, sizeMax, flareRatio, rotSpeed, parallaxCoeff) {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const speeds = new Float32Array(count);
        const phases = new Float32Array(count);
        const brightness = new Float32Array(count);
        const flares = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            // Spread across wide background frustum
            const depth = zMin + Math.random() * (zMax - zMin);
            const spreadFactor = Math.abs(depth) * 0.75;

            positions[i * 3]     = (Math.random() - 0.5) * spreadFactor * 2.2;
            positions[i * 3 + 1] = (Math.random() - 0.5) * spreadFactor * 1.4;
            positions[i * 3 + 2] = depth; // Strictly negative Z (in the background)

            const col = getRandomColor();
            colors[i * 3]     = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;

            const isFlare = Math.random() < flareRatio;
            flares[i] = isFlare ? 1.0 : 0.0;
            sizes[i] = isFlare ? (sizeMax * 1.4) : (sizeMin + Math.random() * (sizeMax - sizeMin));

            speeds[i] = 1.2 + Math.random() * 2.8;
            phases[i] = Math.random() * Math.PI * 2;
            brightness[i] = isFlare ? (0.8 + Math.random() * 0.4) : (0.4 + Math.random() * 0.6);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geom.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(speeds, 1));
        geom.setAttribute('aTwinklePhase', new THREE.BufferAttribute(phases, 1));
        geom.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
        geom.setAttribute('aFlare', new THREE.BufferAttribute(flares, 1));

        const points = new THREE.Points(geom, starMaterial);
        scene.add(points);
        starLayers.push({ obj: points, rotSpeed, parallaxCoeff });
    }

    // Deepest cosmos: 4,500 distant pinpoints (z = -900 to -1800)
    buildStarField(4500, -1800, -900, 1.2, 2.0, 0.0, 0.00004, 0.003);

    // Midground stars: 1,800 stars (z = -500 to -900)
    buildStarField(1800, -900, -500, 2.0, 3.2, 0.02, 0.00008, 0.008);

    // Glistening stars: 120 stars with diffraction spikes (z = -350 to -550)
    buildStarField(120, -550, -350, 4.0, 6.0, 0.9, 0.00012, 0.015);

    // 4. Subtle Interstellar Cosmic Nebula (z = -1200)
    function buildNebula() {
        const count = 35;
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const sz = new Float32Array(count);

        const nebulaColors = [
            new THREE.Color('#0b1029'), // Deep indigo
            new THREE.Color('#140b2b'), // Midnight violet
            new THREE.Color('#071724')  // Cosmic cyan
        ];

        for (let i = 0; i < count; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 1600;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 1000;
            pos[i * 3 + 2] = -1000 - Math.random() * 800; // Deepest background

            const c = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
            col[i * 3]     = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;

            sz[i] = 450 + Math.random() * 350;
        }

        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geom.setAttribute('size', new THREE.BufferAttribute(sz, 1));

        const cloudCanvas = document.createElement('canvas');
        cloudCanvas.width = 128;
        cloudCanvas.height = 128;
        const ctx = cloudCanvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.15)');
        grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.03)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        const cloudTexture = new THREE.CanvasTexture(cloudCanvas);

        const cloudMat = new THREE.PointsMaterial({
            size: 450,
            map: cloudTexture,
            vertexColors: true,
            transparent: true,
            opacity: 0.22,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const nebula = new THREE.Points(geom, cloudMat);
        scene.add(nebula);
        starLayers.push({ obj: nebula, rotSpeed: 0.00002, parallaxCoeff: 0.002 });
    }
    buildNebula();

    // 5. Periodic Shooting Stars (Meteors) in Deep Background
    const meteorMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending
    });

    const meteorGeom = new THREE.BufferGeometry();
    meteorGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const meteor = new THREE.Line(meteorGeom, meteorMat);
    scene.add(meteor);

    let meteorActive = false;
    let meteorStartTime = 0;
    let meteorDuration = 0.9;
    let meteorStart = new THREE.Vector3();
    let meteorEnd = new THREE.Vector3();
    let nextMeteorTime = performance.now() + 5000;

    function triggerMeteor(now) {
        meteorActive = true;
        meteorStartTime = now;
        meteorDuration = 0.7 + Math.random() * 0.5;

        const angle = -0.35 + (Math.random() - 0.5) * 0.6;
        const len = 300 + Math.random() * 200;
        const z = -450 - Math.random() * 250;

        meteorStart.set(
            (Math.random() - 0.5) * 800,
            200 + Math.random() * 200,
            z
        );
        meteorEnd.set(
            meteorStart.x + Math.cos(angle) * len,
            meteorStart.y - Math.sin(angle) * len * 0.7,
            z - 80
        );

        nextMeteorTime = now + 9000 + Math.random() * 9000;
    }

    function updateMeteor(now) {
        if (!meteorActive) {
            if (now > nextMeteorTime) triggerMeteor(now);
            return;
        }

        const elapsed = (now - meteorStartTime) / 1000;
        const progress = elapsed / meteorDuration;

        if (progress >= 1.0) {
            meteorActive = false;
            meteorMat.opacity = 0;
            return;
        }

        const alpha = Math.sin(progress * Math.PI);
        meteorMat.opacity = Math.max(0, alpha * 0.8);

        const head = meteorStart.clone().lerp(meteorEnd, progress);
        const trailProg = Math.max(0, progress - 0.2);
        const tail = meteorStart.clone().lerp(meteorEnd, trailProg);

        const pos = meteorGeom.attributes.position;
        pos.setXYZ(0, head.x, head.y, head.z);
        pos.setXYZ(1, tail.x, tail.y, tail.z);
        pos.needsUpdate = true;
    }

    // 6. Precision Parallax Controller (Desktop & Mobile)
    const pointer = {
        targetX: 0,
        targetY: 0,
        currentX: 0,
        currentY: 0,
        touchStartX: 0,
        touchStartY: 0
    };

    // Foreground DOM references
    const headerEl = document.querySelector('header');
    const contentEl = document.querySelector('#content .container') || document.getElementById('content');
    const footerEl = document.querySelector('footer.footer');

    // Desktop Mouse Move
    window.addEventListener('mousemove', (e) => {
        pointer.targetX = (e.clientX / window.innerWidth) * 2 - 1;
        pointer.targetY = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });

    // Mobile Gyroscope (Device Tilt)
    let gyroActive = false;

    function handleOrientation(e) {
        if (e.gamma === null || e.beta === null) return;
        gyroActive = true;

        const clampedGamma = Math.max(-45, Math.min(45, e.gamma));
        const clampedBeta = Math.max(15, Math.min(75, e.beta));

        pointer.targetX = clampedGamma / 45;
        pointer.targetY = ((clampedBeta - 45) / 30);
    }

    if (window.DeviceOrientationEvent) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            const onFirstTouch = () => {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === 'granted') {
                            window.addEventListener('deviceorientation', handleOrientation, { passive: true });
                        }
                    })
                    .catch(() => {});
                window.removeEventListener('touchstart', onFirstTouch);
                window.removeEventListener('click', onFirstTouch);
            };
            window.addEventListener('touchstart', onFirstTouch, { passive: true });
            window.addEventListener('click', onFirstTouch, { passive: true });
        } else {
            window.addEventListener('deviceorientation', handleOrientation, { passive: true });
        }
    }

    // Mobile Touch Drag Fallback
    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            pointer.touchStartX = e.touches[0].clientX;
            pointer.touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (gyroActive || e.touches.length === 0) return;
        const dx = (e.touches[0].clientX - pointer.touchStartX) / window.innerWidth;
        const dy = (e.touches[0].clientY - pointer.touchStartY) / window.innerHeight;

        pointer.targetX = Math.max(-1, Math.min(1, pointer.targetX + dx * 1.5));
        pointer.targetY = Math.max(-1, Math.min(1, pointer.targetY - dy * 1.5));
        pointer.touchStartX = e.touches[0].clientX;
        pointer.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    // 7. Window Resizing
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        commonUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    }
    window.addEventListener('resize', onResize, { passive: true });

    // 8. Main Render & Animation Loop
    let animationFrameId;

    function animate() {
        animationFrameId = requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();
        const now = performance.now();
        commonUniforms.uTime.value = elapsedTime;

        // Smooth damping
        const lerpFactor = 0.05;
        pointer.currentX += (pointer.targetX - pointer.currentX) * lerpFactor;
        pointer.currentY += (pointer.targetY - pointer.currentY) * lerpFactor;

        // Ambient celestial drift
        const driftX = prefersReducedMotion ? 0 : Math.sin(elapsedTime * 0.18) * 0.08;
        const driftY = prefersReducedMotion ? 0 : Math.cos(elapsedTime * 0.14) * 0.05;

        const totalX = pointer.currentX + driftX;
        const totalY = pointer.currentY + driftY;

        // A) DEEPEST LAYER: Background Space Camera & Stars
        camera.position.x = -totalX * 22;
        camera.position.y = -totalY * 16;
        camera.lookAt(0, 0, -600);

        for (let i = 0; i < starLayers.length; i++) {
            const layer = starLayers[i];
            if (!prefersReducedMotion) {
                layer.obj.rotation.y += layer.rotSpeed;
                layer.obj.rotation.x = totalY * layer.parallaxCoeff;
                layer.obj.rotation.y = totalX * layer.parallaxCoeff + (elapsedTime * layer.rotSpeed);
            }
        }

        if (!prefersReducedMotion) {
            updateMeteor(now);
        }

        // B) FOREGROUND LAYER: Parallax displacement on HTML UI elements
        if (!prefersReducedMotion) {
            if (contentEl) {
                // Central referral icons move with foreground parallax
                contentEl.style.transform = `translate3d(${totalX * 14}px, ${-totalY * 10}px, 0)`;
            }
            if (headerEl) {
                headerEl.style.transform = `translate3d(${totalX * 7}px, ${-totalY * 5}px, 0)`;
            }
            if (footerEl) {
                footerEl.style.transform = `translate3d(${totalX * 4}px, ${-totalY * 3}px, 0)`;
            }
        }

        renderer.render(scene, camera);
    }

    animate();

    // Clean disposal
    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();
    });
})();
