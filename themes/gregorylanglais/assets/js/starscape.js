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

    const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 1, 18000);
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
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
        attribute float aShimmer;
        attribute float aFootprint;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;
        varying float vHalo;
        varying float vShimmer;
        varying float vGlint;

        // Smooth random intervals avoid the recognizable rhythm of a sine pulse.
        float temporalNoise(float t) {
            float cell = floor(t);
            float blend = fract(t);
            blend = blend * blend * (3.0 - 2.0 * blend);
            float a = fract(sin(cell * 127.1 + 311.7) * 43758.5453);
            float b = fract(sin((cell + 1.0) * 127.1 + 311.7) * 43758.5453);
            return mix(a, b, blend);
        }

        void main() {
            vColor = aColor;
            vFlare = aFlare;
            vHalo = smoothstep(2.0, 8.0, aSize);

            float t = uTime * aTwinkleSpeed + aTwinklePhase;
            float slow = temporalNoise(t * 0.7);
            float fine = temporalNoise(t * 1.93 + aTwinklePhase * 7.0);
            float fluctuation = (slow * 0.75 + fine * 0.25) * 2.0 - 1.0;
            vShimmer = 1.0 + aShimmer * fluctuation;
            float glint = smoothstep(0.88, 1.0, temporalNoise(t * 0.23 + aTwinklePhase * 11.0));
            vGlint = aSize >= 7.0 ? aShimmer * 0.5 * glint : 0.0;
            vAlpha = aBrightness;

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            // Individual optical footprints retain a continuous size hierarchy.
            // Keep at least two device pixels for sampling, not one shared CSS size.
            float physicalSize = aSize * 1.8 * (450.0 / -mvPosition.z);
            float opticalSize = aFootprint * pow(1200.0 / -mvPosition.z, 0.12);
            gl_PointSize = max(2.0, max(physicalSize, opticalSize) * uPixelRatio);
        }
    `;

    const starFragmentShader = `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vFlare;
        varying float vHalo;
        varying float vShimmer;
        varying float vGlint;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            // Gaussian optical footprint: a resolved white core, with colored
            // wings only on larger stars. Tiny stars retain enough pixel coverage
            // at DPR 1 instead of disappearing between samples.
            float core = exp(-dist * dist * 28.0);
            float glow = exp(-dist * dist * 7.0) * 0.16 * vHalo;
            // The concentrated core stays steady. Only its outer light shifts;
            // the footprint, halo radius, and spike lengths never breathe.
            float steadyCore = smoothstep(0.2, 0.85, core);
            float outerLight = vShimmer + vGlint;
            float alpha = core * mix(outerLight, 1.0, steadyCore) + glow * outerLight;

            // Telescope 4-point optical diffraction spikes on glistening stars
            if (vFlare > 0.5) {
                float spikeX = max(0.0, 1.0 - abs(coord.y) * 16.0) * exp(-abs(coord.x) * 4.0);
                float spikeY = max(0.0, 1.0 - abs(coord.x) * 16.0) * exp(-abs(coord.y) * 4.0);
                alpha += (spikeX + spikeY) * 0.3 * mix(outerLight, 1.0, steadyCore);
            }

            // Fade to zero before the sprite boundary to avoid cut-off halos.
            alpha *= vAlpha * (1.0 - smoothstep(0.32, 0.5, dist));

            // Blend spectral hue with pure white stellar core
            vec3 finalColor = mix(vColor, vec3(1.0, 1.0, 1.0), smoothstep(0.05, 0.8, core) * 0.95);

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

    // 3. Continuous stellar depth, from nearby anchors to a faint far field.

    // Shared soft concentrations align across depths without becoming flat sheets.
    const starKnots = Array.from({ length: 28 }, (_, i) => {
        const x = -2.2 + (i + Math.random()) / 28 * 4.4;
        return {
            x,
            y: x * 0.38 + (Math.random() - 0.5) * 0.38,
            width: 0.035 + Math.random() * 0.11,
            height: 0.02 + Math.random() * 0.07
        };
    });
    function densityNoise(x, y) {
        const hash = (a, b) => {
            const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return n - Math.floor(n);
        };
        const ix = Math.floor(x), iy = Math.floor(y);
        let fx = x - ix, fy = y - iy;
        fx *= fx * (3 - 2 * fx);
        fy *= fy * (3 - 2 * fy);
        return THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), fx),
            THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
    }

    function buildStarField(count, zMin, zMax, sizeMin, sizeMax, flareRatio, luminosity = 1, footprint = 2.8) {
        const geom = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const speeds = new Float32Array(count);
        const phases = new Float32Array(count);
        const brightness = new Float32Array(count);
        const flares = new Float32Array(count);
        const shimmer = new Float32Array(count);
        const footprints = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const depth = zMin + Math.random() * (zMax - zMin);
            // Angular coordinates keep the dust band aligned across all depths.
            // Overscan leaves room for landscape viewports and camera translation.
            let x, y, inKnot;
            // Rejection sampling adds irregular sparse patches between knots.
            do {
                inKnot = false;
                const population = Math.random();
                if (count >= 5000 && population < 0.18) {
                    inKnot = true;
                    const knot = starKnots[Math.floor(Math.random() * starKnots.length)];
                    const radius = Math.sqrt(-2 * Math.log(Math.max(1e-6, Math.random())));
                    const angle = Math.random() * Math.PI * 2;
                    x = knot.x + Math.cos(angle) * radius * knot.width;
                    y = knot.y + Math.sin(angle) * radius * knot.height;
                } else {
                    x = (Math.random() - 0.5) * 4.8;
                    y = (Math.random() - 0.5) * 1.5;
                    if (population < 0.57) {
                        const warp = (densityNoise(x * 5, 9) - 0.5) * 0.14;
                        y = x * 0.38 + warp + (Math.random() + Math.random() - 1) * 0.26;
                    }
                }
            } while (Math.random() > 0.3 + densityNoise(x * 12, y * 15) * 0.7);
            positions[i * 3] = x * -depth;
            positions[i * 3 + 1] = y * -depth;
            positions[i * 3 + 2] = depth;

            const col = getRandomColor();
            colors[i * 3]     = col.r;
            colors[i * 3 + 1] = col.g;
            colors[i * 3 + 2] = col.b;

            const isFlare = Math.random() < flareRatio;
            flares[i] = isFlare ? 1.0 : 0.0;
            sizes[i] = isFlare ? (sizeMax * 1.4) : (sizeMin + Math.random() * (sizeMax - sizeMin));

            speeds[i] = 0.35 + Math.random() * 0.8;
            const shimmers = Math.random() < (sizes[i] > 3.0 ? 0.65 : 0.04);
            shimmer[i] = !prefersReducedMotion && shimmers ? 0.02 + Math.random() * 0.04 : 0;
            phases[i] = Math.random() * Math.PI * 2;
            const lane = y - x * 0.38 + Math.sin(x * 9) * 0.025;
            const extinction = 1 - 0.65 * Math.exp(-lane * lane / 0.0015);
            const rank = Math.random();
            // Mostly faint points, a readable middle range, and rare bright cores.
            const light = rank < 0.65
                ? 0.07 + Math.pow(rank / 0.65, 1.4) * 0.28
                : rank < 0.97 ? 0.4 + (rank - 0.65) / 0.32 * 0.65
                : 1.05 + (rank - 0.97) / 0.03 * 0.2;
            footprints[i] = footprint * (0.7 + 0.7 * Math.sqrt(rank))
                * (0.9 + Math.random() * 0.2) * (inKnot ? 0.8 : 1);
            brightness[i] = luminosity * (isFlare ? 0.9 : light) * extinction * (inKnot ? 0.85 : 1);
        }

        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geom.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(speeds, 1));
        geom.setAttribute('aTwinklePhase', new THREE.BufferAttribute(phases, 1));
        geom.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));
        geom.setAttribute('aFlare', new THREE.BufferAttribute(flares, 1));
        geom.setAttribute('aShimmer', new THREE.BufferAttribute(shimmer, 1));
        geom.setAttribute('aFootprint', new THREE.BufferAttribute(footprints, 1));

        const points = new THREE.Points(geom, starMaterial);
        scene.add(points);
    }

    // Abundant fine light, a middle field, and a few brilliant anchors. Keep
    // prominent stars sparse so their halos do not wash out the smaller points.
    buildStarField(15000, -6000, -2800, 1.0, 1.6, 0.0, 0.48, 1.8);
    buildStarField(27000, -1800, -900, 1.2, 2.0, 0.0);
    buildStarField(5000, -900, -500, 2.0, 3.2, 0.003);
    buildStarField(130, -550, -350, 3.0, 5.5, 0.08);
    buildStarField(24, -550, -350, 7.0, 10.0, 0.15);

    // 4. Bake cloud detail once, then sample it at three different distances.
    // This adds depth without evaluating procedural noise per pixel every frame.
    const dustMaterial = new THREE.ShaderMaterial({
        depthWrite: false,
        vertexShader: `
            varying vec2 vSky;
            void main() {
                vSky = position.xy / 2100.0;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vSky;
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                           mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
            }
            float fbm(vec2 p) {
                float value = 0.0, amplitude = 0.5;
                for (int i = 0; i < 4; i++) {
                    value += amplitude * noise(p);
                    p = mat2(1.6, -1.2, 1.2, 1.6) * p + 7.3;
                    amplitude *= 0.5;
                }
                return value;
            }
            void main() {
                vec2 p = vSky;
                float structure = fbm(p * 8.0);
                float broadStructure = fbm(p * 3.0 + 17.0);
                float band = p.y - p.x * 0.38;
                float haze = exp(-pow((band + (structure - 0.5) * 0.18) / 0.17, 2.0));
                float lane = band + sin(p.x * 9.0) * 0.025 + (structure - 0.5) * 0.045;
                float dust = exp(-lane * lane / 0.0015);
                float wisps = fbm(p * 28.0 + 31.0);
                vec3 tint = mix(vec3(0.018, 0.028, 0.043), vec3(0.055, 0.035, 0.021), structure);
                // Broad, low-contrast veils connect fine wisps, while the
                // absorbing lane and irregular gaps preserve genuinely dark sky.
                float veil = exp(-pow((band + (broadStructure - 0.5) * 0.4) / 0.32, 2.0));
                float gaps = smoothstep(0.18, 0.65, broadStructure);
                vec3 color = tint * (haze * (0.35 + wisps) * 3.8 + veil * gaps * 0.8)
                           * (1.0 - dust * 0.93);
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });
    const cloudTextureWidth = Math.min(2048, Math.max(1024,
        Math.ceil(canvas.clientWidth * Math.min(window.devicePixelRatio, 2))));
    const cloudTarget = new THREE.WebGLRenderTarget(cloudTextureWidth, cloudTextureWidth / 2, {
        depthBuffer: false,
        stencilBuffer: false
    });
    const cloudBakeScene = new THREE.Scene();
    const cloudBakeGeometry = new THREE.PlaneGeometry(13000, 6500);
    cloudBakeScene.add(new THREE.Mesh(cloudBakeGeometry, dustMaterial));
    const cloudBakeCamera = new THREE.OrthographicCamera(-6500, 6500, 3250, -3250, 0.1, 10);
    cloudBakeCamera.position.z = 1;
    renderer.setRenderTarget(cloudTarget);
    renderer.render(cloudBakeScene, cloudBakeCamera);
    renderer.setRenderTarget(null);
    cloudBakeGeometry.dispose();
    dustMaterial.dispose();

    const cloudGeometry = new THREE.PlaneGeometry(1, 1);
    function addCloudLayer(depth, strength, offset, tint) {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uCloud: { value: cloudTarget.texture },
                uStrength: { value: strength },
                uOffset: { value: new THREE.Vector2(...offset) },
                uTint: { value: new THREE.Vector3(...tint) }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uCloud;
                uniform float uStrength;
                uniform vec2 uOffset;
                uniform vec3 uTint;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv + uOffset;
                    float edge = smoothstep(0.0, 0.06, uv.x) * (1.0 - smoothstep(0.94, 1.0, uv.x))
                               * smoothstep(0.0, 0.06, uv.y) * (1.0 - smoothstep(0.94, 1.0, uv.y));
                    gl_FragColor = vec4(texture2D(uCloud, uv).rgb * uTint, uStrength * edge);
                }
            `
        });
        const cloud = new THREE.Mesh(cloudGeometry, material);
        cloud.position.z = -depth;
        // Preserve angular coverage; only the perspective displacement changes.
        cloud.scale.set(depth * 13000 / 2100, depth * 6500 / 2100, 1);
        scene.add(cloud);
    }
    addCloudLayer(1200, 0.18, [-0.035, 0.045], [0.8, 0.9, 1.15]);
    addCloudLayer(2100, 0.78, [0, 0], [1, 1, 1]);
    addCloudLayer(4400, 0.22, [0.045, -0.035], [1.08, 0.9, 0.8]);

    // Sparse deep-field galaxies: one instanced draw, with steady light and
    // fixed orientations. Their greater distance gives them the least parallax.
    const galaxyCount = 90;
    const galaxyGeometry = new THREE.PlaneGeometry(1, 1);
    const kinds = new Float32Array(galaxyCount);
    const tones = new Float32Array(galaxyCount * 3);
    const intensities = new Float32Array(galaxyCount);
    const galaxyPalette = [
        new THREE.Color('#e6b88c'), new THREE.Color('#c58e74'),
        new THREE.Color('#adc3db'), new THREE.Color('#d6c7b0')
    ];
    const galaxyMaterial = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        vertexShader: `
            attribute float aKind;
            attribute vec3 aTone;
            attribute float aIntensity;
            varying vec2 vUv;
            varying float vKind;
            varying vec3 vTone;
            varying float vIntensity;
            void main() {
                vUv = uv;
                vKind = aKind;
                vTone = aTone;
                vIntensity = aIntensity;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            varying vec2 vUv;
            varying float vKind;
            varying vec3 vTone;
            varying float vIntensity;
            void main() {
                vec2 p = (vUv - 0.5) * 2.0;
                float core = exp(-dot(p, p) * 110.0);
                float light;
                if (vKind < 0.5) {
                    // Elliptical: smooth warm halo and concentrated nucleus.
                    float r = length(p * vec2(1.0, 1.65));
                    light = exp(-r * 6.0) * 0.55 + core * 0.45;
                } else if (vKind < 1.5) {
                    // Edge-on disk, with a narrow absorbing seam.
                    float r = length(p * vec2(1.0, 5.0));
                    float seam = 1.0 - 0.65 * exp(-pow((p.y - 0.015) * 65.0, 2.0));
                    light = (exp(-r * 5.0) * 0.7 + core * 0.3) * seam;
                } else if (vKind < 2.5) {
                    // A quiet two-armed spiral; only the larger disks resolve it.
                    vec2 q = p * vec2(1.0, 1.35);
                    float r = length(q);
                    float arms = pow(0.5 + 0.5 * cos(atan(q.y, q.x) * 2.0 - log(r + 0.03) * 5.0), 4.0);
                    light = exp(-r * 5.0) * (0.14 + arms * 0.5) + core * 0.65;
                } else {
                    // Small, asymmetric patches of unresolved distant light.
                    vec2 a = p - vec2(0.09, 0.025);
                    vec2 b = p + vec2(0.14, 0.06);
                    light = exp(-dot(a, a) * 65.0) * 0.45
                          + exp(-dot(b, b) * 90.0) * 0.25
                          + exp(-dot(p, p) * 14.0) * 0.1;
                }
                float edge = 1.0 - smoothstep(0.65, 1.0, length(p));
                vec3 color = mix(vTone, vec3(1.0, 0.95, 0.88), core * 0.35);
                gl_FragColor = vec4(color, light * edge * vIntensity);
            }
        `
    });
    const galaxies = new THREE.InstancedMesh(galaxyGeometry, galaxyMaterial, galaxyCount);
    const galaxyTransform = new THREE.Object3D();
    for (let i = 0; i < galaxyCount; i++) {
        // Separate near, middle, and remote galaxies across a much deeper volume.
        const depth = [6000, 9000, 12500][i % 3] + Math.random() * 1800;
        // Stratified placement avoids accidentally crowding one part of the sky.
        const x = ((i % 15 + 0.2 + Math.random() * 0.6) / 15 - 0.5) * 4.8;
        const y = ((Math.floor(i / 15) + 0.2 + Math.random() * 0.6) / 6 - 0.5) * 1.3;
        const prominent = i % 19 === 0;
        // Keep near galaxies recognizable; remote ones resolve as smaller smudges.
        const apparentSize = (prominent ? 95 : 22 + Math.random() * 40)
            * (i % 3 === 2 ? 0.65 : 1);
        const size = apparentSize * depth / 2600;
        galaxyTransform.position.set(x * depth, y * depth, -depth);
        galaxyTransform.rotation.z = Math.random() * Math.PI * 2;
        galaxyTransform.scale.setScalar(size);
        galaxyTransform.updateMatrix();
        galaxies.setMatrixAt(i, galaxyTransform.matrix);
        const kind = Math.random();
        kinds[i] = kind < 0.4 ? 0 : kind < 0.7 ? 1 : kind < 0.85 ? 2 : 3;
        // Give the few larger objects enough structure to recognize their shapes.
        if (prominent) kinds[i] = i % 2 === 0 ? 2 : 1;
        const tone = galaxyPalette[Math.floor(Math.random() * galaxyPalette.length)];
        tone.toArray(tones, i * 3);
        intensities[i] = prominent ? 0.85 : 0.25 + Math.random() * 0.4;
    }
    galaxyGeometry.setAttribute('aKind', new THREE.InstancedBufferAttribute(kinds, 1));
    galaxyGeometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 3));
    galaxyGeometry.setAttribute('aIntensity', new THREE.InstancedBufferAttribute(intensities, 1));
    scene.add(galaxies);

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

    // Mouse input describes a viewpoint shift; device sensors describe rotation.
    // Keep these separate instead of interpreting both as camera translation.
    const rig = { mode: 'mouse', yaw: 0, pitch: 0, roll: 0 };
    const viewportFrame = document.querySelector('.viewport-frame');
    const framePose = { x: 0, y: 0 };
    const targetRotation = new THREE.Quaternion();
    const rigEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const deviceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const deviceRotation = new THREE.Quaternion();
    const relativeRotation = new THREE.Quaternion();
    const deviceToCamera = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const screenRotation = new THREE.Quaternion();
    const screenAxis = new THREE.Vector3(0, 0, 1);
    const radians = THREE.MathUtils.degToRad;
    const clamp = THREE.MathUtils.clamp;
    let orientationOrigin = null;
    let touchActive = false;
    let lastTouchTime = -Infinity;

    window.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || performance.now() - lastTouchTime < 1000) return;
        rig.mode = 'mouse';
        pointer.targetX = clamp((e.clientX / canvas.clientWidth) * 2 - 1, -1, 1);
        pointer.targetY = clamp(1 - (e.clientY / canvas.clientHeight) * 2, -1, 1);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'mouse' || rig.mode !== 'mouse') return;
        pointer.targetX = 0;
        pointer.targetY = 0;
    }, { passive: true });

    function handleOrientation(e) {
        if (!Number.isFinite(e.gamma) || !Number.isFinite(e.beta) || prefersReducedMotion || touchActive) return;
        const angle = window.screen.orientation?.angle ?? window.orientation ?? 0;
        // Compose rotations before taking a relative pose. This handles heading
        // wraparound and couples tilt axes correctly in portrait and landscape.
        deviceEuler.set(radians(e.beta), radians(Number.isFinite(e.alpha) ? e.alpha : 0), -radians(e.gamma), 'YXZ');
        deviceRotation.setFromEuler(deviceEuler);
        deviceRotation.multiply(deviceToCamera);
        screenRotation.setFromAxisAngle(screenAxis, -radians(angle));
        deviceRotation.multiply(screenRotation);
        if (!orientationOrigin) orientationOrigin = deviceRotation.clone().invert();
        relativeRotation.copy(orientationOrigin).multiply(deviceRotation);
        rigEuler.setFromQuaternion(relativeRotation, 'YXZ');
        rig.mode = 'tilt';
        // A restrained window into the sky, with a small roll component. Bound
        // horizontal travel on narrow screens so it never sweeps a whole screen.
        rig.yaw = clamp(rigEuler.y * 0.45, -0.12, 0.12) * Math.min(1, camera.aspect);
        rig.pitch = clamp(rigEuler.x * 0.45, -0.10, 0.10);
        rig.roll = clamp(rigEuler.z * 0.08, -0.025, 0.025);
    }

    function resetOrientation() {
        orientationOrigin = null;
        rig.yaw = rig.pitch = rig.roll = 0;
        pointer.targetX = 0;
        pointer.targetY = 0;
    }
    window.addEventListener('orientationchange', resetOrientation, { passive: true });
    window.screen.orientation?.addEventListener('change', resetOrientation);

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
            touchActive = true;
            lastTouchTime = performance.now();
            rig.mode = 'touch';
            pointer.touchStartX = e.touches[0].clientX;
            pointer.touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (prefersReducedMotion || e.touches.length === 0) return;
        rig.mode = 'touch';
        const dx = (e.touches[0].clientX - pointer.touchStartX) / window.innerWidth;
        const dy = (e.touches[0].clientY - pointer.touchStartY) / window.innerHeight;

        pointer.targetX = Math.max(-1, Math.min(1, pointer.targetX + dx * 1.5));
        pointer.targetY = Math.max(-1, Math.min(1, pointer.targetY - dy * 1.5));
        pointer.touchStartX = e.touches[0].clientX;
        pointer.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    function endTouch() {
        touchActive = false;
        lastTouchTime = performance.now();
        resetOrientation();
    }
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });

    // 7. Window Resizing
    function onResize() {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        commonUniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2);
    }
    window.addEventListener('resize', onResize, { passive: true });
    const viewportObserver = new ResizeObserver(onResize);
    viewportObserver.observe(canvas);

    // 8. Main Render & Animation Loop
    let animationFrameId;

    function animate() {
        animationFrameId = requestAnimationFrame(animate);

        const delta = Math.min(clock.getDelta(), 0.1);
        const elapsedTime = clock.elapsedTime;
        const now = performance.now();
        commonUniforms.uTime.value = prefersReducedMotion ? 0 : elapsedTime;

        // Smooth damping
        const lerpFactor = 1 - Math.exp(-delta * 16);
        pointer.currentX += (pointer.targetX - pointer.currentX) * lerpFactor;
        pointer.currentY += (pointer.targetY - pointer.currentY) * lerpFactor;

        // Life belongs to the sky, not the controls. Ambient motion is a very
        // slow angular drift shared by the entire scene, not independent layers.
        const driftYaw = Math.sin(elapsedTime * 0.07) * 0.0007;
        const driftPitch = Math.sin(elapsedTime * 0.05) * 0.0004;
        let yaw, pitch, roll = 0;
        let shiftX = 0, shiftY = 0;
        if (rig.mode === 'tilt') {
            yaw = rig.yaw;
            pitch = rig.pitch;
        } else {
            // Desktop: a small lean plus translation gives nearer stars extra
            // displacement. Touch drag is a rotation-led fallback for no sensor.
            const dragging = rig.mode === 'touch';
            yaw = -pointer.currentX * (dragging ? 0.06 * Math.min(1, camera.aspect) : 0.008);
            pitch = pointer.currentY * (dragging ? 0.05 : 0.006);
            if (!dragging) {
                shiftX = pointer.currentX * 10 * Math.min(camera.aspect, 2);
                shiftY = pointer.currentY * 7;
            }
        }
        if (rig.mode === 'tilt') roll = rig.roll;
        rigEuler.set(pitch + driftPitch, yaw + driftYaw, roll, 'YXZ');
        targetRotation.setFromEuler(rigEuler);
        if (prefersReducedMotion) {
            camera.position.set(0, 0, 0);
            camera.quaternion.identity();
        } else {
            camera.quaternion.slerp(targetRotation, 1 - Math.exp(-delta * 18));
            camera.position.x += (shiftX - camera.position.x) * (1 - Math.exp(-delta * 16));
            camera.position.y += (shiftY - camera.position.y) * (1 - Math.exp(-delta * 16));
            updateMeteor(now);
        }

        if (viewportFrame) {
            // A near-field window moves very little; the sky supplies the depth.
            // Both bulkheads move together, while text stays readable and fixed.
            const tilt = rig.mode === 'tilt';
            const targetX = prefersReducedMotion ? 0 : tilt ? -rig.yaw / 0.12 : pointer.currentX;
            const targetY = prefersReducedMotion ? 0 : tilt ? rig.pitch / 0.1 : pointer.currentY;
            const damping = 1 - Math.exp(-delta * 16);
            framePose.x += (targetX - framePose.x) * damping;
            framePose.y += (targetY - framePose.y) * damping;
            const strength = rig.mode === 'mouse' ? 1 : 0.55;
            viewportFrame.style.setProperty('--frame-x', `${framePose.x * 2 * strength}px`);
            viewportFrame.style.setProperty('--frame-y', `${-framePose.y * 1.5 * strength}px`);
        }

        renderer.render(scene, camera);
    }

    animate();

    // Clean disposal
    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(animationFrameId);
        viewportObserver.disconnect();
        cloudTarget.dispose();
        scene.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) object.material.dispose();
        });
        renderer.dispose();
    });
})();
