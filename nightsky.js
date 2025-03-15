// nightsky.js - Night sky with stars and moon

import * as THREE from 'three';

// Create a starry night sky with a large yellow moon
const createNightSky = (scene) => {
    // Generate a random moon phase (0-7)
    // 0: New Moon, 1: Waxing Crescent, 2: First Quarter, 3: Waxing Gibbous
    // 4: Full Moon, 5: Waning Gibbous, 6: Last Quarter, 7: Waning Crescent
    const moonPhase = Math.floor(Math.random() * 8);
    console.log(`Moon phase: ${getMoonPhaseName(moonPhase)}`);
    
    // Create the moon based on phase
    let moon, moonGlow;
    
    if (moonPhase === 0) {
        // New moon - barely visible outline
        moon = createNewMoon();
        moonGlow = createMoonGlow(0.1); // Very subtle glow
    } else if (moonPhase === 4) {
        // Full moon
        moon = createFullMoon();
        moonGlow = createMoonGlow(0.3);
    } else {
        // Partial moon phases
        moon = createPhasedMoon(moonPhase);
        moonGlow = createMoonGlow(0.25);
    }
    
    // Position the moon in the sky (far back and to the side)
    moon.position.set(30, 25, -50);
    scene.add(moon);
    
    // Position the glow at the same position
    moonGlow.position.copy(moon.position);
    scene.add(moonGlow);
    
    // Create stars using particles
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 300;
    const starsPositions = new Float32Array(starCount * 3);
    const starsSizes = new Float32Array(starCount);
    
    // Distribute stars in the sky dome
    for (let i = 0; i < starCount; i++) {
        // Create a hemispherical distribution for stars
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI * 0.65; // Limit to upper hemisphere
        const radius = 90 + Math.random() * 10; // Distance from scene center
        
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.cos(phi) + 10; // Keep stars above horizon
        const z = radius * Math.sin(phi) * Math.sin(theta);
        
        starsPositions[i * 3] = x;
        starsPositions[i * 3 + 1] = y;
        starsPositions[i * 3 + 2] = z;
        
        // Vary star sizes slightly
        starsSizes[i] = 0.5 + Math.random() * 1.5;
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(starsSizes, 1));
    
    // Custom shader material for stars with twinkling effect
    const starsMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            pixelRatio: { value: window.devicePixelRatio }
        },
        vertexShader: `
            uniform float time;
            uniform float pixelRatio;
            attribute float size;
            varying float vAlpha;
            
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Create smoother twinkling by combining multiple sine waves
                // Each star gets a unique twinkling pattern based on its position
                float uniqueOffset = position.x * 0.017 + position.y * 0.031 + position.z * 0.013;
                float slowTwinkle = sin(time * 0.0003 + uniqueOffset * 10.0) * 0.5 + 0.5;
                float mediumTwinkle = sin(time * 0.0007 + uniqueOffset * 5.0) * 0.3 + 0.7;
                float fastTwinkle = sin(time * 0.001 + uniqueOffset * 15.0) * 0.2 + 0.8;
                
                // Combine the different frequencies for a more natural look
                float twinkleEffect = slowTwinkle * mediumTwinkle * fastTwinkle;
                
                // Apply smoother variation to alpha and size
                vAlpha = 0.7 + 0.3 * twinkleEffect;
                gl_PointSize = size * pixelRatio * (0.8 + 0.2 * twinkleEffect);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying float vAlpha;
            
            void main() {
                // Calculate distance from center for a circular point
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                
                // Create a soft circular star with feathered edges
                float alpha = vAlpha * smoothstep(0.5, 0.3, dist);
                
                // Star color - pure white with variable alpha
                gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
            }
        `,
        transparent: true,
        depthWrite: false
    });
    
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    stars.name = "stars";
    scene.add(stars);
    
    // Store references to night sky elements for animation
    scene.userData.nightSky = {
        moon: moon,
        moonGlow: moonGlow,
        stars: stars,
        moonPhase: moonPhase
    };
    
    return {
        moon,
        moonGlow,
        stars,
        moonPhase
    };
};

