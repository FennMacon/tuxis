import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupAudio, createAudioReactiveElements, updateAudioReactiveElements, audioAnalyser, audioData, isAudioPlaying, audioStartTime } from './audio.js';
import { createNightSky, updateNightSky } from './nightsky.js';
import { createSkybox, updateSkybox } from './skybox.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000011);

// Track the orbiting center point for fairies
let fairyOrbitCenter = new THREE.Vector3(0, 6, -10); // Default position
let fairyOrbitTime = 0;

// Share scene reference with audio.js for test buttons
if (typeof setSceneReference === 'function') {
    setSceneReference(scene);
}

// Camera setup
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 25); // Starting even further back for a better street view

// Renderer setup
const renderer = new THREE.WebGLRenderer({
    antialias: false, // Disable antialiasing for pixelated effect
    alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1); // Force pixel ratio to 1 for more pixelated look
document.body.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 2, 0); // Looking at the building from across the street

// Add WASD keyboard controls for camera movement
const keyboard = { w: false, a: false, s: false, d: false, shift: false };
const moveSpeed = 0.2; // Speed of movement
const sprintMultiplier = 2.0; // Speed multiplier when shift is pressed

document.addEventListener('keydown', (event) => {
    switch(event.code) {
        case 'KeyW': keyboard.w = true; break;
        case 'KeyA': keyboard.a = true; break;
        case 'KeyS': keyboard.s = true; break;
        case 'KeyD': keyboard.d = true; break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keyboard.shift = true; break;
    }
});

document.addEventListener('keyup', (event) => {
    switch(event.code) {
        case 'KeyW': keyboard.w = false; break;
        case 'KeyA': keyboard.a = false; break;
        case 'KeyS': keyboard.s = false; break;
        case 'KeyD': keyboard.d = false; break;
        case 'ShiftLeft':
        case 'ShiftRight':
            keyboard.shift = false; break;
    }
});

// Function to update camera position based on WASD input
const updateCameraPosition = () => {
    // Skip movement during transitions
    if (isTransitioning) return;
    
    // Calculate actual speed (with sprint if shift is pressed)
    const actualSpeed = keyboard.shift ? moveSpeed * sprintMultiplier : moveSpeed;
    
    // Get the camera's forward and right directions
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    
    // Remove vertical component for level movement
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();
    
    // Apply movement based on keys pressed
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    if (keyboard.w) moveDirection.add(forward);
    if (keyboard.s) moveDirection.sub(forward);
    if (keyboard.a) moveDirection.sub(right);
    if (keyboard.d) moveDirection.add(right);
    
    // Normalize and scale by speed
    if (moveDirection.length() > 0) {
        moveDirection.normalize().multiplyScalar(actualSpeed);
        camera.position.add(moveDirection);
        controls.target.add(moveDirection);
    }
};

// Low resolution effect
const pixelRatio = 0.5; // Lower number = more pixelated

// Create pixelated render target
const renderTargetWidth = Math.floor(window.innerWidth * pixelRatio);
const renderTargetHeight = Math.floor(window.innerHeight * pixelRatio);
const renderTarget = new THREE.WebGLRenderTarget(renderTargetWidth, renderTargetHeight);

// Add a solid black plane below the road to block stars from showing through
const createGroundPlane = () => {
    // Create a large black plane to prevent stars from being visible through the road
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        side: THREE.DoubleSide,
    });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = Math.PI / 2; // Flat horizontal plane
    groundPlane.position.y = -1; // Positioned below the road
    scene.add(groundPlane);
};

