// skybox.js - Deep blue-purple gradient skybox for the 3D scene

import * as THREE from 'three';

// Create a deep blue-purple gradient skybox
const createSkybox = (scene) => {
    // Create a large sphere for the skybox - make it much larger
    const skyGeometry = new THREE.SphereGeometry(900, 32, 32);
    
    // Invert the geometry so that faces point inward
    skyGeometry.scale(-1, 1, 1);
    
    // Create shader material for a gradient effect with more vibrant colors
    const skyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x2a0055) },   // Brighter deep purple
            middleColor: { value: new THREE.Color(0x102266) }, // Brighter deep blue
            bottomColor: { value: new THREE.Color(0x000a33) }, // Slightly lighter near-black blue
        },
        vertexShader: `
            varying vec3 vWorldPosition;
            
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 topColor;
            uniform vec3 middleColor;
            uniform vec3 bottomColor;
            
            varying vec3 vWorldPosition;
            
            void main() {
                // Normalize the position to get direction vector from center
                vec3 viewDirection = normalize(vWorldPosition);
                
                // Use y-component to determine gradient position (from -1 to 1)
                float y = viewDirection.y;
                
                vec3 color;
                
                // Smooth gradient between three colors
                if (y > 0.0) {
                    // Blend between top and middle based on height
                    float factor = y; // 0 to 1 (middle to top)
                    color = mix(middleColor, topColor, factor);
                } else {
                    // Blend between middle and bottom based on height
                    float factor = abs(y); // 0 to 1 (middle to bottom)
                    color = mix(middleColor, bottomColor, factor);
                }
                
                // Add some subtle atmospheric scattering at the horizon
                float horizonFactor = 1.0 - abs(y);
                horizonFactor = pow(horizonFactor, 8.0); // Less sharp horizon effect
                color = mix(color, vec3(0.15, 0.15, 0.4), horizonFactor * 0.4);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `,
        side: THREE.BackSide, // Render on back faces since we're inside the sphere
        depthWrite: false, // Don't write to depth buffer
        depthTest: false // Don't test depth - ensure it renders behind everything
    });
    
    // Create mesh and add to scene
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = "skybox";
    sky.renderOrder = -1000; // Ensure it renders first, behind everything else
    
    // Add directly to the scene, not to any group
    scene.add(sky);
    
    // Also set the scene's background color to match the bottom color
    // This provides a fallback if the skybox has issues
    scene.background = new THREE.Color(0x000a33);
    
    // Store reference in scene.userData
    if (!scene.userData) scene.userData = {};
    scene.userData.skybox = sky;
    
    return sky;
};

// Function to update skybox if needed in animation loop
const updateSkybox = (scene, time) => {
    if (!scene.userData || !scene.userData.skybox) return;
    
    // Ensure skybox always follows the camera
    if (scene.userData.camera) {
        scene.userData.skybox.position.copy(scene.userData.camera.position);
    }
};

export { createSkybox, updateSkybox }; 