// Helper functions for moon phases

// Get descriptive name for moon phase
const getMoonPhaseName = (phase) => {
    const phaseNames = [
        "New Moon",
        "Waxing Crescent",
        "First Quarter", 
        "Waxing Gibbous",
        "Full Moon",
        "Waning Gibbous",
        "Last Quarter",
        "Waning Crescent"
    ];
    return phaseNames[phase];
};

// Create a new moon (nearly invisible)
const createNewMoon = () => {
    const moonGeometry = new THREE.SphereGeometry(5, 8, 8);
    const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0x222233, // Very dark blue-gray
        opacity: 0.7,
        transparent: true,
        wireframe: false
    });
    return new THREE.Mesh(moonGeometry, moonMaterial);
};

// Create a full moon
const createFullMoon = () => {
    // Group to hold the moon elements
    const moonGroup = new THREE.Group();
    
    // Base moon sphere
    const moonGeometry = new THREE.SphereGeometry(5, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFCE0, // Creamy yellow color
        wireframe: false
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moonGroup.add(moon);
    
    // Add some subtle crater circles for texture - no face
    const addCrater = (x, y, z, size, color = 0xEEEAC0, opacity = 0.7) => {
        const craterGeometry = new THREE.CircleGeometry(size, 12);
        const craterMaterial = new THREE.MeshBasicMaterial({ 
            color: color, 
            transparent: true,
            opacity: opacity
        });
        const crater = new THREE.Mesh(craterGeometry, craterMaterial);
        
        // Position the crater
        crater.position.set(x, y, z);
        
        // Rotate to face outward from center
        const normal = new THREE.Vector3(x, y, z).normalize();
        crater.lookAt(normal.multiplyScalar(10).add(crater.position));
        
        moonGroup.add(crater);
    };
    
    // Add a collection of craters across the moon's surface
    // Main large craters
    addCrater(-2.5, 2.5, 4.3, 1.2, 0xEEEAC0, 0.6);
    addCrater(3.0, 1.5, 3.8, 0.9, 0xEEEAC0, 0.7);
    addCrater(0.5, -3.0, 4.0, 1.4, 0xEEEAC0, 0.5);
    addCrater(-3.5, -1.0, 3.5, 0.8, 0xEEEAC0, 0.6);
    
    // Smaller craters
    addCrater(2.0, 3.5, 2.8, 0.5, 0xEEEAC0, 0.7);
    addCrater(-1.5, -2.5, 4.1, 0.6, 0xEEEAC0, 0.6);
    addCrater(1.8, -0.5, 4.7, 0.4, 0xEEEAC0, 0.5);
    addCrater(-3.8, 0.7, 3.2, 0.7, 0xE8E4B0, 0.6); 
    addCrater(3.5, -2.0, 3.0, 0.5, 0xE8E4B0, 0.7);
    
    // Smallest detail craters
    for (let i = 0; i < 15; i++) {
        // Create random position on sphere
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.random() * Math.PI;
        const radius = 4.9; // Just below the surface
        
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(theta);
        
        addCrater(x, y, z, 0.1 + Math.random() * 0.3, 0xEEEAC0, 0.4 + Math.random() * 0.3);
    }
    
    return moonGroup;
};

// Create a phased moon (crescent or quarter)
const createPhasedMoon = (phase) => {
    // For cartoon effect, we'll use a direct visual approach rather than shaders
    const moonGroup = new THREE.Group();
    
    // Base moon sphere - grayish for the shadowed part
    const moonShadowGeometry = new THREE.SphereGeometry(5, 16, 16);
    const moonShadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x555566, // Gray with blue tint
        wireframe: false
    });
    const moonShadow = new THREE.Mesh(moonShadowGeometry, moonShadowMaterial);
    moonGroup.add(moonShadow);
    
    // Create the illuminated part
    const illuminatedGeometry = new THREE.SphereGeometry(5.05, 16, 16, 0, Math.PI, 0, Math.PI);
    const illuminatedMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFCE0, // Creamy yellow color
        wireframe: false,
        side: THREE.FrontSide
    });
    
    const illuminatedPart = new THREE.Mesh(illuminatedGeometry, illuminatedMaterial);
    
    // Position and rotate based on phase
    // Convert phase to angle (0-7 -> 0-2π)
    const phaseAngle = (phase / 4) * Math.PI;
    illuminatedPart.rotation.y = phaseAngle;
    
    // For waxing phases (1-3), show right side
    // For waning phases (5-7), show left side
    if (phase > 4) {
        illuminatedPart.rotation.y = Math.PI - phaseAngle;
        illuminatedPart.scale.z = -1; // Flip to show other side
    }
    
    moonGroup.add(illuminatedPart);
    
    // Add cartoon eyes depending on the phase - only visible during certain phases
    if (phase !== 0) { // Not new moon
        // Eyes - smaller and simpler for partial phases
        const eyeSize = (phase === 4) ? 0.4 : 0.3; // Bigger for full moon
        const eyeColor = (phase === 4) ? 0x333333 : 0x444444; // Darker for full moon
        
        const eyeGeometry = new THREE.CircleGeometry(eyeSize, 8);
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: eyeColor });
        
        // Position eyes based on phase
        let eyeXOffset = 1.5;
        if (phase > 4) eyeXOffset *= -1; // Flip for waning
        
        // Only show eyes that would be in the illuminated part
        if ((phase < 4 && phase > 1) || phase === 4) {
            const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            rightEye.position.set(eyeXOffset, 1, 4.8);
            rightEye.rotation.set(-0.2, 0, 0);
            moonGroup.add(rightEye);
        }
        
        if ((phase > 4 && phase < 7) || phase === 4) {
            const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
            leftEye.position.set(-eyeXOffset, 1, 4.8);
            leftEye.rotation.set(-0.2, 0, 0);
            moonGroup.add(leftEye);
        }
    }
    
    return moonGroup;
};