// Create post-processing scene
const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution; // Resolution of the screen
        uniform float scanlineIntensity;
        uniform float scanlineFrequency;
        uniform float barrelDistortion; // For screen curvature

        varying vec2 vUv;
        
        // Barrel distortion function
        vec2 distort(vec2 uv, float strength) {
            vec2 cc = uv - 0.5; // Center coordinates
            float dist = dot(cc, cc) * strength;
            return (uv + cc * dist);
        }

        void main() {
            // Apply barrel distortion for screen curvature
            vec2 distortedUv = distort(vUv, barrelDistortion);

            vec4 texel = vec4(0.0);

            // Only sample if UVs are within [0,1] range after distortion
            if (distortedUv.x >= 0.0 && distortedUv.x <= 1.0 && distortedUv.y >= 0.0 && distortedUv.y <= 1.0) {
                texel = texture2D(tDiffuse, distortedUv);
            }

            // Scanlines
            float scanline = sin(distortedUv.y * scanlineFrequency) * scanlineIntensity;
            vec3 scanlinedColor = texel.rgb - scanline;
            
            gl_FragColor = vec4(scanlinedColor, texel.a);
        }
    `,
    uniforms: {
        tDiffuse: { value: renderTarget.texture },
        resolution: { value: new THREE.Vector2(renderTargetWidth, renderTargetHeight) },
        scanlineIntensity: { value: 0.05 }, // Adjust for more/less visible scanlines
        scanlineFrequency: { value: renderTargetHeight * 1.5 }, // Adjust for scanline density
        barrelDistortion: { value: 0.35 } // Adjust for more/less screen curvature
    }
});
const postPlane = new THREE.PlaneGeometry(2, 2);
const postQuad = new THREE.Mesh(postPlane, postMaterial);
const postScene = new THREE.Scene();
postScene.add(postQuad);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(1, 1, 1);
scene.add(directionalLight);

// Create a glowing wireframe material
const createGlowingWireframeMaterial = (color, opacity = 1.0, glowIntensity = 0.5) => {
    // Create a custom shader material that adds a glow effect
    return new THREE.ShaderMaterial({
        uniforms: {
            baseColor: { value: new THREE.Color(color) },
            opacity: { value: opacity },
            glowIntensity: { value: glowIntensity }
        },
        vertexShader: `
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vPosition = position;
                vNormal = normal;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 baseColor;
            uniform float opacity;
            uniform float glowIntensity;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                // Calculate wireframe effect
                float thickness = 0.05;
                vec3 fdx = vec3(dFdx(vPosition.x), dFdx(vPosition.y), dFdx(vPosition.z));
                vec3 fdy = vec3(dFdy(vPosition.x), dFdy(vPosition.y), dFdy(vPosition.z));
                vec3 normal = normalize(cross(fdx, fdy));
                
                // Calculate edge factor for wireframe effect
                float edgeFactor = abs(dot(normal, normalize(vNormal)));
                edgeFactor = step(1.0 - thickness, edgeFactor);
                
                // Apply color with glow
                vec3 finalColor = baseColor * (1.0 + glowIntensity);
                gl_FragColor = vec4(finalColor, opacity * (1.0 - edgeFactor));
            }
        `,
        wireframe: true,
        transparent: true,
        side: THREE.DoubleSide
    });
};

// Materials
const createWireframeMaterial = (color, opacity = 1.0) => {
    return new THREE.MeshBasicMaterial({
        wireframe: true,
        color: color,
        transparent: opacity < 1.0,
        opacity: opacity
    });
};

// Helper function to create thick wireframes for objects
const addThickWireframe = (mesh, color, thickness = 2) => {
    // Create edges geometry from the original geometry
    const edgesGeometry = new THREE.EdgesGeometry(mesh.geometry);
    
    // Create a line material with the given color and thickness
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: color,
        linewidth: thickness // Note: linewidth has limited browser support
    });
    
    // Create line segments for the edges
    const wireframe = new THREE.LineSegments(edgesGeometry, lineMaterial);
    
    // Add the wireframe directly to the mesh so it moves with it
    mesh.add(wireframe);
    
    return wireframe;
};

// Scene management
const sceneGroups = {
    exterior: new THREE.Group(),
    interior: new THREE.Group()
};

// Add scene groups to main scene
Object.values(sceneGroups).forEach(group => {
    scene.add(group);
});

// Create the ground plane to block stars from being visible through the road
createGroundPlane();

// Scene state management
let currentScene = 'exterior';
let nextScene = null;
let transitionProgress = 0;
const TRANSITION_DURATION = 5.0; // seconds (increased for more gradual transition)
let isTransitioning = false;
let doorOpening = false;
let doorOpeningProgress = 0;

// Camera positions for each scene
const cameraPositions = {
    exterior: { position: new THREE.Vector3(0, 2, 25), target: new THREE.Vector3(0, 2, 0) },
    interior: { position: new THREE.Vector3(0, 2, -3), target: new THREE.Vector3(0, 2, -7) }
};

// Door animation
const doorAnimationDuration = 2.0; // seconds
let doorRotation = {
    start: 0,  // Door starts closed (0 degrees)
    end: -Math.PI / 2  // Door swings 90 degrees outward (negative is toward camera)
};

// Function to start scene transition
const transitionToScene = (sceneName) => {
    if (sceneName === currentScene || isTransitioning) return;
    
    console.log(`Starting transition to ${sceneName}`);
    nextScene = sceneName;
    transitionProgress = 0;
    isTransitioning = true;
    doorOpening = true;
    doorOpeningProgress = 0;
};

// Expose transitionToScene function to the audio system
scene.userData.transitionToScene = transitionToScene;

// Function to update scene transition
const updateSceneTransition = (deltaTime) => {
    if (!isTransitioning) return;
    
    // Door animation first
    if (doorOpening) {
        doorOpeningProgress += deltaTime / doorAnimationDuration;
        
        if (doorOpeningProgress >= 1.0) {
            doorOpeningProgress = 1.0;
            doorOpening = false;
            console.log("Door fully opened");
        }
        
        // Animate door rotation around its left edge
        if (streetElements.door) {
            const doorRotationValue = THREE.MathUtils.lerp(
                doorRotation.start, 
                doorRotation.end, 
                THREE.MathUtils.smoothstep(doorOpeningProgress, 0, 1)
            );
            streetElements.door.rotation.y = doorRotationValue;
        } else {
            console.warn("Door element not found");
        }
        
        // Start camera transition after door is partially open
        if (doorOpeningProgress > 0.5) {
            transitionProgress += deltaTime / TRANSITION_DURATION;
        }
    } else {
        // Continue with camera transition
        transitionProgress += deltaTime / TRANSITION_DURATION;
    }
    
    if (transitionProgress >= 1.0) {
        // Transition complete
        transitionProgress = 1.0;
        isTransitioning = false;
        currentScene = nextScene;
        nextScene = null;
        
        // Instead of hiding scenes, we'll just update the camera
        console.log(`Transition complete: Now in ${currentScene} scene`);
    }
    
    // Get current and target camera positions
    const currentPos = cameraPositions.exterior.position;
    const currentTarget = cameraPositions.exterior.target;
    const targetPos = cameraPositions.interior.position;
    const targetTarget = cameraPositions.interior.target;
    
    // Interpolate camera position and target
    camera.position.lerpVectors(currentPos, targetPos, THREE.MathUtils.smoothstep(transitionProgress, 0, 1));
    controls.target.lerpVectors(currentTarget, targetTarget, THREE.MathUtils.smoothstep(transitionProgress, 0, 1));
    controls.update();
};

// Update opacity of interior elements
const updateInteriorOpacity = (progress) => {
    // We don't need to modify interior opacity anymore
    // Interior elements are always visible, but hidden by the building walls
    // console.log(`Interior opacity updateInteriorOpacity() no longer needed`);
};

// New function to update building opacity during transition
const updateBuildingOpacity = (progress) => {
    // We no longer need to manipulate opacity
    // The transition is now handled by camera movement only
    console.log(`Camera transition progress: ${progress.toFixed(2)}`);
};

// Update exterior opacity - MODIFIED for new approach
const updateExteriorOpacity = (progress) => {
    // Only fade out things like streetlights, cars, etc. but not the building itself
    sceneGroups.exterior.traverse(function(object) {
        if (object.isMesh && object.material) {
            // Check if the object is not one of our building walls
            if (!streetElements.walls.includes(object)) {
                if (!object.userData.originalOpacity) {
                    object.userData.originalOpacity = object.material.opacity !== undefined ? object.material.opacity : 1.0;
                }
                
                // Set transparent flag and update opacity
                object.material.transparent = true;
                object.material.opacity = progress * object.userData.originalOpacity;
                object.material.needsUpdate = true;
            }
        }
    });
};

// Create a car with the specified color and direction
const createCar = (x, z, color, direction) => {
    const carGroup = new THREE.Group();
    
    // Car body
    const bodyGeometry = new THREE.BoxGeometry(2, 0.7, 1, 3, 2, 2);
    const bodyMaterial = createWireframeMaterial(color);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    carGroup.add(body);
    
    // Car top
    const topGeometry = new THREE.BoxGeometry(1, 0.5, 0.8, 2, 2, 2);
    const topMaterial = createWireframeMaterial(color);
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.set(0, 1.1, 0);
    carGroup.add(top);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8, 1);
    const wheelMaterial = createWireframeMaterial(0x111111);
    
    // Front-left wheel
    const wheel1 = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel1.rotation.z = Math.PI / 2;
    wheel1.position.set(-0.7, 0.2, 0.5);
    carGroup.add(wheel1);
    
    // Front-right wheel
    const wheel2 = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel2.rotation.z = Math.PI / 2;
    wheel2.position.set(-0.7, 0.2, -0.5);
    carGroup.add(wheel2);
    
    // Back-left wheel
    const wheel3 = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel3.rotation.z = Math.PI / 2;
    wheel3.position.set(0.7, 0.2, 0.5);
    carGroup.add(wheel3);
    
    // Back-right wheel
    const wheel4 = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel4.rotation.z = Math.PI / 2;
    wheel4.position.set(0.7, 0.2, -0.5);
    carGroup.add(wheel4);
    
    // Position and rotate based on direction
    carGroup.position.set(x, 0, z);
    if (direction === 'left') {
        // Fix rotation: cars going left should point in the -x direction (looking from +z to -z)
        carGroup.rotation.y = 0; // No rotation needed as the car model already faces the right way
    } else {
        // Fix rotation: cars going right should point in the +x direction (looking from +z to -z)
        carGroup.rotation.y = Math.PI; // 180 degrees to face the opposite direction
    }
    
    carGroup.userData.direction = direction; // Store direction for animation
    
    // Add to the exterior scene group
    if (sceneGroups && sceneGroups.exterior) {
        sceneGroups.exterior.add(carGroup);
    }
    
    return carGroup;
};

// Function to get a random car color
const getRandomCarColor = () => {
    const carColors = [
        0xff0000, // Red
        0x00ff00, // Green
        0x0000ff, // Blue
        0xffff00, // Yellow
        0xff00ff, // Magenta
        0x00ffff, // Cyan
        0xffa500, // Orange
        0x800080, // Purple
        0x008000, // Dark Green
        0x000080, // Navy
        0x808080, // Gray
        0xffffff  // White
    ];
    return carColors[Math.floor(Math.random() * carColors.length)];
};

// Street scene
const createStreetScene = () => {
    const streetElements = {};
    
    // Create a proper street layout
    
    // Ground/Street
    const streetGeometry = new THREE.PlaneGeometry(90, 50, 8, 8); // Wider and deeper street
    const streetMaterial = createWireframeMaterial(0x444444); // Dark gray for street
    const street = new THREE.Mesh(streetGeometry, streetMaterial);
    street.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    street.position.y = -0.1;
    sceneGroups.exterior.add(street);
    streetElements.street = street;
    
    // Far sidewalk (where we start)
    const farSidewalkGeometry = new THREE.BoxGeometry(90, 0.2, 4, 4, 1, 2);
    const farSidewalkMaterial = createWireframeMaterial(0x888888);
    const farSidewalk = new THREE.Mesh(farSidewalkGeometry, farSidewalkMaterial);
    farSidewalk.position.set(0, 0, 20); // Far sidewalk where camera starts
    sceneGroups.exterior.add(farSidewalk);
    streetElements.farSidewalk = farSidewalk;
    
    // Near sidewalk (in front of the bar)
    const nearSidewalkGeometry = new THREE.BoxGeometry(90, 0.2, 4, 4, 1, 2);
    const nearSidewalkMaterial = createWireframeMaterial(0x888888);
    const nearSidewalk = new THREE.Mesh(nearSidewalkGeometry, nearSidewalkMaterial);
    nearSidewalk.position.set(0, 0, 2); // Just in front of the building
    sceneGroups.exterior.add(nearSidewalk);
    streetElements.nearSidewalk = nearSidewalk;
    
    // Street divider line
    const dividerGeometry = new THREE.PlaneGeometry(90, 0.3, 4, 1);
    const dividerMaterial = createWireframeMaterial(0xFFFFFF);
    const divider = new THREE.Mesh(dividerGeometry, dividerMaterial);
    divider.rotation.x = -Math.PI / 2;
    divider.position.set(0, -0.09, 11); // Center of the street
    sceneGroups.exterior.add(divider);
    streetElements.divider = divider;
    
    // Karaoke Bar Building - created as a separate structure
    const buildingGroup = new THREE.Group();
    
    // Define building dimensions and position - INCREASED SIZE
    const buildingWidth = 20; // Increased from 15
    const buildingHeight = 5; // Increased from 4
    const buildingDepth = 15; // Increased from 10
    const wallThickness = 0.2;
    
    // Create solid back panels for walls (not wireframe)
    const createSolidPanel = (width, height, depth, color) => {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.2 // Slightly visible
        });
        return new THREE.Mesh(geometry, material);
    };
    
    // Front wall (facing the street)
    const frontWallGroup = new THREE.Group();
    
    // Door dimensions for reference
    const doorWidth = 1.8;
    const doorHeight = 3.2;
    
    // Clear any potentially overlapping planes from before
    const frontFacingPlanes = [];
    
    // Function to create a double-layered wall segment with a black center
    const createSandwichedWallSegment = (width, height, depth) => {
        const segmentGroup = new THREE.Group();
        
        // Front wireframe layer
        const frontGeometry = new THREE.BoxGeometry(width, height, depth/3, Math.max(3, Math.floor(width*2)), Math.max(2, Math.floor(height*2)), 1);
        const wireframeMaterial = createWireframeMaterial(0x4169E1); // Royal blue
        wireframeMaterial.side = THREE.DoubleSide;
        const frontLayer = new THREE.Mesh(frontGeometry, wireframeMaterial);
        frontLayer.position.z = depth/3;
        
        // Back wireframe layer
        const backGeometry = new THREE.BoxGeometry(width, height, depth/3, Math.max(3, Math.floor(width*2)), Math.max(2, Math.floor(height*2)), 1);
        const backLayer = new THREE.Mesh(backGeometry, wireframeMaterial.clone());
        backLayer.position.z = -depth/3;
        
        // Solid black middle layer
        const middleGeometry = new THREE.BoxGeometry(width, height, depth/3);
        const blackMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x000000,
            transparent: false,
            opacity: 1.0
        });
        const middleLayer = new THREE.Mesh(middleGeometry, blackMaterial);
        
        segmentGroup.add(frontLayer);
        segmentGroup.add(middleLayer);
        segmentGroup.add(backLayer);
        
        return {
            group: segmentGroup,
            frontLayer,
            middleLayer,
            backLayer
        };
    };
    
    // Instead of a single front wall, create wall segments around a door cutout
    
    // Top wall segment (above the door)
    const topWallWidth = buildingWidth;
    const topWallHeight = buildingHeight - doorHeight;
    const { group: topWallGroup, middleLayer: topWallMiddle } = createSandwichedWallSegment(topWallWidth, topWallHeight, wallThickness);
    topWallGroup.position.set(0, doorHeight + (buildingHeight - doorHeight)/2, 0);
    topWallGroup.userData.position = 'front-top'; // Add userData to identify this segment
    frontWallGroup.add(topWallGroup);
    
    // Left wall segment (to the left of the door)
    const leftWallWidth = (buildingWidth - doorWidth) / 2;
    const { group: leftWallGroup, middleLayer: leftWallMiddle } = createSandwichedWallSegment(leftWallWidth, doorHeight, wallThickness);
    leftWallGroup.position.set(-buildingWidth/2 + leftWallWidth/2, doorHeight/2, 0);
    leftWallGroup.userData.position = 'front-left'; // Add userData to identify this segment
    frontWallGroup.add(leftWallGroup);
    
    // Right wall segment (to the right of the door)
    const rightWallWidth = (buildingWidth - doorWidth) / 2;
    const { group: rightWallGroup, middleLayer: rightWallMiddle } = createSandwichedWallSegment(rightWallWidth, doorHeight, wallThickness);
    rightWallGroup.position.set(buildingWidth/2 - rightWallWidth/2, doorHeight/2, 0);
    rightWallGroup.userData.position = 'front-right'; // Add userData to identify this segment
    frontWallGroup.add(rightWallGroup);
    
    // Position the entire front wall group
    frontWallGroup.position.set(0, 0, 0);
    buildingGroup.add(frontWallGroup);
    
    // Back wall with sandwiched structure
    const { group: backWallGroup, middleLayer: backWallMiddle } = createSandwichedWallSegment(buildingWidth, buildingHeight, wallThickness);
    backWallGroup.position.set(0, buildingHeight/2, -buildingDepth);
    buildingGroup.add(backWallGroup);
    
    // Left wall with sandwiched structure
    const { group: leftSideWallGroup, middleLayer: leftSideWallMiddle } = createSandwichedWallSegment(buildingDepth, buildingHeight, wallThickness);
    leftSideWallGroup.rotation.y = Math.PI/2; // Rotate to be a side wall
    leftSideWallGroup.position.set(-buildingWidth/2, buildingHeight/2, -buildingDepth/2);
    buildingGroup.add(leftSideWallGroup);
    
    // Right wall with sandwiched structure
    const { group: rightSideWallGroup, middleLayer: rightSideWallMiddle } = createSandwichedWallSegment(buildingDepth, buildingHeight, wallThickness);
    rightSideWallGroup.rotation.y = Math.PI/2; // Rotate to be a side wall
    rightSideWallGroup.position.set(buildingWidth/2, buildingHeight/2, -buildingDepth/2);
    buildingGroup.add(rightSideWallGroup);
    
    // Floor
    const floorGeometry = new THREE.PlaneGeometry(buildingWidth, buildingDepth, 8, 8);
    const floorMaterial = createWireframeMaterial(0x333333);
    floorMaterial.side = THREE.DoubleSide;
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -buildingDepth/2);
    floor.userData.isFloor = true; // Mark as floor so it's not removed by cleanup
    buildingGroup.add(floor);
    
    // Ceiling/Roof
    const ceilingGeometry = new THREE.PlaneGeometry(buildingWidth, buildingDepth, 6, 6);
    const ceilingMaterial = createWireframeMaterial(0x333333);
    ceilingMaterial.side = THREE.DoubleSide;
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, buildingHeight, -buildingDepth/2);
    ceiling.userData.isCeiling = true; // Mark as ceiling so it's not removed by cleanup
    buildingGroup.add(ceiling);
    
    // Instead of one glow box, create separate glow segments to avoid crossing the doorway
    // Glow color
    const glowColor = 0x00BFFF; // Deep sky blue for glow
    const glowOpacity = 0.5;
    
    // Create a helper function to create a glow segment box
    const createGlowSegment = (width, height, depth, x, y, z) => {
        const geometry = new THREE.BoxGeometry(width, height, depth, 
            Math.max(2, Math.floor(width*2)), 
            Math.max(2, Math.floor(height*2)), 
            Math.max(2, Math.floor(depth*2)));
        const material = createWireframeMaterial(glowColor, glowOpacity);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        return mesh;
    };
    
    // Dimensions with slight padding
    const glowWidth = buildingWidth + 0.4;
    const glowHeight = buildingHeight + 0.2;
    const glowDepth = buildingDepth + 0.4;
    const glowThickness = 0.1; // Thickness of each glow segment

    // Create a glow group to hold all segments
    const glowGroup = new THREE.Group();
    
    // Top glow (above the doorway)
    const topGlow = createGlowSegment(
        glowWidth, // full width
        glowThickness, // thin height at top
        glowDepth, // full depth
        0, // centered
        buildingHeight + glowThickness/2, // at the top
        -buildingDepth/2 // centered in depth
    );
    glowGroup.add(topGlow);
    
    // Bottom glow (below, but not in the doorway)
    const bottomGlow = createGlowSegment(
        glowWidth, // full width
        glowThickness, // thin height at bottom
        glowDepth, // full depth
        0, // centered
        -glowThickness/2, // at the bottom
        -buildingDepth/2 // centered in depth
    );
    glowGroup.add(bottomGlow);
    
    // Left glow (full height on the left side)
    const leftGlow = createGlowSegment(
        glowThickness, // thin width at left
        glowHeight, // full height
        glowDepth, // full depth
        -buildingWidth/2 - glowThickness/2, // at the left side
        buildingHeight/2, // centered in height
        -buildingDepth/2 // centered in depth
    );
    glowGroup.add(leftGlow);
    
    // Right glow (full height on the right side)
    const rightGlow = createGlowSegment(
        glowThickness, // thin width at right
        glowHeight, // full height
        glowDepth, // full depth
        buildingWidth/2 + glowThickness/2, // at the right side
        buildingHeight/2, // centered in height
        -buildingDepth/2 // centered in depth
    );
    glowGroup.add(rightGlow);
    
    // Back glow (full width and height at the back)
    const backGlow = createGlowSegment(
        glowWidth, // full width
        glowHeight, // full height
        glowThickness, // thin depth at back
        0, // centered
        buildingHeight/2, // centered in height
        -buildingDepth - glowThickness/2 // at the back
    );
    glowGroup.add(backGlow);
    
    // Front glow segments (need to account for the doorway)
    // Front Top (above the door)
    const frontTopGlow = createGlowSegment(
        glowWidth, // full width
        glowHeight - doorHeight, // height minus door
        glowThickness, // thin depth at front
        0, // centered
        doorHeight + (glowHeight - doorHeight)/2, // positioned above the door
        glowThickness/2 // at the front
    );
    glowGroup.add(frontTopGlow);
    
    // Front Left (left of the door)
    const frontLeftGlow = createGlowSegment(
        (glowWidth - doorWidth)/2, // half width minus half door
        doorHeight, // door height
        glowThickness, // thin depth at front
        -glowWidth/4 - doorWidth/4, // positioned left of the door
        doorHeight/2, // centered on door height
        glowThickness/2 // at the front
    );
    glowGroup.add(frontLeftGlow);
    
    // Front Right (right of the door)
    const frontRightGlow = createGlowSegment(
        (glowWidth - doorWidth)/2, // half width minus half door
        doorHeight, // door height
        glowThickness, // thin depth at front
        glowWidth/4 + doorWidth/4, // positioned right of the door
        doorHeight/2, // centered on door height
        glowThickness/2 // at the front
    );
    glowGroup.add(frontRightGlow);
    
    // Add the glow group to the building
    glowGroup.position.set(0, 0, 0);
    buildingGroup.add(glowGroup);
    streetElements.glowGroup = glowGroup;
    
    // Remove the glow from doorway even more directly - create a "black hole" in the door area
    const doorwayGlowCutout = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth + 0.4, doorHeight + 0.4, 1),
        new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: false,
            transparent: true,
            opacity: 0,
            depthTest: false
        })
    );
    doorwayGlowCutout.position.set(0, doorHeight/2, 0);
    buildingGroup.add(doorwayGlowCutout);
    
    // Position the entire building
    buildingGroup.position.set(0, 0, 0); // Building front at z=0
    sceneGroups.exterior.add(buildingGroup);
    streetElements.buildingGroup = buildingGroup;
    
    // Store references to wall components
    streetElements.walls = [topWallGroup, leftWallGroup, rightWallGroup, backWallGroup, leftSideWallGroup, rightSideWallGroup]; 
    streetElements.wallMiddleLayers = [topWallMiddle, leftWallMiddle, rightWallMiddle, backWallMiddle, leftSideWallMiddle, rightSideWallMiddle];
    
    // Door - integrated with the front wall but now with thickness
    const doorThickness = 0.2; // Added thickness to door
    
    // Create a door group to handle the rotation around a hinge
    const doorGroup = new THREE.Group();
    
    // Use BoxGeometry instead of PlaneGeometry for thickness
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness, 3, 4, 2);
    const doorMaterial = createWireframeMaterial(0xff0000); // Red door wireframe
    doorMaterial.side = THREE.DoubleSide; // Make sure both sides are visible
    
    // Create solid black backing for the door
    const doorBackingGeometry = new THREE.BoxGeometry(doorWidth - 0.2, doorHeight - 0.2, doorThickness * 0.5, 1, 1, 1);
    const doorBackingMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: false,
        opacity: 1.0
    });
    const doorBacking = new THREE.Mesh(doorBackingGeometry, doorBackingMaterial);
    
    // Create door mesh with the wireframe
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    
    // Add small windows to the door
    const createDoorWindow = (x, y) => {
        // Window frame
        const windowFrameGeometry = new THREE.BoxGeometry(0.4, 0.4, doorThickness + 0.02, 1, 1, 1);
        const windowFrameMaterial = createWireframeMaterial(0xffffff);
        const windowFrame = new THREE.Mesh(windowFrameGeometry, windowFrameMaterial);
        windowFrame.position.set(x, y, 0);
        
        // Window glass - transparent blue
        const windowGlassGeometry = new THREE.BoxGeometry(0.35, 0.35, doorThickness + 0.03, 1, 1, 1);
        const windowGlassMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x88ccff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide
        });
        const windowGlass = new THREE.Mesh(windowGlassGeometry, windowGlassMaterial);
        windowGlass.position.set(x, y, 0);
        
        return [windowFrame, windowGlass];
    };
    
    // Add 4 small windows to the door - positioned even lower than before
    const doorWindows = [
        ...createDoorWindow(-0.325, 1.0),  // Top left - lowered from 1.8
        ...createDoorWindow(0.325, 1.0),   // Top right - lowered from 1.8
        ...createDoorWindow(-0.325, 0.4),  // Bottom left - lowered from 1.2
        ...createDoorWindow(0.325, 0.4)    // Bottom right - lowered from 1.2
    ];
    
    // Position door properly in the group
    // Move door so its left edge is at the origin (the hinge point)
    door.position.set(doorWidth/2, doorHeight/2, doorThickness/2);
    doorBacking.position.set(doorWidth/2, doorHeight/2, doorThickness/2);
    
    // Add door parts to the door group
    doorGroup.add(door);
    doorGroup.add(doorBacking);
    
    // Add windows to the door
    doorWindows.forEach(windowPart => {
        windowPart.position.x += doorWidth/2;
        windowPart.position.y += doorHeight/2;
        windowPart.position.z += doorThickness/2;
        doorGroup.add(windowPart);
    });
    
    // Add a light to help visualize the door position and rotation
    const doorLight = new THREE.PointLight(0xffff00, 0.5, 2);
    doorLight.position.set(0, doorHeight/2, 0);
    doorGroup.add(doorLight);
    
    // Position the door group at the proper location in the building
    // We position it so the hinge is at the left side of the doorway
    doorGroup.position.set(-doorWidth/2, 0, 0.1); 
    sceneGroups.exterior.add(doorGroup);
    streetElements.door = doorGroup; // Store reference to door group
    
    // Windows - integrated with the front wall but now transparent from both sides
    // Create window with frame and transparent glass visible from both sides
    const createTransparentWindow = (x, y, z) => {
        const windowGroup = new THREE.Group();
        
        // Window frame - wireframe
        const frameGeometry = new THREE.BoxGeometry(2, 2, 0.1, 2, 2, 1);
        const frameMaterial = createWireframeMaterial(0x00ffff); // Cyan window frame
        frameMaterial.side = THREE.DoubleSide; // Visible from both sides
        const frame = new THREE.Mesh(frameGeometry, frameMaterial);
        
        // Glass - transparent
        const glassGeometry = new THREE.BoxGeometry(1.8, 1.8, 0.12, 1, 1, 1);
        const glassMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x88ccff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide // Visible from both sides
        });
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        
        windowGroup.add(frame);
        windowGroup.add(glass);
        windowGroup.position.set(x, y, z);
        
        return windowGroup;
    };
    
    // Left window
    const window1 = createTransparentWindow(-5, 3, 0.1); 
    window1.rotation.y = Math.PI;
    sceneGroups.exterior.add(window1);
    
    // Right window
    const window2 = createTransparentWindow(5, 3, 0.1);
    window2.rotation.y = Math.PI;
    sceneGroups.exterior.add(window2);
    
    streetElements.windows = [window1, window2];
    
    // Create window cutouts in the black middle layers
    const cutOutWindowInWall = (windowObj, wallMiddleLayer) => {
        // Get the window position relative to the wall
        const windowWorldPos = new THREE.Vector3();
        windowObj.getWorldPosition(windowWorldPos);
        
        // Get the wall middle layer position
        const wallWorldPos = new THREE.Vector3();
        wallMiddleLayer.getWorldPosition(wallWorldPos);
        
        // Calculate the relative position
        const relX = windowWorldPos.x - wallWorldPos.x;
        const relY = windowWorldPos.y - wallWorldPos.y;
        
        // Calculate the size of the window (assuming it's 2x2 units)
        const windowSize = 2.0;
        
        // Create a hole with a fully transparent material that's the same size as the window
        // Increased to match window size exactly
        const cutoutSize = windowSize;
        const holeGeometry = new THREE.BoxGeometry(cutoutSize, cutoutSize, 1);
        const holeMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000, 
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false // Don't write to depth buffer
        });
        const hole = new THREE.Mesh(holeGeometry, holeMaterial);
        
        // Position the hole at the window location
        hole.position.set(relX, relY, 0);
        
        // Add the hole to the wall's middle layer
        wallMiddleLayer.add(hole);
        
        // Create a completely invisible mesh to ensure we have a proper hole
        const completeHoleGeometry = new THREE.BoxGeometry(cutoutSize, cutoutSize, 2);
        const completeHoleMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: false // Skip depth testing completely to ensure visibility
        });
        const completeHole = new THREE.Mesh(completeHoleGeometry, completeHoleMaterial);
        completeHole.position.set(relX, relY, 0);
        wallMiddleLayer.add(completeHole);
        
        // Remove the actual material where the window is by using a custom shader
        if (wallMiddleLayer.material) {
            // Make sure the wall middle layer's material is transparent
            wallMiddleLayer.material.transparent = true;
            
            // Apply a stronger cutout shader that makes a complete hole
            const newMaterial = new THREE.ShaderMaterial({
                uniforms: {
                    baseColor: { value: new THREE.Color(0x000000) },
                    holeCenter: { value: new THREE.Vector2(relX, relY) },
                    holeSize: { value: cutoutSize * 0.5 }, // Half size for radius calculation
                    wallSize: { value: new THREE.Vector2(
                        wallMiddleLayer.geometry.parameters.width,
                        wallMiddleLayer.geometry.parameters.height
                    )}
                },
                vertexShader: `
                    varying vec3 vPosition;
                    
                    void main() {
                        vPosition = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 baseColor;
                    uniform vec2 holeCenter;
                    uniform float holeSize;
                    uniform vec2 wallSize;
                    varying vec3 vPosition;
                    
                    void main() {
                        // Calculate distance from hole center
                        float dx = abs(vPosition.x - holeCenter.x);
                        float dy = abs(vPosition.y - holeCenter.y);
                        
                        // Simple box test - if inside the box dimensions, make transparent
                        if (dx < holeSize && dy < holeSize) {
                            discard; // Complete transparency - fully discard the fragment
                        } else {
                            gl_FragColor = vec4(baseColor, 1.0); // Solid black
                        }
                    }
                `,
                side: THREE.DoubleSide
            });
            
            // Apply the new material
            wallMiddleLayer.material = newMaterial;
        }
    };
    
    // Completely remove the door area wireframe
    const createDoorwayOpening = () => {
        // Reference the front wall elements directly
        const frontWallTop = frontWallGroup.children.find(segment => 
            segment.userData && segment.userData.position === 'front-top');
        const frontWallLeft = frontWallGroup.children.find(segment => 
            segment.userData && segment.userData.position === 'front-left');
        const frontWallRight = frontWallGroup.children.find(segment => 
            segment.userData && segment.userData.position === 'front-right');
        
        console.log('Wall segments found:', !!frontWallTop, !!frontWallLeft, !!frontWallRight);
        
        // Get all layers of the front wall (each wall has three layers: front wireframe, middle black, back wireframe)
        const getAllWallLayers = (wallSegment) => {
            if (!wallSegment) return [];
            
            const layers = [];
            wallSegment.traverse(child => {
                if (child.isMesh && child !== wallSegment) {
                    layers.push(child);
                }
            });
            return layers;
        };
        
        // Create a simple doorway cutout as a fallback, in case we can't find the wall segments
        let doorwayCreated = false;
        
        // Process all front wall segments
        [frontWallTop, frontWallLeft, frontWallRight].forEach(wallSegment => {
            if (!wallSegment) return;
            
            doorwayCreated = true;
            const wallLayers = getAllWallLayers(wallSegment);
            console.log(`Layers found for ${wallSegment.userData.position}:`, wallLayers.length);
            
            // For each layer in the wall, create an invisible box in the doorway area
            wallLayers.forEach(layer => {
                // Create a fully transparent material for the doorway area
                const doorwayMaterial = new THREE.MeshBasicMaterial({
                    transparent: true,
                    opacity: 0,
                    depthWrite: false,
                    colorWrite: false, // Prevent any color writing
                    depthTest: false   // Skip depth testing to ensure nothing appears
                });
                
                // Create an invisible mesh to cover any wireframe in the doorway area
                const doorwayGeometry = new THREE.BoxGeometry(doorWidth + 0.2, doorHeight + 0.2, 3);
                const doorway = new THREE.Mesh(doorwayGeometry, doorwayMaterial);
                
                // Position the invisible mesh at the door's location
                // This needs to be calculated based on the wall segment's position
                const wallWorldPos = new THREE.Vector3();
                wallSegment.getWorldPosition(wallWorldPos);
                
                // Door is at the center of the front wall at y = doorHeight/2
                const relX = 0 - wallWorldPos.x; // Center of front wall
                const relY = doorHeight / 2 - wallWorldPos.y;
                doorway.position.set(relX, relY, 0);
                
                // Add the invisible mesh to completely cover any wireframe
                layer.add(doorway);
                
                // For wireframe layers, we need to actively remove any faces in the doorway area
                if (layer.material && layer.material.wireframe) {
                    // Apply a custom shader material that discards fragments in the doorway area
                    const customMaterial = new THREE.ShaderMaterial({
                        uniforms: {
                            baseColor: { value: new THREE.Color(layer.material.color ? layer.material.color.getHex() : 0xffffff) },
                            doorwayCenter: { value: new THREE.Vector2(relX, relY) },
                            doorwaySize: { value: new THREE.Vector2((doorWidth + 0.2) / 2, (doorHeight + 0.2) / 2) }
                        },
                        vertexShader: `
                            varying vec3 vPosition;
                            
                            void main() {
                                vPosition = position;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            uniform vec3 baseColor;
                            uniform vec2 doorwayCenter;
                            uniform vec2 doorwaySize;
                            varying vec3 vPosition;
                            
                            void main() {
                                // Calculate distance from doorway center
                                float dx = abs(vPosition.x - doorwayCenter.x);
                                float dy = abs(vPosition.y - doorwayCenter.y);
                                
                                // If inside doorway dimensions, make fully transparent
                                if (dx < doorwaySize.x && dy < doorwaySize.y) {
                                    discard; // Complete transparency
                                } else {
                                    gl_FragColor = vec4(baseColor, 1.0);
                                }
                            }
                        `,
                        wireframe: true,
                        side: THREE.DoubleSide
                    });
                    
                    // Apply the custom material to the wireframe layer
                    layer.material = customMaterial;
                }
            });
        });
        
        // If we couldn't find the wall segments, create a simpler doorway opening
        if (!doorwayCreated) {
            console.log('No wall segments found, using fallback doorway');
            const doorwayGeometry = new THREE.BoxGeometry(doorWidth + 0.4, doorHeight + 0.4, wallThickness * 3);
            const doorwayMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                depthWrite: false,
                depthTest: false
            });
            
            const doorwayHole = new THREE.Mesh(doorwayGeometry, doorwayMaterial);
            doorwayHole.position.set(0, doorHeight/2, 0);
            frontWallGroup.add(doorwayHole);
            
            // Also add another hole to ensure the doorway is clear
            const additionalHole = new THREE.Mesh(
                new THREE.BoxGeometry(doorWidth + 0.5, doorHeight + 0.5, wallThickness * 4),
                doorwayMaterial.clone()
            );
            additionalHole.position.set(0, doorHeight/2, 0);
            buildingGroup.add(additionalHole);
            
            return doorwayHole;
        }
        
        // Extra safety measure: Create a complete doorway void to ensure nothing is rendered there
        const completeVoidGeometry = new THREE.BoxGeometry(doorWidth + 0.3, doorHeight + 0.3, 5);
        const completeVoidMaterial = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            colorWrite: false,
            depthTest: false
        });
        const completeVoid = new THREE.Mesh(completeVoidGeometry, completeVoidMaterial);
        
        // Position this void at the door's center
        completeVoid.position.set(0, doorHeight/2, 0);
        sceneGroups.exterior.add(completeVoid);
        
        // Add one more void directly to the scene for absolute certainty
        const finalVoid = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth + 0.6, doorHeight + 0.6, 6),
            completeVoidMaterial.clone()
        );
        finalVoid.position.set(0, doorHeight/2, 0);
        scene.add(finalVoid);
        
        return completeVoid;
    };
    
    // Create doorway opening
    const doorwayOpening = createDoorwayOpening();
    streetElements.doorwayOpening = doorwayOpening;
    
    // Cut out windows from left and right side of front wall
    // First, find the actual wall layers that contain the window positions
    const findWallWithWindow = (windowX) => {
        // Determine which wall segment the window is in based on X position
        if (windowX < 0) {
            return leftWallMiddle; // Left window is in left wall segment
        } else {
            return rightWallMiddle; // Right window is in right wall segment
        }
    };
    
    // Create the actual cutouts
    cutOutWindowInWall(window1, findWallWithWindow(window1.position.x));
    cutOutWindowInWall(window2, findWallWithWindow(window2.position.x));
    
    // Create additional buildings along the street
    const createBuildingFacade = (x, z, width, height, depth, style) => {
        const buildingGroup = new THREE.Group();
        
        // Define base colors based on style
        let baseColor, windowColor, roofColor;
        
        switch(style) {
            case 'modern':
                baseColor = 0x555555; // Dark gray
                windowColor = 0x88CCFF; // Light blue
                roofColor = 0x333333; // Darker gray
                break;
            case 'brick':
                baseColor = 0x992222; // Brick red
                windowColor = 0xFFFFAA; // Warm light
                roofColor = 0x553333; // Dark red
                break;
            case 'shop':
                baseColor = 0x227722; // Green
                windowColor = 0xFFFFFF; // White
                roofColor = 0x113311; // Dark green
                break;
            case 'industrial':
                baseColor = 0x777777; // Gray
                windowColor = 0x99AAAA; // Gray blue
                roofColor = 0x555555; // Medium gray
                break;
            case 'hospital':
                baseColor = 0xEEEEEE; // White
                windowColor = 0xCCFFFF; // Light cyan
                roofColor = 0xCCCCCC; // Light gray
                break;
            case 'graveyard':
                baseColor = 0x666666; // Dark gray
                windowColor = 0x444455; // Dark blue-gray
                roofColor = 0x333333; // Dark gray
                break;
            default:
                baseColor = 0x4169E1; // Default blue
                windowColor = 0x00FFFF; // Cyan
                roofColor = 0x333333; // Dark gray
        }
        
        // Special case for graveyard - no building facade, just ground and gravestones
        if (style === 'graveyard') {
            // Create graveyard ground
            const groundGeometry = new THREE.PlaneGeometry(width, depth);
            const groundMaterial = createWireframeMaterial(0x2E5D30); // Earth green
            const ground = new THREE.Mesh(groundGeometry, groundMaterial);
            ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
            ground.position.set(0, 0.01, -depth/2); // Slightly above ground level
            buildingGroup.add(ground);
            
            // Create path down the middle
            const pathWidth = width * 0.4;
            const pathGeometry = new THREE.PlaneGeometry(pathWidth, depth);
            const pathMaterial = createWireframeMaterial(0x4A6741); // Brownish green
            const path = new THREE.Mesh(pathGeometry, pathMaterial);
            path.rotation.x = -Math.PI / 2;
            path.position.set(0, 0.02, -depth/2); // Slightly above the ground
            buildingGroup.add(path);
            
            // Create gravestones in the yard area
            const graveyard = new THREE.Group();
            
            // Create rows of gravestones
            const rowCount = Math.floor(depth / 5);
            const colCount = Math.floor(width / 2);
            
            for (let row = 0; row < rowCount; row++) {
                for (let col = 0; col < colCount; col++) {
                    // Skip positions in the middle (path area)
                    const isCenterCol = col >= Math.floor(colCount * 0.4) && col <= Math.floor(colCount * 0.6);
                    if (isCenterCol && row > 0) continue;
                    
                    // Skip some positions randomly
                    if (Math.random() > 0.7) continue;
                    
                    // Position with some randomness
                    const posX = -width/2 + 1 + col * 2 + (Math.random() * 0.8 - 0.4);
                    const posZ = -2 - row * 4 - (Math.random() * 2);
                    
                    // Create gravestone
                    const stoneHeight = 0.8 + Math.random() * 0.6;
                    const stoneWidth = 0.6 + Math.random() * 0.3;
                    
                    // Stone base shape varies
                    let stoneGeometry;
                    if (Math.random() > 0.5) {
                        // Rectangle with rounded top
                        stoneGeometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, 0.2);
                    } else {
                        // Cross shape
                        stoneGeometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, 0.2);
                    }
                    
                    const stoneMaterial = createWireframeMaterial(0x999999);
                    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
                    
                    stone.position.set(posX, stoneHeight/2, posZ);
                    graveyard.add(stone);
                }
            }
            
            // Add the graveyard group to the building group
            buildingGroup.add(graveyard);
            
            // Position the building group
            buildingGroup.position.set(x, 0, z);
            
            return buildingGroup;
        }
        
        // For non-graveyard buildings, continue with normal facade creation
        const frontWallGroup = new THREE.Group();
        
        // Create sandwich wall (outer layer, middle layer, inner layer)
        const wallOuterGeometry = new THREE.BoxGeometry(width, height, 0.05);
        const wallOuterMaterial = createWireframeMaterial(baseColor);
        const wallOuter = new THREE.Mesh(wallOuterGeometry, wallOuterMaterial);
        wallOuter.position.set(0, height/2, 0);
        frontWallGroup.add(wallOuter);
        
        // Middle layer
        const wallMiddleGeometry = new THREE.BoxGeometry(width, height, 0.05);
        const wallMiddleMaterial = createWireframeMaterial(baseColor);
        const wallMiddle = new THREE.Mesh(wallMiddleGeometry, wallMiddleMaterial);
        wallMiddle.position.set(0, height/2, 0);
        frontWallGroup.add(wallMiddle);
        
        // Inner layer
        const wallInnerGeometry = new THREE.BoxGeometry(width, height, 0.05);
        const wallInnerMaterial = createWireframeMaterial(baseColor);
        const wallInner = new THREE.Mesh(wallInnerGeometry, wallInnerMaterial);
        wallInner.position.set(0, height/2, 0);
        frontWallGroup.add(wallInner);
        
        // Add windows based on building style
        const windowRows = Math.floor(height / 1.5);
        const windowCols = Math.floor(width / 2);
        
        // Create and distribute windows
        for (let row = 0; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
                // Calculate window position
                const windowX = -width/2 + 1 + col * 2;
                const windowY = 1 + row * 1.5;
                
                // Skip some windows randomly for variety
                if (Math.random() > 0.85 && style !== 'hospital') continue;
                
                // Create a window
                let windowWidth = 0.8;
                let windowHeight = 1.0;
                
                // Vary window size for different styles
                if (style === 'modern') {
                    windowWidth = 1.2;
                    windowHeight = 1.2;
                } else if (style === 'shop' && row === 0) {
                    // Larger windows for shop fronts on ground floor
                    windowWidth = 1.5;
                    windowHeight = 1.8;
                } else if (style === 'hospital') {
                    // Uniform windows for hospital
                    windowWidth = 1.0;
                    windowHeight = 1.4;
                }
                
                // Create window frame
                const frameGeometry = new THREE.BoxGeometry(windowWidth, windowHeight, 0.15);
                const frameMaterial = createWireframeMaterial(windowColor);
                frameMaterial.side = THREE.DoubleSide;
                const frame = new THREE.Mesh(frameGeometry, frameMaterial);
                frame.position.set(windowX, windowY, 0.05);
                frontWallGroup.add(frame);
                
                // Create a window cutout in the middle layer
                const cutoutSize = Math.min(windowWidth, windowHeight) * 0.8;
                const holeGeometry = new THREE.BoxGeometry(cutoutSize, cutoutSize, 0.25);
                const holeMaterial = new THREE.MeshBasicMaterial({
                    color: 0x000000,
                    transparent: true,
                    opacity: 0.0,
                    side: THREE.DoubleSide
                });
                const hole = new THREE.Mesh(holeGeometry, holeMaterial);
                hole.position.set(windowX, windowY, 0);
                wallMiddle.add(hole);
            }
        }
        
        // Add a storefront door for shop style buildings
        if (style === 'shop') {
            const doorWidth = 1.2;
            const doorHeight = 2.0;
            
            // Door frame
            const doorFrameGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.15);
            const doorFrameMaterial = createWireframeMaterial(baseColor);
            doorFrameMaterial.color.multiplyScalar(1.2); // Slightly brighter
            const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
            doorFrame.position.set(0, doorHeight/2, 0.05);
            frontWallGroup.add(doorFrame);
            
            // Door cutout in the middle layer
            const cutoutGeometry = new THREE.BoxGeometry(doorWidth * 0.8, doorHeight * 0.9, 0.25);
            const cutoutMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide
            });
            const doorCutout = new THREE.Mesh(cutoutGeometry, cutoutMaterial);
            doorCutout.position.set(0, doorHeight/2, 0);
            wallMiddle.add(doorCutout);
        } 
        
        // Add hospital entrance
        if (style === 'hospital') {
            const doorWidth = 2.5;
            const doorHeight = 2.8;
            
            // Double door frame
            const doorFrameGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 0.15);
            const doorFrameMaterial = createWireframeMaterial(0xDDDDDD); // Light gray
            doorFrameMaterial.side = THREE.DoubleSide;
            const doorFrame = new THREE.Mesh(doorFrameGeometry, doorFrameMaterial);
            doorFrame.position.set(0, doorHeight/2, 0.05);
            frontWallGroup.add(doorFrame);
            
            // Door cutout in the middle layer
            const cutoutGeometry = new THREE.BoxGeometry(doorWidth * 0.9, doorHeight * 0.95, 0.25);
            const cutoutMaterial = new THREE.MeshBasicMaterial({
                color: 0x000000,
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide
            });
            const doorCutout = new THREE.Mesh(cutoutGeometry, cutoutMaterial);
            doorCutout.position.set(0, doorHeight/2, 0);
            wallMiddle.add(doorCutout);
            
            // Add cross sign
            const crossGroup = new THREE.Group();
            
            // Vertical bar
            const verticalGeometry = new THREE.BoxGeometry(0.8, 2.2, 0.1);
            const crossMaterial = createWireframeMaterial(0xFF0000); // Red
            const verticalBar = new THREE.Mesh(verticalGeometry, crossMaterial);
            crossGroup.add(verticalBar);
            
            // Horizontal bar
            const horizontalGeometry = new THREE.BoxGeometry(2.2, 0.8, 0.1);
            const horizontalBar = new THREE.Mesh(horizontalGeometry, crossMaterial);
            crossGroup.add(horizontalBar);
            
            // Position the cross
            crossGroup.position.set(0, height - 1.5, 0.2);
            frontWallGroup.add(crossGroup);
        }
        
        // Add specialized features for graveyard building
        if (style === 'graveyard') {
            // Add a gate entrance
            const gateWidth = 1.6;
            const gateHeight = 2.5;
            
            // Gate frame
            const gateFrameGeometry = new THREE.BoxGeometry(gateWidth, gateHeight, 0.2);
            const gateFrameMaterial = createWireframeMaterial(0x333333); // Dark gray
            const gateFrame = new THREE.Mesh(gateFrameGeometry, gateFrameMaterial);
            gateFrame.position.set(0, gateHeight/2, 0.1);
            frontWallGroup.add(gateFrame);
            
            // Gate arched top
            const archGeometry = new THREE.TorusGeometry(gateWidth/2, 0.2, 8, 8, Math.PI);
            const archMaterial = createWireframeMaterial(0x333333);
            const arch = new THREE.Mesh(archGeometry, archMaterial);
            arch.rotation.x = Math.PI/2;
            arch.position.set(0, gateHeight + 0.2, 0.1);
            frontWallGroup.add(arch);
            
            // Create gravestones in the yard area
            const graveyard = new THREE.Group();
            
            // Create rows of gravestones
            const rowCount = Math.floor(depth / 5);
            const colCount = Math.floor(width / 2);
            
            for (let row = 0; row < rowCount; row++) {
                for (let col = 0; col < colCount; col++) {
                    // Skip some positions randomly
                    if (Math.random() > 0.7) continue;
                    
                    // Position with some randomness
                    const posX = -width/2 + 1 + col * 2 + (Math.random() * 0.8 - 0.4);
                    const posZ = -2 - row * 4 - (Math.random() * 2);
                    
                    // Create gravestone
                    const stoneHeight = 0.8 + Math.random() * 0.6;
                    const stoneWidth = 0.6 + Math.random() * 0.3;
                    
                    // Stone base shape varies
                    let stoneGeometry;
                    if (Math.random() > 0.5) {
                        // Rectangle with rounded top
                        stoneGeometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, 0.2);
                    } else {
                        // Cross shape
                        stoneGeometry = new THREE.BoxGeometry(stoneWidth, stoneHeight, 0.2);
                    }
                    
                    const stoneMaterial = createWireframeMaterial(0x999999);
                    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
                    
                    stone.position.set(posX, stoneHeight/2, posZ);
                    graveyard.add(stone);
                }
            }
            
            // Position the graveyard
            graveyard.position.set(0, 0, -depth/6);
            frontWallGroup.add(graveyard);
        }
        
        // Add roof
        const roofGeometry = new THREE.BoxGeometry(width, 0.2, depth);
        const roofMaterial = createWireframeMaterial(roofColor);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, height, -depth/2);
        frontWallGroup.add(roof);
        
        // Add some details based on style
        if (style === 'modern') {
            // Add a rooftop structure for modern buildings
            const rooftopGeometry = new THREE.BoxGeometry(width/3, 0.8, depth/2);
            const rooftopMaterial = createWireframeMaterial(baseColor);
            const rooftop = new THREE.Mesh(rooftopGeometry, rooftopMaterial);
            rooftop.position.set(0, height + 0.5, -depth/2);
            frontWallGroup.add(rooftop);
        } else if (style === 'industrial') {
            // Add pipes or vents for industrial buildings
            const pipeGeometry = new THREE.CylinderGeometry(0.2, 0.2, height, 4, 1);
            const pipeMaterial = createWireframeMaterial(0x999999);
            const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
            pipe.position.set(width/2 - 0.5, height/2, -0.1);
            frontWallGroup.add(pipe);
        } else if (style === 'brick') {
            // Add a chimney for brick buildings
            const chimneyGeometry = new THREE.BoxGeometry(0.6, 1.2, 0.6);
            const chimneyMaterial = createWireframeMaterial(baseColor);
            chimneyMaterial.color.multiplyScalar(0.8); // Darker
            const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
            chimney.position.set(width/3, height + 0.6, -depth/3);
            frontWallGroup.add(chimney);
        } else if (style === 'hospital') {
            // Add a helicopter pad on the roof
            const padGeometry = new THREE.CylinderGeometry(width/6, width/6, 0.1, 16);
            const padMaterial = createWireframeMaterial(0x333333);
            const helipad = new THREE.Mesh(padGeometry, padMaterial);
            helipad.position.set(0, height + 0.1, -depth/2);
            frontWallGroup.add(helipad);
            
            // H letter on helipad
            const hGeometry = new THREE.BoxGeometry(width/18, 0.05, width/9);
            const hMaterial = createWireframeMaterial(0xFFFFFF);
            const hLetter = new THREE.Mesh(hGeometry, hMaterial);
            hLetter.position.set(0, height + 0.16, -depth/2);
            frontWallGroup.add(hLetter);
            
            // Vertical parts of H
            const vLeftGeometry = new THREE.BoxGeometry(width/45, 0.05, width/9);
            const vLeftLetter = new THREE.Mesh(vLeftGeometry, hMaterial);
            vLeftLetter.position.set(-width/24, height + 0.16, -depth/2);
            frontWallGroup.add(vLeftLetter);
            
            const vRightGeometry = new THREE.BoxGeometry(width/45, 0.05, width/9);
            const vRightLetter = new THREE.Mesh(vRightGeometry, hMaterial);
            vRightLetter.position.set(width/24, height + 0.16, -depth/2);
            frontWallGroup.add(vRightLetter);
        }
        
        // Side walls for a little more depth
        const sideWallGeometry = new THREE.BoxGeometry(0.2, height, depth);
        const sideWallMaterial = createWireframeMaterial(baseColor);
        sideWallMaterial.color.multiplyScalar(0.9); // Slightly darker
        
        const leftWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
        leftWall.position.set(-width/2, height/2, -depth/2);
        frontWallGroup.add(leftWall);
        
        const rightWall = new THREE.Mesh(sideWallGeometry, sideWallMaterial);
        rightWall.position.set(width/2, height/2, -depth/2);
        frontWallGroup.add(rightWall);
        
        // Add a sign for shop buildings
        if (style === 'shop') {
            const signGeometry = new THREE.BoxGeometry(width * 0.7, 0.8, 0.3);
            const signMaterial = createWireframeMaterial(0xffaa00); // Orange sign
            const sign = new THREE.Mesh(signGeometry, signMaterial);
            sign.position.set(0, height - 1, 0.2);
            frontWallGroup.add(sign);
        }
        
        buildingGroup.add(frontWallGroup);
        buildingGroup.position.set(x, 0, z);
        
        return buildingGroup;
    };
    
    // Place buildings along the street
    const buildingStyles = ['modern', 'brick', 'shop', 'industrial', 'hospital', 'graveyard'];
    const buildingGap = 2; // Gap between buildings
    const facadeDepth = 10; // Renamed from buildingDepth to avoid redeclaration
    
    // Buildings on the left side (negative x)
    let nextBuildingX = -buildingWidth/2 - buildingGap;
    for (let i = 0; i < 3; i++) {
        // Randomize building properties for variety
        const width = 8 + Math.random() * 6; // Width between 8 and 14
        const height = 4 + Math.random() * 3; // Height between 4 and 7
        
        // Get random style, but ensure hospital and graveyard are placed with correct dimensions
        let style = buildingStyles[Math.floor(Math.random() * buildingStyles.length)];
        let buildingWidth = width;
        let buildingDepth = facadeDepth;
        
        // Handle special building types
        if (style === 'hospital') {
            buildingWidth = width * 2; // Hospital is twice as wide
            // If this would be the last building, don't place a hospital (not enough space)
            if (i === 2) {
                style = buildingStyles[Math.floor(Math.random() * 4)]; // Pick a different style
                buildingWidth = width; // Reset width
            }
        } else if (style === 'graveyard') {
            buildingDepth = facadeDepth * 3; // Graveyard extends 3x further back
        }
        
        // Calculate position (centered on building width)
        const x = nextBuildingX - buildingWidth/2;
        
        // Create and add the building
        const building = createBuildingFacade(x, 0, buildingWidth, height, buildingDepth, style);
        sceneGroups.exterior.add(building);
        
        // Update next building position
        nextBuildingX = x - buildingWidth/2 - buildingGap;
    }
    
    // Buildings on the right side (positive x)
    nextBuildingX = buildingWidth/2 + buildingGap;
    for (let i = 0; i < 3; i++) {
        // Randomize building properties for variety
        const width = 8 + Math.random() * 6; // Width between 8 and 14
        const height = 4 + Math.random() * 3; // Height between 4 and 7
        
        // Get random style, but ensure hospital and graveyard are placed with correct dimensions
        let style = buildingStyles[Math.floor(Math.random() * buildingStyles.length)];
        let buildingWidth = width;
        let buildingDepth = facadeDepth;
        
        // Handle special building types
        if (style === 'hospital') {
            buildingWidth = width * 2; // Hospital is twice as wide
            // If this would be the last building, don't place a hospital (not enough space)
            if (i === 2) {
                style = buildingStyles[Math.floor(Math.random() * 4)]; // Pick a different style
                buildingWidth = width; // Reset width
            }
        } else if (style === 'graveyard') {
            buildingDepth = facadeDepth * 3; // Graveyard extends 3x further back
        }
        
        // Calculate position (centered on building width)
        const x = nextBuildingX + buildingWidth/2;
        
        // Create and add the building
        const building = createBuildingFacade(x, 0, buildingWidth, height, buildingDepth, style);
        sceneGroups.exterior.add(building);
        
        // Update next building position
        nextBuildingX = x + buildingWidth/2 + buildingGap;
    }
    
    // Add buildings on the opposite side of the street (behind camera starting position)
    // These buildings face the opposite direction (toward the bar)
    const farZ = 26; // Position farther away from where camera starts (camera is at z=25)
    
    // Buildings on the far side, using a consistent approach across the entire street width
    // Define the total street coverage range
    const streetLeftEdge = -40;
    const streetRightEdge = 40;
    const streetWidth = streetRightEdge - streetLeftEdge;
    
    // Create 6-8 buildings spread across the street width with proper spacing
    const numFarBuildings = 6 + Math.floor(Math.random() * 3); // 6 to 8 buildings
    const avgBuildingWidth = streetWidth / numFarBuildings;
    
    // Loop through and create buildings with predictable placement
    for (let i = 0; i < numFarBuildings; i++) {
        // Calculate a reasonable width that won't cause overlap
        const maxWidth = avgBuildingWidth - buildingGap;
        const width = 8 + Math.random() * Math.min(6, maxWidth - 8); // Width between 8 and min(14, maxWidth)
        
        // Calculate the center position for this building
        const x = streetLeftEdge + (i * avgBuildingWidth) + (avgBuildingWidth / 2);
        
        // Randomize other properties
        const height = 4 + Math.random() * 3; // Height between 4 and 7
        const style = buildingStyles[Math.floor(Math.random() * buildingStyles.length)];
        
        // Create and add the building
        const building = createBuildingFacade(x, farZ, width, height, facadeDepth, style);
        
        // Rotate 180 degrees to face the street/bar
        building.rotation.y = Math.PI;
        
        // Add small random offset to avoid perfect alignment
        building.position.z += Math.random() * 2 - 1; // +/- 1 unit random z variation
        
        sceneGroups.exterior.add(building);
    }
    
    // Karaoke Sign above the door
    const signGeometry = new THREE.BoxGeometry(10, 1.2, 0.5, 6, 2, 1); // Larger sign
    const signMaterial = createWireframeMaterial(0xff00ff); // Magenta sign
    const sign = new THREE.Mesh(signGeometry, signMaterial);
    sign.position.set(0, buildingHeight + 0.8, 0.5); // Above the door
    sceneGroups.exterior.add(sign);
    streetElements.sign = sign;
    
    // "KARAOKE" text on the sign
    const textGroup = new THREE.Group();
    textGroup.position.set(-3.5, buildingHeight + 0.8, 0.7); // On the sign
    
    // Create "KARAOKE" letters - improved sizing and spacing
    const letterPositions = [
        { x: 0, y: 0, z: 0 },    // K
        { x: 1.0, y: 0, z: 0 },  // A
        { x: 2.0, y: 0, z: 0 },  // R
        { x: 3.0, y: 0, z: 0 },  // A
        { x: 4.0, y: 0, z: 0 },  // O
        { x: 5.0, y: 0, z: 0 },  // K
        { x: 6.0, y: 0, z: 0 },  // E
    ];
    
    // Create simple wireframe boxes for each letter - larger
    letterPositions.forEach((pos, index) => {
        // Alternate colors for a flashing effect
        const letterColor = index % 2 === 0 ? 0xff0000 : 0x00ffff;
        const letterGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.2, 2, 2, 1);
        const letterMaterial = createWireframeMaterial(letterColor);
        const letter = new THREE.Mesh(letterGeometry, letterMaterial);
        letter.position.set(pos.x, pos.y, pos.z);
        textGroup.add(letter);
    });
    
    sceneGroups.exterior.add(textGroup);
    streetElements.karaokeSigns = textGroup;
    
    // Street Lamps - positioned on both sidewalks
    const createStreetLamp = (x, z) => {
        const lampGroup = new THREE.Group();
        
        // Concrete base
        const baseGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.8, 6, 1);
        const concreteMaterial = createWireframeMaterial(0x999999); // Concrete gray
        const base = new THREE.Mesh(baseGeometry, concreteMaterial);
        base.position.y = 0.4;
        lampGroup.add(base);
        
        // Main vertical pole
        const poleGeometry = new THREE.CylinderGeometry(0.15, 0.2, 7, 6, 1);
        const pole = new THREE.Mesh(poleGeometry, concreteMaterial);
        pole.position.y = 4;
        lampGroup.add(pole);
        
        // Horizontal arm
        const armGeometry = new THREE.CylinderGeometry(0.1, 0.1, 2.4, 6, 1);
        const arm = new THREE.Mesh(armGeometry, concreteMaterial);
        arm.rotation.z = Math.PI / 2; // Rotate to be horizontal
        arm.position.set(0.8, 7.5, 0); // Centered on pole
        lampGroup.add(arm);
        
        // Light fixture housing
        const housingGeometry = new THREE.CylinderGeometry(0.3, 0.4, 0.6, 6, 1);
        const housingMaterial = createWireframeMaterial(0x777777); // Darker gray for housing
        const housing = new THREE.Mesh(housingGeometry, housingMaterial);
        housing.rotation.x = Math.PI / 2; // Rotate to point downward
        housing.position.set(2.0, 7.5, 0); // Position at the end of the horizontal arm
        lampGroup.add(housing);
        
        // Orange sodium vapor light
        const lightGeometry = new THREE.SphereGeometry(0.25, 8, 4);
        const lightMaterial = createWireframeMaterial(0xFF8C00); // Orange sodium vapor color
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.set(2.0, 7.3, 0); // Slightly below the housing
        lampGroup.add(light);
        
        // Add a point light for actual illumination
        const pointLight = new THREE.PointLight(0xFF8C00, 0.8, 10);
        pointLight.position.copy(light.position);
        lampGroup.add(pointLight);
        
        lampGroup.position.set(x, 0, z);
        sceneGroups.exterior.add(lampGroup);
        return lampGroup;
    };
    
    // Add street lamps on both sides - rotate them to face the street
    streetElements.streetLamps = [
        createStreetLamp(-10, 2),  // Near building, left
        createStreetLamp(10, 2),   // Near building, right
        createStreetLamp(-10, 20), // Far side, left
        createStreetLamp(10, 20)   // Far side, right
    ];

    // Create a bench
    const createBench = (x, z) => {
        const benchGroup = new THREE.Group();
        
        // Bench seat
        const seatGeometry = new THREE.BoxGeometry(2, 0.1, 0.6);
        const benchMaterial = createWireframeMaterial(0x885500); // Wood brown
        const seat = new THREE.Mesh(seatGeometry, benchMaterial);
        seat.position.y = 0.5;
        benchGroup.add(seat);
        
        // Bench back
        const backGeometry = new THREE.BoxGeometry(2, 0.8, 0.1);
        const back = new THREE.Mesh(backGeometry, benchMaterial);
        back.position.set(0, 0.9, -0.25);
        benchGroup.add(back);
        
        // Bench legs
        const createLeg = (x) => {
            const legGeometry = new THREE.BoxGeometry(0.1, 0.5, 0.1);
            const leg = new THREE.Mesh(legGeometry, benchMaterial);
            leg.position.set(x, 0.25, 0);
            return leg;
        };
        
        // Add four legs
        benchGroup.add(createLeg(-0.8));
        benchGroup.add(createLeg(0.8));
        benchGroup.add(createLeg(-0.8));
        benchGroup.add(createLeg(0.8));
        
        benchGroup.position.set(x, 0, z);
        sceneGroups.exterior.add(benchGroup);
        return benchGroup;
    };
    
    // Create a trashcan
    const createTrashcan = (x, z) => {
        const trashGroup = new THREE.Group();
        
        // Trashcan body
        const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.25, 0.8, 8);
        const trashMaterial = createWireframeMaterial(0x444444); // Dark gray
        const body = new THREE.Mesh(bodyGeometry, trashMaterial);
        body.position.y = 0.4;
        trashGroup.add(body);
        
        // Trashcan lid
        const lidGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.1, 8);
        const lidMaterial = createWireframeMaterial(0x666666); // Lighter gray
        const lid = new THREE.Mesh(lidGeometry, lidMaterial);
        lid.position.y = 0.85;
        trashGroup.add(lid);
        
        trashGroup.position.set(x, 0, z);
        sceneGroups.exterior.add(trashGroup);
        return trashGroup;
    };
    
    // Add benches and trashcans to both sidewalks
    streetElements.benches = [
        createBench(-8, 2),   // Near sidewalk, left
        createBench(8, 2),    // Near sidewalk, right
        createBench(-8, 20),  // Far sidewalk, left
        createBench(8, 20)    // Far sidewalk, right
    ];
    
    streetElements.trashcans = [
        createTrashcan(-12, 2),   // Near sidewalk, left
        createTrashcan(12, 2),    // Near sidewalk, right
        createTrashcan(-12, 20),  // Far sidewalk, left
        createTrashcan(12, 20)    // Far sidewalk, right
    ];

    // Rotate the benches to face the street
    streetElements.benches[2].rotation.y = -Math.PI; // Left side benches face right
    streetElements.benches[3].rotation.y = -Math.PI;  // Right side benches face left
    // Rotate the lamps to face the street
    streetElements.streetLamps[0].rotation.y = -Math.PI / 2; // Left side lamps face right
    streetElements.streetLamps[1].rotation.y = -Math.PI / 2;  // Right side lamps face left
    streetElements.streetLamps[2].rotation.y = Math.PI / 2; // Left side lamps face right
    streetElements.streetLamps[3].rotation.y = Math.PI / 2;  // Right side lamps face left
    
    // Add cars driving on the street
    streetElements.cars = [
        createCar(-8, 13, getRandomCarColor(), 'left'),   // Car on left lane
        createCar(8, 9, getRandomCarColor(), 'right'),    // Car on right lane
        createCar(-4, 13, getRandomCarColor(), 'left'),   // Car on left lane
        createCar(4, 9, getRandomCarColor(), 'right')     // Car on right lane
    ];
    
    // Store the last time a car was spawned
    streetElements.lastCarSpawnTime = 0;
    
    // Create a wireframe bus
    const createBus = (x, z, color, direction) => {
        const busGroup = new THREE.Group();
        
        // Bus body - larger than a car - updated to MBTA white color
        const bodyGeometry = new THREE.BoxGeometry(6, 2.2, 2.2, 5, 3, 3);
        const bodyMaterial = createWireframeMaterial(0xFFFFFF); // MBTA white body
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 1.1;
        busGroup.add(body);
        
        // Add yellow stripe along the sides
        const stripeGeometry = new THREE.BoxGeometry(6.01, 0.4, 2.22);
        const stripeMaterial = createWireframeMaterial(0xFFD700); // MBTA yellow
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.set(0, 0.4, 0);
        busGroup.add(stripe);
        
        // Windows along the sides
        const windowCount = 5;
        const windowSpacing = 0.8;
        const windowStartX = -2;
        
        for (let i = 0; i < windowCount; i++) {
            const windowGeometry = new THREE.BoxGeometry(0.6, 0.6, 2.22);
            const windowMaterial = createWireframeMaterial(0x88ccff, 0.5); // Light blue, semi-transparent
            const window = new THREE.Mesh(windowGeometry, windowMaterial);
            window.position.set(windowStartX + i * windowSpacing, 1.5, 0);
            busGroup.add(window);
        }
        
        // Front windshield
        const windshieldGeometry = new THREE.BoxGeometry(0.1, 1, 1.8);
        const windshieldMaterial = createWireframeMaterial(0x88ccff, 0.5); // Light blue, semi-transparent
        const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
        windshield.position.set(-2.95, 1.5, 0);
        busGroup.add(windshield);
        
        // Front bumper in MBTA black
        const bumperGeometry = new THREE.BoxGeometry(0.2, 0.4, 2.2);
        const bumperMaterial = createWireframeMaterial(0x000000); // MBTA black
        const bumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        bumper.position.set(-3, 0.4, 0);
        busGroup.add(bumper);
        
        // Back bumper in MBTA black
        const backBumperGeometry = new THREE.BoxGeometry(0.2, 0.4, 2.2);
        const backBumperMaterial = createWireframeMaterial(0x000000); // MBTA black
        const backBumper = new THREE.Mesh(backBumperGeometry, backBumperMaterial);
        backBumper.position.set(3, 0.4, 0);
        busGroup.add(backBumper);
        
        // Wheels (larger than car wheels)
        const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8, 1);
        const wheelMaterial = createWireframeMaterial(0x111111);
        
        // Front wheels
        const frontLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontLeftWheel.rotation.y = Math.PI / 2;
        frontLeftWheel.rotation.z = Math.PI / 2;
        frontLeftWheel.position.set(-2.2, 0.4, 1.1);
        busGroup.add(frontLeftWheel);
        
        const frontRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        frontRightWheel.rotation.y = Math.PI / 2;
        frontRightWheel.rotation.z = Math.PI / 2;
        frontRightWheel.position.set(-2.2, 0.4, -1.1);
        busGroup.add(frontRightWheel);
        
        // Back wheels
        const backLeftWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        backLeftWheel.rotation.y = Math.PI / 2;
        backLeftWheel.rotation.z = Math.PI / 2;
        backLeftWheel.position.set(2.2, 0.4, 1.1);
        busGroup.add(backLeftWheel);
        
        const backRightWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        backRightWheel.rotation.y = Math.PI / 2;
        backRightWheel.rotation.z = Math.PI / 2;
        backRightWheel.position.set(2.2, 0.4, -1.1);
        busGroup.add(backRightWheel);
        
        // Bus route number display - updated to MBTA orange
        const routeDisplayGeometry = new THREE.BoxGeometry(1.8, 0.4, 0.1);
        const routeDisplayMaterial = createWireframeMaterial(0xEFC600); // MBTA orange for route display
        const routeDisplay = new THREE.Mesh(routeDisplayGeometry, routeDisplayMaterial);
        routeDisplay.position.set(2.96, 1.9, 0);
        routeDisplay.rotation.y = Math.PI / 2;
        busGroup.add(routeDisplay);
        
        // MBTA logo on the side of the bus
        const logoGeometry = new THREE.CircleGeometry(0.4, 8);
        const logoMaterial = createWireframeMaterial(0x000080, 0.9); // MBTA navy blue
        const logo = new THREE.Mesh(logoGeometry, logoMaterial);
        logo.position.set(2, 1.5, 1.11);
        logo.rotation.y = Math.PI / 2;
        busGroup.add(logo);
        
        // Position and rotate based on direction
        busGroup.position.set(x, 0, z);
        if (direction === 'left') {
            // Buses going left should point in the -x direction (looking from +z to -z)
            busGroup.rotation.y = 0;
        } else {
            // Buses going right should point in the +x direction (looking from +z to -z)
            busGroup.rotation.y = Math.PI; // 180 degrees to face the opposite direction
        }
        
        busGroup.userData.direction = direction; // Store direction for animation
        busGroup.userData.speed = 0.03; // Buses move slower than cars
        
        sceneGroups.exterior.add(busGroup);
        return busGroup;
    };
    
    // Create a bus stop shelter with MBTA colors
    const createBusStop = (x, z) => {
        const busStopGroup = new THREE.Group();
        
        // Platform/curb
        const platformGeometry = new THREE.BoxGeometry(4, 0.2, 1.5, 4, 1, 2);
        const platformMaterial = createWireframeMaterial(0xaaaaaa);
        const platform = new THREE.Mesh(platformGeometry, platformMaterial);
        platform.position.y = 0.1;
        busStopGroup.add(platform);
        
        // Shelter roof
        const roofGeometry = new THREE.BoxGeometry(3.5, 0.1, 1.2, 4, 1, 2);
        const roofMaterial = createWireframeMaterial(0x4040c0, 0.9); // MBTA navy blue
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.y = 2.4;
        busStopGroup.add(roof);
        
        // Shelter back panel
        const backPanelGeometry = new THREE.BoxGeometry(3.5, 2, 0.1, 4, 3, 1);
        const backPanelMaterial = createWireframeMaterial(0x4040c0, 0.9); // MBTA navy blue
        const backPanel = new THREE.Mesh(backPanelGeometry, backPanelMaterial);
        backPanel.position.set(0, 1.4, -0.55);
        busStopGroup.add(backPanel);
        
        // Shelter side panels
        const leftPanelGeometry = new THREE.BoxGeometry(0.1, 2, 1.2, 1, 3, 2);
        const leftPanelMaterial = createWireframeMaterial(0x4040c0, 0.9); // MBTA navy blue
        const leftPanel = new THREE.Mesh(leftPanelGeometry, leftPanelMaterial);
        leftPanel.position.set(-1.7, 1.4, 0);
        busStopGroup.add(leftPanel);
        
        const rightPanelGeometry = new THREE.BoxGeometry(0.1, 2, 1.2, 1, 3, 2);
        const rightPanelMaterial = createWireframeMaterial(0x4040c0, 0.9); // MBTA navy blue
        const rightPanel = new THREE.Mesh(rightPanelGeometry, rightPanelMaterial);
        rightPanel.position.set(1.7, 1.4, 0);
        busStopGroup.add(rightPanel);
        
        // Bus stop sign
        const signPoleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 4, 1);
        const signPoleMaterial = createWireframeMaterial(0xdddddd, 1.0); // Brighter pole
        const signPole = new THREE.Mesh(signPoleGeometry, signPoleMaterial);
        signPole.position.set(2.3, 1.5, 1.3);
        busStopGroup.add(signPole);
        
        // Create a proper MBTA bus stop sign group
        const signGroup = new THREE.Group();
        signGroup.position.set(2.3, 2.7, 1.3);
        signGroup.scale.set(0.5, 0.5, 0.5); // Make the sign smaller by half
        
        // Yellow top section (header)
        const topSectionGeometry = new THREE.BoxGeometry(0.8, 0.6, 0.1, 2, 2, 1);
        const topSectionMaterial = createWireframeMaterial(0xFFA500, 0.8); // Brighter orange-yellow
        const topSection = new THREE.Mesh(topSectionGeometry, topSectionMaterial);
        topSection.position.set(0, 0.8, 0);
        signGroup.add(topSection);
        
        // Add "T" logo to top section
        const tLogoGeometry = new THREE.CircleGeometry(0.25, 8);
        const tLogoMaterial = createWireframeMaterial(0xFF0000, 0.8); // Brighter red
        const tLogo = new THREE.Mesh(tLogoGeometry, tLogoMaterial);
        tLogo.position.set(0, 0.8, 0.06);
        signGroup.add(tLogo);
        
        // White middle section with route numbers
        const middleSectionGeometry = new THREE.BoxGeometry(0.8, 1.5, 0.1, 2, 2, 1);
        const middleSectionMaterial = createWireframeMaterial(0xFFFFFF, 0.8); // Bright white
        const middleSection = new THREE.Mesh(middleSectionGeometry, middleSectionMaterial);
        middleSection.position.set(0, 0, 0);
        signGroup.add(middleSection);
        
        // Route number 80 (as in the image) - black pill-shaped background
        const routeOneBgGeometry = new THREE.BoxGeometry(0.5, 0.3, 0.12, 2, 2, 1);
        const routeOneBgMaterial = createWireframeMaterial(0x000000, 0.8); // Black
        const routeOneBg = new THREE.Mesh(routeOneBgGeometry, routeOneBgMaterial);
        routeOneBg.position.set(0, 0.4, 0);
        signGroup.add(routeOneBg);
        
        // Route number 89 (as in the image) - black pill-shaped background
        const routeTwoBgGeometry = new THREE.BoxGeometry(0.5, 0.3, 0.12, 2, 2, 1);
        const routeTwoBgMaterial = createWireframeMaterial(0x000000, 0.8); // Black
        const routeTwoBg = new THREE.Mesh(routeTwoBgGeometry, routeTwoBgMaterial);
        routeTwoBg.position.set(0, -0.1, 0);
        signGroup.add(routeTwoBg);
        
        // Bottom red section (NO STOPPING)
        const bottomSectionGeometry = new THREE.BoxGeometry(0.8, 0.7, 0.1, 2, 2, 1);
        const bottomSectionMaterial = createWireframeMaterial(0xBB0000, 0.8); // Brighter red
        const bottomSection = new THREE.Mesh(bottomSectionGeometry, bottomSectionMaterial);
        bottomSection.position.set(0, -0.9, 0);
        signGroup.add(bottomSection);
        
        // Add the complete sign group to the bus stop
        busStopGroup.add(signGroup);
        
        // Bench
        const benchGeometry = new THREE.BoxGeometry(3, 0.1, 0.6, 3, 1, 1);
        const benchMaterial = createWireframeMaterial(0x885500);
        const bench = new THREE.Mesh(benchGeometry, benchMaterial);
        bench.position.set(0, 1, 0);
        busStopGroup.add(bench);
        
        // Bench legs
        const createBenchLeg = (x) => {
            const legGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.6, 1, 1, 1);
            const legMaterial = createWireframeMaterial(0x885500);
            const leg = new THREE.Mesh(legGeometry, legMaterial);
            leg.position.set(x, 0.5, 0);
            return leg;
        };
        
        busStopGroup.add(createBenchLeg(-1.3));
        busStopGroup.add(createBenchLeg(1.3));
        
        // Position the bus stop
        busStopGroup.position.set(x, 0, z);
        busStopGroup.rotation.y = 0; // Face away from the street
        
        sceneGroups.exterior.add(busStopGroup);
        return busStopGroup;
    };
    
    // Add a bus on the right lane (going left) - keep blue color for contrast but make it white
    const bus = createBus(-20, 5, 0xFFFFFF, 'right'); // White MBTA bus
    streetElements.bus = bus;
    
    // Add a bus stop on the far sidewalk
    const busStop = createBusStop(-15, 2); // Now on the near sidewalk (z=2 instead of 20.5)
    // Don't rotate the bus stop now, so it faces away from the street
    busStop.rotation.y = 0; 
    streetElements.busStop = busStop;
    
    return streetElements;
};

// Create the interior bar scene with adjusted positioning
const createInteriorScene = () => {
    const interiorElements = {};
    
    // Building dimensions are larger now: 20x5x15
    
    // Bar counter - rotated to be along the left wall with prominent wireframe
    const barGeometry = new THREE.BoxGeometry(10, 1, 1.5, 2, 1, 1); // Very few segments for thicker wireframe
    const barMaterial = createWireframeMaterial(0xDA8A67); // Brighter brown/orange
    barMaterial.wireframeLinewidth = 2; // Note: This has limited effect in WebGL
    const barCounter = new THREE.Mesh(barGeometry, barMaterial);
    
    // Rotate to align with left wall and position appropriately
    barCounter.rotation.y = Math.PI / 2; // Rotate 90 degrees so length runs along z-axis
    barCounter.position.set(-8, 1, -7.5); // Position along left wall, centered in depth
    barCounter.scale.set(1.02, 1.02, 1.02); // Slightly larger to emphasize
    
    sceneGroups.interior.add(barCounter);
    interiorElements.barCounter = barCounter;
    
    // Bar stools - repositioned to be in front of the rotated bar
    const createBarStool = (z) => {
        const stoolGroup = new THREE.Group();
        
        // Stool seat with enhanced visibility
        const seatGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 8, 1);
        const seatMaterial = createGlowingWireframeMaterial(0x88CCFF, 1.0, 0.3); // Light blue glow
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.y = 1;
        stoolGroup.add(seat);
        
        // Stool leg
        const legGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 4, 1);
        const legMaterial = createWireframeMaterial(0x555555);
        const leg = new THREE.Mesh(legGeometry, legMaterial);
        leg.position.y = 0.5;
        stoolGroup.add(leg);
        
        // Position stool in front of bar along z-axis
        stoolGroup.position.set(-6.6, 0, z);
        sceneGroups.interior.add(stoolGroup);
        return stoolGroup;
    };
    
    // Add bar stools along the bar
    interiorElements.barStools = [
        createBarStool(-4),
        createBarStool(-6),
        createBarStool(-8),
        createBarStool(-10),
        createBarStool(-12)
    ];
    
    // Create a diner booth (seat + backrest + table)
    const createDinerBooth = (x, z) => {
        const boothGroup = new THREE.Group();
        
        // Booth seat
        const seatGeometry = new THREE.BoxGeometry(2.2, 0.6, 0.8, 3, 2, 2);
        const seatMaterial = createGlowingWireframeMaterial(0xFF6666, 1.0, 0.4); // Brighter red with glow
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.set(0, 0.3, 0);
        boothGroup.add(seat);
        
        // Booth backrest
        const backrestGeometry = new THREE.BoxGeometry(2.2, 0.8, 0.2, 3, 2, 1);
        const backrestMaterial = createGlowingWireframeMaterial(0xFF6666, 1.0, 0.4); // Matching red
        const backrest = new THREE.Mesh(backrestGeometry, backrestMaterial);
        backrest.position.set(0, 0.9, -0.4);
        boothGroup.add(backrest);
        
        // Booth table
        const tableGeometry = new THREE.BoxGeometry(2, 0.1, 0.8, 3, 1, 2);
        const tableMaterial = createGlowingWireframeMaterial(0xFFAA44, 1.0, 0.3); // Warm orange
        const table = new THREE.Mesh(tableGeometry, tableMaterial);
        table.position.set(0, 0.65, 0.8); // Positioned in front of the seat
        boothGroup.add(table);
        
        // Table legs
        const legGeometry = new THREE.BoxGeometry(0.08, 0.8, 0.08, 1, 1, 1);
        const legMaterial = createWireframeMaterial(0x8B4513);
        
        // Add four legs to the table
        const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontLeftLeg.position.set(0.85, 0.3, 1.1);
        boothGroup.add(frontLeftLeg);
        
        const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        frontRightLeg.position.set(-0.85, 0.3, 1.1);
        boothGroup.add(frontRightLeg);
        
        const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
        backLeftLeg.position.set(0.85, 0.3, 0.5);
        boothGroup.add(backLeftLeg);
        
        const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
        backRightLeg.position.set(-0.85, 0.3, 0.5);
        boothGroup.add(backRightLeg);
        
        // Optional details - condiment tray
        const condimentTrayGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.3, 1, 1, 1);
        const condimentTrayMaterial = createWireframeMaterial(0x666666);
        const condimentTray = new THREE.Mesh(condimentTrayGeometry, condimentTrayMaterial);
        condimentTray.position.set(0.7, 0.8, 0.8);
        boothGroup.add(condimentTray);
        
        // Salt and pepper shakers
        const shakerGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6, 1);
        const saltMaterial = createWireframeMaterial(0xFFFFFF);
        const pepperMaterial = createWireframeMaterial(0x222222);
        
        const saltShaker = new THREE.Mesh(shakerGeometry, saltMaterial);
        saltShaker.position.set(0.65, 0.87, 0.75);
        boothGroup.add(saltShaker);
        
        const pepperShaker = new THREE.Mesh(shakerGeometry, pepperMaterial);
        pepperShaker.position.set(0.75, 0.87, 0.85);
        boothGroup.add(pepperShaker);
        
        // Position the entire booth
        boothGroup.position.set(x, 0, z);
        sceneGroups.interior.add(boothGroup);
        return boothGroup;
    };
    
    // Create the opposite bench with backrest on the other side
    const createOppositeBench = (x, z) => {
        const boothGroup = new THREE.Group();
        
        // Booth seat
        const seatGeometry = new THREE.BoxGeometry(2.2, 0.6, 0.8, 3, 2, 2);
        const seatMaterial = createGlowingWireframeMaterial(0xFF6666, 1.0, 0.4); // Brighter red with glow
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.set(0, 0.3, -0.7);
        boothGroup.add(seat);
        
        // Booth backrest on the opposite side
        const backrestGeometry = new THREE.BoxGeometry(2.2, 0.8, 0.2, 3, 2, 1);
        const backrestMaterial = createGlowingWireframeMaterial(0xFF6666, 1.0, 0.4); // Matching red
        const backrest = new THREE.Mesh(backrestGeometry, backrestMaterial);
        // This is the key change - backrest is on the opposite side
        backrest.position.set(0, 0.9, -1.0); // Backrest faces the opposite direction
        boothGroup.add(backrest);
        
        // Position the entire booth
        boothGroup.position.set(x, 0, z);
        sceneGroups.interior.add(boothGroup);
        return boothGroup;
    };
    
    // Create a row of booth pairs along the right wall
    interiorElements.dinerBooths = [];
    
    // Spacing for the booths
    const boothSpacing = 2.9;
    const rightWallX = 9.2; // Position along right wall, moved closer to wall
    const startZ = -2; // Start near the front of the bar
    
    // Create 5 booth pairs along the wall
    for (let i = 0; i < 5; i++) {
        const z = startZ - (i * boothSpacing);
        
        // First booth - right side against wall
        const firstBooth = createDinerBooth(rightWallX - 0.8, z - 0.5);
        firstBooth.rotation.y = 0; // No rotation - right side against wall
        
        // Second booth - back-to-back with first booth
        const secondBooth = createOppositeBench(rightWallX - 0.8, z + 0.5);
        secondBooth.rotation.y = Math.PI; // 180 degrees - back to back with first booth
        
        // Track these booths
        interiorElements.dinerBooths.push(firstBooth, secondBooth);
    }
    
    // Tables and chairs - keep the creation functions
    const createTable = (x, z) => {
        const tableGroup = new THREE.Group();
        
        // Table top with enhanced visibility
        const tableGeometry = new THREE.BoxGeometry(1.5, 0.1, 1.5, 2, 1, 2);
        const tableMaterial = createGlowingWireframeMaterial(0xFFAA44, 1.0, 0.3); // Warm orange glow
        const tableTop = new THREE.Mesh(tableGeometry, tableMaterial);
        tableTop.position.y = 0.75;
        tableGroup.add(tableTop);
        
        // Table legs
        const legGeometry = new THREE.BoxGeometry(0.1, 0.75, 0.1, 1, 1, 1);
        const legMaterial = createWireframeMaterial(0x8B4513);
        
        // Create four legs
        const leg1 = new THREE.Mesh(legGeometry, legMaterial);
        leg1.position.set(0.6, 0.375, 0.6);
        tableGroup.add(leg1);
        
        const leg2 = new THREE.Mesh(legGeometry, legMaterial);
        leg2.position.set(0.6, 0.375, -0.6);
        tableGroup.add(leg2);
        
        const leg3 = new THREE.Mesh(legGeometry, legMaterial);
        leg3.position.set(-0.6, 0.375, 0.6);
        tableGroup.add(leg3);
        
        const leg4 = new THREE.Mesh(legGeometry, legMaterial);
        leg4.position.set(-0.6, 0.375, -0.6);
        tableGroup.add(leg4);
        
        tableGroup.position.set(x, 0, z);
        sceneGroups.interior.add(tableGroup);
        return tableGroup;
    };
    
    const createChair = (x, z, rotation) => {
        const chairGroup = new THREE.Group();
        
        // Chair seat with enhanced visibility
        const seatGeometry = new THREE.BoxGeometry(0.6, 0.1, 0.6, 2, 1, 2);
        const seatMaterial = createGlowingWireframeMaterial(0xAA88FF, 1.0, 0.3); // Lavender glow
        const seat = new THREE.Mesh(seatGeometry, seatMaterial);
        seat.position.y = 0.5;
        chairGroup.add(seat);
        
        // Chair back
        const backGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.1, 2, 2, 1);
        const backMaterial = createGlowingWireframeMaterial(0xAA88FF, 1.0, 0.3); // Matching lavender
        const back = new THREE.Mesh(backGeometry, backMaterial);
        back.position.set(0, 0.8, -0.25);
        chairGroup.add(back);
        
        // Chair legs
        const legGeometry = new THREE.BoxGeometry(0.05, 0.5, 0.05, 1, 1, 1);
        const legMaterial = createWireframeMaterial(0x666666);
        
        // Create four legs
        const leg1 = new THREE.Mesh(legGeometry, legMaterial);
        leg1.position.set(0.25, 0.25, 0.25);
        chairGroup.add(leg1);
        
        const leg2 = new THREE.Mesh(legGeometry, legMaterial);
        leg2.position.set(0.25, 0.25, -0.25);
        chairGroup.add(leg2);
        
        const leg3 = new THREE.Mesh(legGeometry, legMaterial);
        leg3.position.set(-0.25, 0.25, 0.25);
        chairGroup.add(leg3);
        
        const leg4 = new THREE.Mesh(legGeometry, legMaterial);
        leg4.position.set(-0.25, 0.25, -0.25);
        chairGroup.add(leg4);
        
        chairGroup.position.set(x, 0, z);
        chairGroup.rotation.y = rotation;
        sceneGroups.interior.add(chairGroup);
        return chairGroup;
    };
    
    // Add table with chairs in better positions
    const centerTable = createTable(3, -5); // Moved inside
    interiorElements.tables = [centerTable];
    
    // Add chairs around center table - repositioned
    interiorElements.chairs = [
        createChair(3, -6, 0),
        createChair(3, -4, Math.PI),
        createChair(4, -5, -Math.PI / 2),
        createChair(2, -5, Math.PI / 2)
    ];
    
    // Add another table
    const sideTable = createTable(-3, -3);
    interiorElements.tables.push(sideTable);
    
    // Add chairs around side table
    interiorElements.chairs.push(
        createChair(-3, -4, 0),
        createChair(-3, -2, Math.PI),
        createChair(-2, -3, -Math.PI / 2),
        createChair(-4, -3, Math.PI / 2)
    );
    
    // Karaoke Stage - repositioned with prominent wireframe
    const stageGeometry = new THREE.BoxGeometry(8, 0.3, 4, 2, 1, 2); // Very few segments for thicker wireframe
    const stageMaterial = createWireframeMaterial(0xBF8F00); // Bright yellow 
    stageMaterial.wireframeLinewidth = 2; // Limited browser support
    const stage = new THREE.Mesh(stageGeometry, stageMaterial);
    
    stage.position.set(0, 0.15, -12.5); // Back of the room
    stage.scale.set(1.02, 1.02, 1.02); // Slightly larger to emphasize
    sceneGroups.interior.add(stage);
    interiorElements.stage = stage;
    
    // Microphone stand on stage
    const micStandGroup = new THREE.Group();
    
    // Mic stand pole
    const poleGeometry = new THREE.CylinderGeometry(0.03, 0.05, 1.5, 4, 1);
    const poleMaterial = createWireframeMaterial(0xCCCCCC);
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 0.75;
    micStandGroup.add(pole);
    
    // Microphone
    const micGeometry = new THREE.SphereGeometry(0.1, 4, 4);
    const micMaterial = createWireframeMaterial(0x999999);
    const mic = new THREE.Mesh(micGeometry, micMaterial);
    mic.position.y = 1.6;
    micStandGroup.add(mic);
    
    // Position microphone at the front of the stage
    micStandGroup.position.set(0, 0.3, -11.25);
    sceneGroups.interior.add(micStandGroup);
    interiorElements.micStand = micStandGroup;
    
    // Spinning fairies decoration (from lyrics: "fairies spinning above")
    const fairiesGroup = new THREE.Group();
    // Position fairies above the microphone stand
    fairiesGroup.position.set(0, 3, -11.25);
    
    // Create several fairy wireframes
    const createFairy = (x, y, z) => {
        const fairyGroup = new THREE.Group();
        
        // Fairy body
        const bodyGeometry = new THREE.SphereGeometry(0.08, 4, 4);
        const bodyMaterial = createWireframeMaterial(0xFF9999); // Light pink
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        fairyGroup.add(body);
        
        // Fairy wings
        const wingGeometry = new THREE.BoxGeometry(0.2, 0.01, 0.1, 2, 1, 1);
        const wingMaterial = createWireframeMaterial(0x99FFFF); // Light cyan
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        fairyGroup.add(wings);
        
        fairyGroup.position.set(x, y, z);
        return fairyGroup;
    };
    
    // Create multiple fairies in a circular pattern
    const fairyCount = 8;
    interiorElements.fairies = [];
    
    for (let i = 0; i < fairyCount; i++) {
        const angle = (i / fairyCount) * Math.PI * 2;
        const radius = 1;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const fairy = createFairy(x, 0, z);
        fairiesGroup.add(fairy);
        interiorElements.fairies.push(fairy);
    }
    
    sceneGroups.interior.add(fairiesGroup);
    interiorElements.fairiesGroup = fairiesGroup;
    
    // Reposition signup sheet on the rotated bar
    const createSignupSheet = () => {
        const sheetGroup = new THREE.Group();
        
        // Paper
        const paperGeometry = new THREE.BoxGeometry(0.3, 0.01, 0.4, 2, 1, 2);
        const paperMaterial = createWireframeMaterial(0xFFFFFF); // White paper
        const paper = new THREE.Mesh(paperGeometry, paperMaterial);
        sheetGroup.add(paper);
        
        // Dotted lines (simplified as thin boxes)
        const lineCount = 4;
        for (let i = 0; i < lineCount; i++) {
            const lineGeometry = new THREE.BoxGeometry(0.25, 0.005, 0.01, 4, 1, 1);
            const lineMaterial = createWireframeMaterial(0x000000); // Black lines
            const line = new THREE.Mesh(lineGeometry, lineMaterial);
            line.position.z = -0.15 + i * 0.1;
            sheetGroup.add(line);
        }
        
        // Pen
        const penGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.15, 1, 1, 2);
        const penMaterial = createWireframeMaterial(0x0000FF); // Blue pen
        const pen = new THREE.Mesh(penGeometry, penMaterial);
        pen.position.set(0.15, 0.01, -0.1);
        pen.rotation.y = Math.PI / 4;
        sheetGroup.add(pen);
        
        return sheetGroup;
    };
    
    // Add signup sheet to bar counter
    const signupSheet = createSignupSheet();
    signupSheet.position.set(-7.5, 1.52, -9.5); // Near the front end of the bar, on top of the bar (y=1.51)
    sceneGroups.interior.add(signupSheet);
    interiorElements.signupSheet = signupSheet;
    
    // Narragansett Tallboy Beer Cans (from lyrics: "I'll order us a Gansett pair")
    const createBeerCan = (x, z, customY = null) => {
        const canGroup = new THREE.Group();
        
        // Can body
        const canGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6, 1);
        const canMaterial = createWireframeMaterial(0xCCCCCC); // Silver can
        const can = new THREE.Mesh(canGeometry, canMaterial);
        canGroup.add(can);
        
        // Beer can label (simplified as a band)
        const labelGeometry = new THREE.CylinderGeometry(0.101, 0.101, 0.2, 6, 1);
        const labelMaterial = createWireframeMaterial(0xFF0000); // Red label
        const label = new THREE.Mesh(labelGeometry, labelMaterial);
        canGroup.add(label);
        
        // Position the can group - using custom Y if provided, otherwise default to table height
        canGroup.position.set(x, customY !== null ? customY : 1.0, z);
        sceneGroups.interior.add(canGroup);
        return canGroup;
    };
    
    // Add a pair of beers on the center table ("a Gansett pair")
    interiorElements.beerCans = [
        createBeerCan(3.2, -5.2),  // Default y=1.0 for table height
        createBeerCan(2.8, -4.8)   // Default y=1.0 for table height
    ];
    
    // Add beers to the back booth table on the right wall
    interiorElements.boothBeers = [
        createBeerCan(8.6, -13.3, 1),  // On the back booth table
        createBeerCan(8.3, -13.1, 1)   // Slightly offset for natural placement
    ];
    
    // Add beers along the bar counter with y=1.5 (top of bar)
    interiorElements.barBeers = [
        createBeerCan(-8.3, -6, 1.75),  // On top of bar counter (y=1.5)
        createBeerCan(-8.2, -8, 1.75),  // On top of bar counter (y=1.5)
        createBeerCan(-7.9, -12, 1.75)   // On top of bar counter (y=1.5)
    ];
    
    // Add TV/Screen on the wall for karaoke lyrics - moved to back wall
    const screenGeometry = new THREE.BoxGeometry(3, 1.5, 0.3, 4, 3, 1);
    const screenMaterial = createWireframeMaterial(0x00FFFF); // Cyan for screen
    const tvScreen = new THREE.Mesh(screenGeometry, screenMaterial);
    tvScreen.position.set(0, 2.5, -14.9); // Moved to back wall
    tvScreen.rotation.y = Math.PI; // Rotate to face into the room
    sceneGroups.interior.add(tvScreen);
    interiorElements.tvScreen = tvScreen;
    
    // Add speakers beside the stage
    const createSpeaker = (x) => {
        const speakerGeometry = new THREE.BoxGeometry(0.8, 1.5, 0.8, 3, 4, 3);
        const speakerMaterial = createGlowingWireframeMaterial(0x947551, 1.0, 0.45); // Tweed/tan color
        const speaker = new THREE.Mesh(speakerGeometry, speakerMaterial);
        speaker.position.set(x, 1, -11.5); // Positioned at the sides of the stage
        sceneGroups.interior.add(speaker);
        return speaker;
    };
    
    interiorElements.speakers = [
        createSpeaker(-3.25), // Left speaker
        createSpeaker(3.25)   // Right speaker
    ];
    
    return interiorElements;
};

// Create all scenes
const streetElements = createStreetScene();
const interiorElements = createInteriorScene();

// Check for and remove any unwanted wireframe elements in the doorway area
const cleanupUnwantedElements = () => {
    console.log("Cleaning up unwanted elements in the front wall area...");
    
    // Get the building dimensions from the street elements
    // We need to reference these in a scope outside createStreetScene
    const buildingWidth = 20; // Same as defined in createStreetScene
    const doorWidth = 1.8;    // Same as in createStreetScene
    const doorHeight = 3.2;   // Same as in createStreetScene
    
    // Function to determine if a plane might be a misplaced floor or ceiling
    // Function to determine if a plane might be a misplaced floor or ceiling
    const isMisplacedFloorOrCeiling = (obj) => {
        // Check if it's a plane geometry rotated like a floor/ceiling
        if (obj.geometry.type === 'PlaneGeometry') {
            // If it's rotated like a floor/ceiling (around X axis)
            const isFloorRotation = Math.abs(obj.rotation.x - Math.PI/2) < 0.1 || 
                                  Math.abs(obj.rotation.x + Math.PI/2) < 0.1;
            
            // If it's marked as a valid floor/ceiling, it's not misplaced
            if (obj.userData.isFloor || obj.userData.isCeiling) {
                return false;
            }
            
            // Otherwise, check its position
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            
            // If it's near the front wall and rotated like a floor/ceiling, it's likely misplaced
            return isFloorRotation && Math.abs(pos.z) < 1.0;
        }
        return false;
    };
    
    // Remove any wireframe planes that might be overlapping with the front wall
    scene.traverse((object) => {
        // Check for meshes
        if (object.isMesh && object.geometry) {
            // Check if it might be a misplaced floor or ceiling
            if (isMisplacedFloorOrCeiling(object)) {
                console.log("Found misplaced floor/ceiling-like object:", object);
                object.visible = false;
            }
            
            // Get position in world space
            const pos = new THREE.Vector3();
            object.getWorldPosition(pos);
            
            // If this mesh is near the front wall (z near 0)
            if (Math.abs(pos.z) < 0.5) {
                // Check for any plane that goes across the entire front and isn't part of our walls
                if (object.geometry.type === 'PlaneGeometry' && 
                    Math.abs(pos.x) < buildingWidth/2 &&
                    Math.abs(object.rotation.x) < 0.1) {
                    console.log("Found unwanted plane at position:", pos.x, pos.y, pos.z);
                    object.visible = false;
                }
            }
        }
    });
    
    // Create an additional clearing object to ensure nothing appears in the doorway
    const doorwayClearingSurface = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth + 1.0, doorHeight + 1.0, 10),
        new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
            colorWrite: false,
            depthTest: false
        })
    );
    doorwayClearingSurface.position.set(0, doorHeight/2, 0);
    scene.add(doorwayClearingSurface);
};

// Call the cleanup function
cleanupUnwantedElements();

// Initialize scene visibility - MODIFIED to support the new approach
const resetSceneVisibility = () => {
    // Keep both scenes visible at all times
    sceneGroups.exterior.visible = true;
    sceneGroups.interior.visible = true;
    
    // Verify scene contents
    console.log(`Exterior scene contains ${sceneGroups.exterior.children.length} children`);
    console.log(`Interior scene contains ${sceneGroups.interior.children.length} children`);
    console.log("Scene visibility reset - all elements remain visible");
};

// Call this after creating scenes
resetSceneVisibility();

// Animation functions for interior scene elements
const animateInteriorElements = () => {
    // Update orbit time
    fairyOrbitTime += 0.0015; // Greatly reduced from 0.003
    
    // Update orbit center to match mic stand if it exists
    if (interiorElements.micStand) {
        fairyOrbitCenter.copy(interiorElements.micStand.position);
        fairyOrbitCenter.y += 4; // Position above the mic stand
    }
    
    // Get audio levels for reactivity (will return 0 if audio not ready)
    const bassLevel = getAverageFrequency(1, 4);    // Bass frequencies
    const midLevel = getAverageFrequency(5, 20);    // Mid frequencies
    const highLevel = getAverageFrequency(50, 100); // High frequencies
    
    // Animate fairies
    if (interiorElements.fairies) {
        // Calculate overall group rotation based on audio - MUCH slower
        const groupRotationSpeed = 0.001 * (1 + bassLevel * 0.3 + midLevel * 0.2); // Slowed down from 0.005
        
        // Rotate the fairy group as a whole
        if (interiorElements.fairiesGroup) {
            interiorElements.fairiesGroup.rotation.y += groupRotationSpeed;
        }
        
        // Animate individual fairies
        interiorElements.fairies.forEach((fairy, index) => {
            // Each fairy has its own orbit radius and speed
            const orbitRadius = 1.5 + index * 0.2; // Increase radius for each fairy
            const orbitSpeed = 0.08 + index * 0.01; // Greatly reduced from 0.2
            const orbitPhase = index * Math.PI * 0.4; // Different starting positions
            
            // Calculate orbit position - gentler movement
            fairy.position.x = Math.sin(fairyOrbitTime * orbitSpeed + orbitPhase) * orbitRadius;
            fairy.position.z = Math.cos(fairyOrbitTime * orbitSpeed + orbitPhase) * orbitRadius;
            
            // Much gentler bobbing up and down
            fairy.position.y = Math.sin(fairyOrbitTime * 0.2 + index) * 0.2; // Reduced speed and amplitude
            
            // Very slow individual rotation (keeps wireframe appearance)
            const rotationSpeed = 0.003 * (1 + bassLevel * 0.3 + midLevel * 0.2); // Significantly slowed down from 0.01
            fairy.rotation.y += rotationSpeed * (0.7 + Math.random() * 0.3); // Less randomization
            fairy.rotation.x += rotationSpeed * 0.2 * (Math.random() - 0.5); // Reduced impact of randomization
            fairy.rotation.z += rotationSpeed * 0.2 * (Math.random() - 0.5); // Reduced impact of randomization
        });
    }
    
    // Animate other interior elements based on audio levels
    if (interiorElements.tables) {
        interiorElements.tables.forEach(table => {
            const scale = 1 + bassLevel * 0.1;
            table.scale.set(scale, scale, scale);
        });
    }
    
    if (interiorElements.chairs) {
        interiorElements.chairs.forEach(chair => {
            const scale = 1 + midLevel * 0.1;
            chair.scale.set(scale, scale, scale);
        });
    }

    // Make karaoke TV screen pulse if it exists
    if (interiorElements.tvScreen) {
        const brightness = 0.7 + midLevel * 0.3;
        interiorElements.tvScreen.material.color.setRGB(0, brightness, brightness);
    }
};

// Neon light glow animation and shared animation variables
let time = 0;

// Get average frequency in a range of the analyzer data
const getAverageFrequency = (start, end) => {
    // Return 0 if audio analyzer is not ready
    if (typeof audioAnalyser === 'undefined' || !audioData) return 0;
    
    let sum = 0;
    const length = Math.min(end, audioData.length) - start;
    
    if (length <= 0) return 0;
    
    for (let i = start; i < Math.min(end, audioData.length); i++) {
        sum += audioData[i];
    }
    
    return sum / length / 255; // Normalize to 0-1 range
};

const animateNeonSigns = () => {
    time += 0.05;
    
    // Animate the KARAOKE sign letters with alternating colors
    if (streetElements.karaokeSigns) {
        streetElements.karaokeSigns.children.forEach((letter, index) => {
            // Create flashing effect with sine wave
            const blinkSpeed = 0.5 + index * 0.1;
            const brightness = Math.sin(time * blinkSpeed) * 0.5 + 0.5;
            
            // Alternate colors
            const baseColor = index % 2 === 0 ? 0xff0000 : 0x00ffff;
            
            // Update the letter color
            const r = (baseColor >> 16) & 255;
            const g = (baseColor >> 8) & 255;
            const b = baseColor & 255;
            
            letter.material.color.setRGB(
                r / 255 * brightness,
                g / 255 * brightness,
                b / 255 * brightness
            );
        });
    }
    
    // Animate street lamp lights
    if (streetElements.streetLamps) {
        streetElements.streetLamps.forEach((lamp, index) => {
            // Get both the light mesh and point light
            const lightMesh = lamp.children[4]; // The orange light sphere
            const pointLight = lamp.children[5]; // The point light
            
            // Create a subtle flicker effect typical of sodium vapor lamps
            const baseIntensity = 0.8;
            const flickerSpeed = 0.1;
            const flickerAmount = 0.15;
            const flicker = baseIntensity + (Math.sin(time * flickerSpeed + index * 2.1) * flickerAmount) +
                           (Math.sin(time * flickerSpeed * 2.7 + index * 1.3) * flickerAmount * 0.5);
            
            // Update both the mesh color and point light intensity
            const color = new THREE.Color(0xFF8C00);
            color.multiplyScalar(flicker);
            lightMesh.material.color.copy(color);
            pointLight.intensity = flicker;
        });
    }
    
    // Animate the bar building exterior walls with slow color changes
    if (streetElements.walls) {
        // Use a very slow cycle for color changes
        const slowTime = time * 0.05; 
        
        // Create a cycling color effect with RGB components
        const r = 0.25 + 0.25 * Math.sin(slowTime);
        const g = 0.25 + 0.25 * Math.sin(slowTime + Math.PI/2);
        const b = 0.6 + 0.3 * Math.sin(slowTime + Math.PI);
        
        // Apply to all wall segments
        streetElements.walls.forEach(wallSegment => {
            // Skip null or undefined wall segments
            if (!wallSegment) return;
            
            wallSegment.traverse(child => {
                // Check if it's a valid mesh with a material and color
                if (child.isMesh && child.material) {
                    // Only proceed if material has a color property
                    if (child.material.wireframe && child.material.color) {
                        // Store original color on first pass if not already stored
                        if (!child.userData.originalColor && child.material.color.clone) {
                            child.userData.originalColor = child.material.color.clone();
                        }
                        
                        // Update the color
                        child.material.color.setRGB(r, g, b);
                    }
                }
            });
        });
        
        // Also update the glow segments with a complementary color
        if (streetElements.glowGroup) {
            // Slightly different color for the glow to complement the walls
            const glowR = b;
            const glowG = r;
            const glowB = g;
            
            streetElements.glowGroup.traverse(child => {
                // Only proceed if it's a valid mesh with wireframe material
                if (child.isMesh && child.material && child.material.wireframe && child.material.color) {
                    child.material.color.setRGB(glowR, glowG, glowB);
                    
                    // Only modify opacity if the material supports transparency
                    if (child.material.transparent) {
                        // Vary the opacity slightly as well for a pulsing effect
                        const opacity = 0.4 + 0.2 * Math.sin(slowTime * 1.5);
                        child.material.opacity = opacity;
                    }
                }
            });
        }
    }
    
    // Animate cars
    if (streetElements.cars) {
        // Track positions for collision detection
        const carPositions = {};
        
        // Move existing cars
        for (let i = streetElements.cars.length - 1; i >= 0; i--) {
            const car = streetElements.cars[i];
            const direction = car.userData.direction;
            
            // Set a consistent speed for all cars in the same direction
            const speed = direction === 'left' ? 0.05 : -0.05;
            
            // Store previous position for collision detection
            const prevX = car.position.x;
            
            // Calculate new position
            const newX = prevX + speed;
            
            // Remove cars that go off-screen
            if ((direction === 'left' && newX > 40) || 
                (direction === 'right' && newX < -40)) {
                sceneGroups.exterior.remove(car);
                streetElements.cars.splice(i, 1);
                continue;
            }
            
            // Check for collisions with other cars before moving
            let canMove = true;
            const carWidth = 2; // Car width
            const minSafeDistance = 3; // Minimum safe distance between cars
            
            Object.keys(carPositions).forEach(otherCarIndex => {
                if (parseInt(otherCarIndex) !== i) {
                    const otherCarInfo = carPositions[otherCarIndex];
                    const otherX = otherCarInfo.x;
                    const otherZ = otherCarInfo.z;
                    const otherDirection = otherCarInfo.direction;
                    
                    // Only check for collisions in the same lane
                    if (Math.abs(car.position.z - otherZ) < 1) {
                        // Check if cars are too close (based on direction)
                        if (direction === otherDirection) {
                            // Cars moving in same direction
                            const distance = Math.abs(newX - otherX);
                            if (distance < minSafeDistance) {
                                canMove = false;
                            }
                        }
                    }
                }
            });
            
            // Move car if no collision
            if (canMove) {
                car.position.x = newX;
            }
            
            // Store this car's position for collision checking with other cars
            carPositions[i] = {
                x: car.position.x,
                z: car.position.z,
                direction: direction
            };
        }
        
        // More controlled car spawning
        const currentTime = time;
        const timeSinceLastSpawn = currentTime - (streetElements.lastCarSpawnTime || 0);
        
        // Fixed time intervals for car spawning (6-12 seconds)
        const spawnInterval = 6 + Math.sin(time * 0.1) * 3; // Varies between 3-9 seconds
        
        // Only spawn new cars if we're below the limit and enough time has passed
        if (timeSinceLastSpawn > spawnInterval && streetElements.cars.length < 6) {
            // Alternate between left and right lanes for more balance
            const spawnLeft = !streetElements.lastSpawnedLeft;
            streetElements.lastSpawnedLeft = spawnLeft;
            
            // Check if there's already a car near the spawn point
            let canSpawn = true;
            const spawnX = spawnLeft ? -40 : 40;
            const spawnZ = spawnLeft ? 13 : 9;
            
            Object.values(carPositions).forEach(carInfo => {
                const distance = Math.abs(carInfo.x - spawnX);
                if (Math.abs(carInfo.z - spawnZ) < 1 && distance < 10) {
                    canSpawn = false; // Don't spawn if another car is near the spawn point
                }
            });
            
            if (canSpawn) {
                // Spawn new car
                const direction = spawnLeft ? 'left' : 'right';
                const newCar = createCar(spawnX, spawnZ, getRandomCarColor(), direction);
                streetElements.cars.push(newCar);
                
                // Update the last spawn time
                streetElements.lastCarSpawnTime = currentTime;
            }
        }
    }
    
    // Animate bus
    if (streetElements.bus) {
        const bus = streetElements.bus;
        // Move bus based on direction and custom speed
        const speed = bus.userData.speed || 0.03;
        if (bus.userData.direction === 'left') {
            bus.position.x += speed;
            if (bus.position.x > 40) bus.position.x = -40; // Loop when off-screen
        } else { // 'right'
            bus.position.x -= speed;
            if (bus.position.x < -40) bus.position.x = 40; // Loop when off-screen
            
            // Make the bus stop briefly at the bus stop
            const busStopX = -15; // Same X position as the bus stop
            if (Math.abs(bus.position.x - busStopX) < 1) {
                // Slow down near bus stop (on the near side now)
                bus.userData.speed = 0.005;
                
                // Make the bus pull slightly closer to the sidewalk when stopping
                if (bus.position.z > 8.5) {
                    bus.position.z = 8.5;
                }
            } else {
                // Normal speed elsewhere
                bus.userData.speed = 0.03;
                
                // Return to normal lane position when not at the stop
                if (Math.abs(bus.position.x - busStopX) > 5 && bus.position.z < 9) {
                    bus.position.z = 6; // Return to normal lane position
                }
            }
        }
    }
    
    // Animate interior elements if we're in the interior scene or transitioning to it
    if (currentScene === 'interior' || nextScene === 'interior') {
        animateInteriorElements();
    }
    // Don't force transition - let audio system handle it
};

// Event listener for scene transitions with spacebar
document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !isTransitioning) {
        const nextSceneName = currentScene === 'exterior' ? 'interior' : 'exterior';
        console.log(`Spacebar pressed: Transitioning to ${nextSceneName}`);
        transitionToScene(nextSceneName);
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Update the pixelated render target
    const newRenderTargetWidth = Math.floor(window.innerWidth * pixelRatio);
    const newRenderTargetHeight = Math.floor(window.innerHeight * pixelRatio);
    renderTarget.setSize(newRenderTargetWidth, newRenderTargetHeight);
});

// Animation loop with time tracking for transitions
let lastTime = 0;
const animate = (currentTime) => {
    requestAnimationFrame(animate);
    
    // Calculate delta time for smooth transitions
    const deltaTime = (currentTime - lastTime) / 1000; // convert to seconds
    lastTime = currentTime;
    
    // Update time variable for animations
    time += 0.05;
    
    // Update current scene information for audio system
    scene.userData.currentScene = currentScene;
    
    // Update camera position with WASD controls
    updateCameraPosition();
    
    // Store camera reference for other systems to use
    scene.userData.camera = camera;
    
    // Expose scene transition function to audio system
    scene.userData.transitionToScene = transitionToScene;
    
    // Update all animations
    animateNeonSigns();
    animateInteriorElements();
    updateNightSky(scene, time); // Update night sky
    updateSkybox(scene, time); // Update skybox
    updateSceneTransition(deltaTime);
    
    // Update audio-reactive elements
    updateAudioReactiveElements(scene, interiorElements, streetElements, time);
    
    controls.update();
    
    // Render to low-res target first
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    
    // Then render to screen from the low-res texture
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
};

animate(0); 

// Initialize audio functionality
setupAudio(camera);
createAudioReactiveElements(scene);

// Create the starry night sky with moon
createNightSky(scene);

// Create skybox gradient
const skybox = createSkybox(scene);

// Make the interior and street elements accessible to the test buttons
if (typeof setSceneReference === 'function') {
    // Update the scene reference with the latest data
    setSceneReference(scene);
    // Share the elements with the scene
    if (!scene.userData) scene.userData = {};
    scene.userData.interiorElements = interiorElements;
    scene.userData.streetElements = streetElements;
}