// Create the moon glow - dreamy effect
const createMoonGlow = (opacity = 0.3) => {
    // Create multiple layers of glow with different sizes and opacities
    const glowGroup = new THREE.Group();
    
    // Inner glow
    const innerGlowGeometry = new THREE.SphereGeometry(5.5, 16, 16);
    const innerGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFFC0, // Yellow-white
        transparent: true,
        opacity: opacity * 1.3,
        wireframe: false
    });
    const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
    glowGroup.add(innerGlow);
    
    // Middle glow layer
    const middleGlowGeometry = new THREE.SphereGeometry(6.0, 12, 12);
    const middleGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xE6FFFF, // Slight blue tint
        transparent: true,
        opacity: opacity * 0.7,
        wireframe: false
    });
    const middleGlow = new THREE.Mesh(middleGlowGeometry, middleGlowMaterial);
    glowGroup.add(middleGlow);
    
    // Outer dreamy glow
    const outerGlowGeometry = new THREE.SphereGeometry(7.0, 8, 8);
    const outerGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xDDEEFF, // Blue-white
        transparent: true,
        opacity: opacity * 0.4,
        wireframe: false
    });
    const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial);
    glowGroup.add(outerGlow);
    
    return glowGroup;
};

// Update night sky animation
const updateNightSky = (scene, time) => {
    if (!scene.userData.nightSky) return;
    
    // Update star twinkling with a slower, smoother time increment
    if (scene.userData.nightSky.stars && 
        scene.userData.nightSky.stars.material.uniforms) {
        scene.userData.nightSky.stars.material.uniforms.time.value = time * 500;  // slower time progression
    }
    
    // Slight rotation of moon
    if (scene.userData.nightSky.moon) {
        scene.userData.nightSky.moon.rotation.y += 0.001;
        scene.userData.nightSky.moonGlow.rotation.y += 0.001;
    }
};

export { createNightSky, updateNightSky }; 