// audio.js - Audio handling for the 3D scene

import * as THREE from 'three';

// Audio variables
let audioListener, audioSource;
let audioAnalyser;
let audioData = [];
let isAudioPlaying = false;
let audioStartTime = 0;

// Export audio variables for use in main.js
export { audioAnalyser, audioData, isAudioPlaying, audioStartTime };

// Lyrics variables
let currentStanzaIndex = -1;
let currentLineIndex = -1;
let lyricsContainer = null;
let stanzaContainer = null; // Container for current stanza
let stanzaFadeTimeout = null; // Timeout for fading out stanza
let currentSceneRef = 'exterior'; // Default to exterior view

// Array of lyrics with timestamps in milliseconds
const lyrics = [
    // First stanza
    [
        { time: 26500, text: "karaoke at our favorite bar" },
        { time: 32500, text: "I wanna sing away my cares" },
        { time: 38500, text: "text me when you're on the bus" },
        { time: 43500, text: "I'll order us a Gansett pair" }
    ],
    
    // Second stanza
    [
        { time: 80000, text: "my name upon the dotted line" },
        { time: 86000, text: "fairies spinning above" },
        { time: 92000, text: "cried when I did \"Stuck With You\"" },
        { time: 99000, text: "that's the power of love" }
    ],
    
    // Third stanza
    [
        { time: 134000, text: "we can get a handle on" },
        { time: 140000, text: "anything they put us through" },
        { time: 146000, text: "so kiss me in the corner booth" },
        { time: 151000, text: "kiss me" }
    ]
];

// Setup audio with the provided camera
const setupAudio = (camera) => {
    // Create an AudioListener and add it to the camera
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    
    // Create a non-positional audio source
    audioSource = new THREE.Audio(audioListener);
    
    // Create an AudioLoader
    const audioLoader = new THREE.AudioLoader();
    
    // Load the sound file with error handling
    audioLoader.load(
        'huey.mp3',
        function(buffer) {
            console.log('Audio loaded successfully');
            
            // Set the buffer to the audio source
            audioSource.setBuffer(buffer);
            audioSource.setLoop(false); // Don't loop the song
            audioSource.setVolume(0.6); // Slightly higher volume since we're not using spatial audio
            
            // Add 'ended' event listener to handle when song finishes
            audioSource.onEnded = () => {
                isAudioPlaying = false;
                
                // Reset the play button
                const playButton = document.querySelector('button');
                if (playButton) {
                    playButton.textContent = 'Play';
                }
                
                // Hide lyrics when song ends
                if (stanzaContainer) {
                    stanzaContainer.style.opacity = '0';
                }
            };
            
            // Set up analyzer for visualization
            audioAnalyser = new THREE.AudioAnalyser(audioSource, 128);
            audioData = audioAnalyser.data;
            
            // Add a play button to the DOM
            addAudioControls();
            
            // Initialize lyrics container
            setupLyricsDisplay();
        },
        // Progress callback
        function(xhr) {
            console.log('Loading audio: ' + (xhr.loaded / xhr.total * 100) + '% loaded');
        },
        // Error callback
        function(error) {
            console.error('Error loading audio:', error);
            // Add error message to the page
            const errorDiv = document.createElement('div');
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '20px';
            errorDiv.style.left = '20px';
            errorDiv.style.color = 'red';
            errorDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
            errorDiv.style.padding = '10px';
            errorDiv.style.borderRadius = '5px';
            errorDiv.style.zIndex = '1000';
            errorDiv.textContent = 'Error loading audio. Please check console for details.';
            document.body.appendChild(errorDiv);
        }
    );
};

// Add audio control button
const addAudioControls = () => {
    const controlsDiv = document.createElement('div');
    controlsDiv.style.position = 'absolute';
    controlsDiv.style.bottom = '20px';
    controlsDiv.style.left = '20px';
    controlsDiv.style.zIndex = '1000';
    
    const playButton = document.createElement('button');
    playButton.textContent = 'Play';
    playButton.style.padding = '10px 20px';
    playButton.style.backgroundColor = '#333';
    playButton.style.color = '#fff';
    playButton.style.border = '2px solid #666';
    playButton.style.cursor = 'pointer';
    playButton.style.fontFamily = 'monospace';
    playButton.style.borderRadius = '4px';
    playButton.style.marginRight = '10px';
    playButton.style.boxShadow = '0 0 5px rgba(0,0,0,0.5)';
    
    playButton.addEventListener('click', () => {
        if (!isAudioPlaying) {
            // Try to play audio with error handling
            try {
                // Resume audio context if it's suspended (browser autoplay policy)
                if (audioListener.context.state === 'suspended') {
                    audioListener.context.resume().then(() => {
                        console.log('Audio context resumed');
                        audioSource.play();
                        playButton.textContent = 'Pause';
                        isAudioPlaying = true;
                        audioStartTime = Date.now();
                        
                        // Reset transition flag when starting playback
                        sceneTransitionTriggered = false;
                        explosionTriggered = false;
                        returnTriggered = false;
                        preventSecondExplosion = false; // Reset when restarting
                        
                        // Reset lyrics display when starting playback
                        currentStanzaIndex = -1;
                        currentLineIndex = -1;
                        
                        // Clear any existing lyrics
                        stanzaContainer = null;
                        
                        // Clear any existing timeout
                        if (stanzaFadeTimeout) {
                            clearTimeout(stanzaFadeTimeout);
                        }
                    }).catch(error => {
                        console.error('Error resuming audio context:', error);
                    });
                } else {
                    audioSource.play();
                    playButton.textContent = 'Pause';
                    isAudioPlaying = true;
                    audioStartTime = Date.now();
                    
                    // Reset transition flag when starting playback
                    sceneTransitionTriggered = false;
                    explosionTriggered = false;
                    returnTriggered = false;
                    preventSecondExplosion = false; // Reset when restarting
                    
                    // Reset lyrics display when starting playback
                    currentStanzaIndex = -1;
                    currentLineIndex = -1;
                    
                    // Clear any existing lyrics
                    stanzaContainer = null;
                    
                    // Clear any existing timeout
                    if (stanzaFadeTimeout) {
                        clearTimeout(stanzaFadeTimeout);
                    }
                }
            } catch (error) {
                console.error('Error playing audio:', error);
            }
        } else {
            // Pause audio
            audioSource.pause();
            
            playButton.textContent = 'Play';
            isAudioPlaying = false;
            
            // Hide lyrics when paused
            if (stanzaContainer) {
                stanzaContainer.style.opacity = '0';
            }
        }
    });
    
    controlsDiv.appendChild(playButton);
    document.body.appendChild(controlsDiv);
};

// Setup lyrics display container and element
const setupLyricsDisplay = () => {
    // Create container for lyrics
    lyricsContainer = document.createElement('div');
    lyricsContainer.style.position = 'absolute';
    lyricsContainer.style.top = '50%'; // Center vertically
    lyricsContainer.style.left = '0';
    lyricsContainer.style.width = '100%';
    lyricsContainer.style.textAlign = 'center';
    lyricsContainer.style.zIndex = '1000';
    lyricsContainer.style.pointerEvents = 'none'; // Don't interfere with user interaction
    lyricsContainer.style.transform = 'translateY(-50%)'; // Center the container itself
    lyricsContainer.className = 'lyrics-container'; // Add class for styling
    
    // Add specialized medieval 8-bit font link to document head
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Silkscreen&family=VT323&display=swap';
    document.head.appendChild(fontLink);
    
    // Add custom CSS for animations without borders
    const customCSS = document.createElement('style');
    customCSS.textContent = `
        /* Stanza container - holds the entire 4-line group */
        .stanza-container {
            display: block;
            width: 100%;
            text-align: center;
            opacity: 1;
            transition: opacity 1s ease-in-out;
            margin: 0 auto;
            max-width: 800px; /* Limit width for better readability */
        }
        
        /* Individual lyric line */
        .lyric-line {
            display: block;
            width: 100%;
            text-align: center;
            opacity: 0;
            margin: 8px 0;
            transition: opacity 0.8s ease-in-out;
            padding: 0 20px; /* Add some horizontal padding */
            box-sizing: border-box;
        }
        
        /* Pixel-art text shadow simulation */
        .pixel-text {
            position: relative;
            display: inline-block;
            white-space: pre-wrap;
            text-shadow: 0 0 1px black, 0 0 2px black, 0 0 3px black;
            word-wrap: break-word;
            word-break: normal;
        }

        /* Media query for smaller screens */
        @media (max-height: 600px) {
            .lyric-line {
                margin: 4px 0;
            }
        }
    `;
    document.head.appendChild(customCSS);
    
    // Add lyric container to document
    document.body.appendChild(lyricsContainer);
};

// Create a new lyric element
const createLyricElement = (text, colorScheme) => {
    // Create the main lyric element
    const element = document.createElement('div');
    element.className = 'lyric-line pixel-text';
    element.style.fontFamily = '"Silkscreen", "VT323", monospace';
    element.style.fontSize = '28px';
    element.style.fontWeight = 'normal';
    element.style.letterSpacing = '1px';
    element.style.lineHeight = '1.3';
    element.style.color = '#ffffff';
    element.style.padding = '10px 0';
    
    // Multi-layered text shadow for readability without a background
    // Outer colored glow + inner black outline for readability against any background
    element.style.textShadow = `
        0 0 8px ${colorScheme.shadow}, 
        0 0 12px ${colorScheme.shadow}, 
        0 0 16px ${colorScheme.shadow},
        0 0 1px #000,
        0 0 2px #000,
        0 0 3px #000,
        0 1px 1px #000,
        0 -1px 1px #000,
        1px 0 1px #000,
        -1px 0 1px #000
    `;
    
    // Add text
    element.textContent = text;
    
    return element;
};

// Get a neon color for the lyrics based on the index (glow only)
const getLyricColor = (index) => {
    const colors = [
        { shadow: 'rgba(255, 51, 119, 0.8)' },   // Pink
        { shadow: 'rgba(51, 255, 170, 0.8)' },   // Seafoam green
        { shadow: 'rgba(51, 187, 255, 0.8)' },   // Light blue
        { shadow: 'rgba(255, 153, 51, 0.8)' },   // Orange
        { shadow: 'rgba(221, 255, 51, 0.8)' },   // Lime
        { shadow: 'rgba(255, 51, 221, 0.8)' }    // Magenta
    ];
    
    return colors[index % colors.length];
};

// Update lyrics based on current playback time
const updateLyrics = () => {
    if (!isAudioPlaying || !lyricsContainer) return;
    
    const currentPlaybackTime = Date.now() - audioStartTime;
    
    // Check if we need to create a new stanza
    for (let i = 0; i < lyrics.length; i++) {
        const stanza = lyrics[i];
        const firstLineTime = stanza[0].time;
        
        // If we've reached a new stanza's start time and it's a new stanza
        if (currentPlaybackTime >= firstLineTime && i > currentStanzaIndex) {
            // Create a new stanza
            createNewStanza(i);
            break;
        }
    }
    
    // Check if we need to show the next line in the current stanza
    if (currentStanzaIndex >= 0 && stanzaContainer) {
        const currentStanza = lyrics[currentStanzaIndex];
        
        for (let i = 0; i < currentStanza.length; i++) {
            // If this line's time has passed and it's a new line we haven't shown yet
            if (currentPlaybackTime >= currentStanza[i].time && i > currentLineIndex) {
                showNextLine(i);
                
                // If this is the last line in the stanza, set a timeout to fade out
                if (i === currentStanza.length - 1) {
                    // Clear any existing timeout
                    if (stanzaFadeTimeout) {
                        clearTimeout(stanzaFadeTimeout);
                    }
                    
                    // Set timeout to fade out the stanza after 6 seconds
                    stanzaFadeTimeout = setTimeout(() => {
                        if (stanzaContainer) {
                            stanzaContainer.style.opacity = '0';
                            
                            // Remove from DOM after fade out
                            setTimeout(() => {
                                if (stanzaContainer && stanzaContainer.parentNode) {
                                    stanzaContainer.parentNode.removeChild(stanzaContainer);
                                    stanzaContainer = null;
                                }
                            }, 1000); // Remove after fade out completes
                        }
                    }, 6000); // 6 seconds after the last line appears
                }
                
                break;
            }
        }
    }
};

// Create a new stanza container with all 4 lines (initially hidden)
const createNewStanza = (stanzaIndex) => {
    // Clear any previous stanza fade timeout
    if (stanzaFadeTimeout) {
        clearTimeout(stanzaFadeTimeout);
        stanzaFadeTimeout = null;
    }
    
    // Remove old stanza if it exists
    if (stanzaContainer && stanzaContainer.parentNode) {
        stanzaContainer.style.opacity = '0';
        
        // Use setTimeout to remove after fade out
        setTimeout(() => {
            if (stanzaContainer && stanzaContainer.parentNode) {
                stanzaContainer.parentNode.removeChild(stanzaContainer);
            }
        }, 800);
    }
    
    // Update current stanza index
    currentStanzaIndex = stanzaIndex;
    currentLineIndex = -1; // Reset line index
    
    // Create new stanza container
    stanzaContainer = document.createElement('div');
    stanzaContainer.className = 'stanza-container';
    
    // Get color scheme for this stanza
    const colorScheme = getLyricColor(stanzaIndex);
    
    // Create all lines for this stanza but keep them hidden initially
    const currentStanza = lyrics[stanzaIndex];
    for (let i = 0; i < currentStanza.length; i++) {
        const lyricElement = createLyricElement(currentStanza[i].text, colorScheme);
        stanzaContainer.appendChild(lyricElement);
        
        // Setup pulse animation for each lyric element
        setupPulseAnimation(lyricElement, colorScheme);
    }
    
    // Add the new stanza to the lyrics container
    lyricsContainer.appendChild(stanzaContainer);
};

// Show the next line in the current stanza
const showNextLine = (lineIndex) => {
    currentLineIndex = lineIndex;
    
    if (stanzaContainer && lineIndex < stanzaContainer.children.length) {
        const lineElement = stanzaContainer.children[lineIndex];
        
        // Fade in the line
        setTimeout(() => {
            lineElement.style.opacity = '1';
        }, 10);
    }
};

// Set up pulse animation for a lyric element
const setupPulseAnimation = (element, colorScheme) => {
    const pulseAnimation = () => {
        if (!isAudioPlaying || !element || element.style.opacity === '0') return;
        
        // Get current audio levels
        const midLevel = getAverageFrequency(5, 20);
        
        // Only pulse glow with mid frequencies
        const glowIntensity = 8 + midLevel * 16;
        element.style.textShadow = `
            0 0 ${glowIntensity}px ${colorScheme.shadow}, 
            0 0 ${glowIntensity/1.5}px ${colorScheme.shadow}, 
            0 0 ${glowIntensity*2}px rgba(255, 255, 255, 0.3),
            0 0 1px #000,
            0 0 2px #000,
            0 0 3px #000
        `;
        
        // Continue animation
        requestAnimationFrame(pulseAnimation);
    };
    
    // Start the pulse animation
    pulseAnimation();
};

// Update the current scene reference to maintain vertical centering
const updateSceneReference = (sceneName) => {
    if (sceneName && (sceneName === 'exterior' || sceneName === 'interior')) {
        currentSceneRef = sceneName;
        
        // Update lyric position based on current scene
        if (lyricsContainer) {
            // Keep vertical centering regardless of scene
            lyricsContainer.style.top = '50%';
            lyricsContainer.style.transform = 'translateY(-50%)';
        }
    }
};

// Create audio-reactive particles in the scene
const createAudioReactiveElements = (scene) => {
    // Create multiple particle systems with different geometries
    const particleCount = 80;
    const particleGroups = new THREE.Group();
    particleGroups.name = "audioReactiveParticles";
    
    // Create different geometric shapes for audio reactivity
    const geometries = [
        new THREE.TetrahedronGeometry(0.2, 0), // Tetrahedron (triangular pyramid)
        new THREE.OctahedronGeometry(0.15, 0), // Octahedron (8 faces)
        new THREE.DodecahedronGeometry(0.15, 0), // Dodecahedron (12 faces)
        new THREE.IcosahedronGeometry(0.15, 0), // Icosahedron (20 faces)
    ];
    
    // Arrays to store the particle meshes by geometry type
    const particles = {
        tetrahedrons: [],
        octahedrons: [],
        dodecahedrons: [],
        icosahedrons: []
    };
    
    // Distribute particles across the different geometry types
    for (let i = 0; i < particleCount; i++) {
        // Position particles mostly in the interior scene
        const x = (Math.random() - 0.5) * 15;
        const y = Math.random() * 5 + 1.5;
        const z = (Math.random() - 0.5) * 15 - 5; // Bias toward interior (-5)
        
        // Neon colors
        const color = new THREE.Color(
            0.7 + Math.random() * 0.3,     // Red
            0.4 + Math.random() * 0.6,     // Green
            0.8 + Math.random() * 0.2      // Blue
        );
        
        // Choose a random geometry for this particle
        const geometryIndex = Math.floor(Math.random() * geometries.length);
        const geometry = geometries[geometryIndex];
        
        // Create material with glow
        const material = new THREE.MeshBasicMaterial({
            color: color,
            wireframe: true,
            transparent: true,
            opacity: 0.8,
        });
        
        // Create mesh and set position
        const particle = new THREE.Mesh(geometry, material);
        particle.position.set(x, y, z);
        particle.scale.set(1, 1, 1);
        particle.rotation.set(
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        );
        
        // Add particle to its respective array based on geometry type
        if (geometryIndex === 0) particles.tetrahedrons.push(particle);
        else if (geometryIndex === 1) particles.octahedrons.push(particle);
        else if (geometryIndex === 2) particles.dodecahedrons.push(particle);
        else particles.icosahedrons.push(particle);
        
        // Add to group
        particleGroups.add(particle);
    }
    
    // Add the entire group to the scene
    scene.add(particleGroups);
    
    // Store reference to particles
    if (!scene.userData) scene.userData = {};
    scene.userData.audioReactiveElements = {
        particleGroup: particleGroups,
        particles: particles
    };
    
    return particleGroups;
};

// Add variables for scene transition timing
let sceneTransitionTime = 5000; // 5 seconds into the song
let sceneTransitionTriggered = false;
let explosionTriggered = false;
let explosionTime = 66000; // 1:06 into the song
let returnToPositionTime = 135000; // 2:15 into the song
let returnTriggered = false;
let preventSecondExplosion = false; // Flag to prevent repeated explosions

// Create an explosion effect when the drums and bass kick in
let blownApartObjects = new Map(); // Store objects blown apart for later return
let explosionCenter = new THREE.Vector3(0, 0, 0); // Centered at origin, not mic stand
let originalObjectStates = new Map(); // Store original states of ALL objects before any explosions

const createExplosionEffect = (scene, interiorElements, streetElements) => {
    // Use center of scene (0,0,0) as explosion origin
    explosionCenter.set(0, 0, 0);
    
    // More complete recursive check for audio reactive particles
    const isAudioReactiveParticle = (object) => {
        if (!object) return false;
        if (object.name === "audioReactiveParticles") return true;
        if (object.parent && object.parent.name === "audioReactiveParticles") return true;
        
        // Check through the geometry types used for particles
        const particleGeometryTypes = [
            "TetrahedronGeometry", "OctahedronGeometry", 
            "DodecahedronGeometry", "IcosahedronGeometry"
        ];
        
        if (object.geometry && particleGeometryTypes.some(type => 
            object.geometry.type === type || 
            (object.geometry.constructor && object.geometry.constructor.name === type)
        )) {
            return true;
        }
        
        return false;
    };
    
    // Create a flash of light at the center
    const flashLight = new THREE.PointLight(0xffffff, 2, 30);
    flashLight.position.copy(explosionCenter);
    flashLight.position.y += 2; // Slightly above center
    scene.add(flashLight);
    
    // Fade out the flash
    const fadeOutFlash = () => {
        if (flashLight.intensity > 0.1) {
            flashLight.intensity *= 0.9;
            requestAnimationFrame(fadeOutFlash);
        } else {
            scene.remove(flashLight);
        }
    };
    
    // Start fading after a short delay
    setTimeout(fadeOutFlash, 100);
    
    // Store original positions of ALL objects if we haven't already
    if (originalObjectStates.size === 0) {
        scene.traverse(object => {
            if (object.isMesh || object.isGroup) {
                // Skip skybox, audio-reactive particles, fairies and any other special objects
                if (object.name === "skybox" || 
                    object.name === "audioReactiveParticles" ||
                    isAudioReactiveParticle(object) ||
                    (object.parent && object.parent.name === "fairiesGroup") ||
                    object.name === "fairiesGroup") {
                    return;
                }
                
                // Store original state
                originalObjectStates.set(object, {
                    position: object.position.clone(),
                    rotation: {
                        x: object.rotation.x,
                        y: object.rotation.y,
                        z: object.rotation.z
                    }
                });
            }
        });
    }
    
    // Store objects to be blown apart
    blownApartObjects = new Map();
    
    // Function to store original positions and prepare for blow-apart
    const prepareBlowApart = (object) => {
        if (object.isMesh || object.isGroup) {
            // Skip skybox, audio-reactive particles, fairies and any other special objects
            if (object.name === "skybox" || 
                object.name === "audioReactiveParticles" ||
                isAudioReactiveParticle(object) ||
                (object.parent && object.parent.name === "fairiesGroup") ||
                object.name === "fairiesGroup") {
                return;
            }
            
            // Calculate direction from center to object
            const direction = new THREE.Vector3();
            direction.subVectors(object.position, explosionCenter).normalize();
            
            // Calculate distance from center (affects force)
            const distance = object.position.distanceTo(explosionCenter);
            
            // Check if this is a table or chair
            const isTableOrChair = (obj) => {
                const scene = document.querySelector('canvas')?.userData?.scene;
                if (!scene || !scene.userData) return false;
                
                const interiorElements = scene.userData.interiorElements;
                if (!interiorElements) return false;
                
                if (interiorElements.tables && interiorElements.tables.includes(obj)) return true;
                if (interiorElements.chairs && interiorElements.chairs.includes(obj)) return true;
                
                return false;
            };
            
            // Calculate force (closer = stronger force, but much gentler overall)
            let forceFactor = Math.max(0.3, 5 / (distance + 0.1));
            
            // Reduce force for tables and chairs to keep them more stable
            if (isTableOrChair(object)) {
                forceFactor *= 0.7; // 30% less force for furniture
            }
            
            // Store data for this object
            blownApartObjects.set(object, {
                direction: direction,
                force: forceFactor,
                maxDistance: 3 + Math.random() * 3, // Shorter maximum distance
                isTableOrChair: isTableOrChair(object) // Flag for special handling
            });
        }
    };
    
    // Process all objects in the scene
    scene.traverse(prepareBlowApart);
    
    // Function to animate the blow-apart effect
    const animateBlowApart = () => {
        let stillMoving = false;
        
        blownApartObjects.forEach((data, object) => {
            if (!object.userData.blowApartDistance) {
                object.userData.blowApartDistance = 0;
                
                // Get data for this object
                const objData = blownApartObjects.get(object);
                const isTableOrChair = objData && objData.isTableOrChair;
                
                // Store a consistent rotation direction for each object (MUCH slower)
                // Tables and chairs get even less rotation
                const rotationMultiplier = isTableOrChair ? 0.3 : 1.0;
                object.userData.rotationDirection = {
                    x: Math.sign(Math.random() - 0.5) * 0.0005 * rotationMultiplier,
                    y: Math.sign(Math.random() - 0.5) * 0.0008 * rotationMultiplier,
                    z: Math.sign(Math.random() - 0.5) * 0.0005 * rotationMultiplier
                };
                
                // Save initial angle for orbital motion
                const toObject = new THREE.Vector3().subVectors(object.position, explosionCenter);
                object.userData.orbitAngle = Math.atan2(toObject.x, toObject.z);
                object.userData.orbitRadius = toObject.length() * 1.1; // Expand orbit slightly
                object.userData.orbitSpeed = 0.0005 + Math.random() * 0.0005; // MUCH slower orbit speed
                object.userData.orbitVertical = -0.05 + Math.random() * 0.1; // Less vertical drift
            }
            
            // If we haven't reached max distance yet
            if (object.userData.blowApartDistance < data.maxDistance) {
                // Calculate movement speed (starts fast, slows down) - MUCH slower
                const speed = 0.03 * data.force * (1 - object.userData.blowApartDistance / data.maxDistance);
                
                // Initial outward movement (reduced)
                object.position.addScaledVector(data.direction, speed * 0.3);
                
                // Add orbital motion around the center
                object.userData.orbitAngle += object.userData.orbitSpeed;
                
                // Calculate new position based on orbit
                const orbitX = Math.sin(object.userData.orbitAngle) * object.userData.orbitRadius;
                const orbitZ = Math.cos(object.userData.orbitAngle) * object.userData.orbitRadius;
                
                // Smoothly transition to orbital path (slower transition)
                const orbitProgress = Math.min(1.0, object.userData.blowApartDistance / (data.maxDistance * 0.6));
                object.position.x = explosionCenter.x + orbitX * orbitProgress + data.direction.x * (1 - orbitProgress) * object.userData.blowApartDistance * 3;
                object.position.z = explosionCenter.z + orbitZ * orbitProgress + data.direction.z * (1 - orbitProgress) * object.userData.blowApartDistance * 3;
                
                // Gradual vertical drift (reduced)
                object.position.y += object.userData.orbitVertical * speed * 0.5;
                
                object.userData.blowApartDistance += speed;
                
                // Use consistent rotation instead of random for smoothness (MUCH slower)
                // Scale rotation by force and distance for natural slowing
                const rotationFactor = data.force * (1 - object.userData.blowApartDistance / data.maxDistance);
                
                // Apply less rotation to tables and chairs (if flagged as such)
                const rotMult = data.isTableOrChair ? 0.5 : 1.0;
                object.rotation.x += object.userData.rotationDirection.x * rotationFactor * rotMult;
                object.rotation.y += object.userData.rotationDirection.y * rotationFactor * rotMult;
                object.rotation.z += object.userData.rotationDirection.z * rotationFactor * rotMult;
                
                stillMoving = true;
            }
        });
        
        if (stillMoving) {
            requestAnimationFrame(animateBlowApart);
        }
        // Objects will stay in their blown apart positions until 2:15
        // Return animation is triggered in updateAudioReactiveElements
    };
    
    // Start the blow-apart animation
    animateBlowApart();
};

// Variables for smooth return animation
let returnAnimationStartTime = 0;
let returnAnimationDuration = 20000; // 20 seconds for smooth return (doubled from 10)
let isReturnAnimationActive = false;

// Function to trigger return animation at 2:15
const triggerReturnAnimation = () => {
    // Initialize animation state
    returnAnimationStartTime = Date.now();
    isReturnAnimationActive = true;
    
    // Create a gentle flash of light
    const scene = document.querySelector('canvas').userData?.scene;
    if (scene) {
        const flashLight = new THREE.PointLight(0xffffff, 1, 30);
        flashLight.position.copy(explosionCenter);
        flashLight.position.y += 2;
        scene.add(flashLight);
        
        // Fade out the flash very quickly
        const fadeOutFlash = () => {
            if (flashLight.intensity > 0.1) {
                flashLight.intensity *= 0.9;
                requestAnimationFrame(fadeOutFlash);
            } else {
                scene.remove(flashLight);
            }
        };
        setTimeout(fadeOutFlash, 50);
    }
};

// Function to update return animation each frame
const updateReturnAnimation = () => {
    if (!isReturnAnimationActive) return;
    
    // Calculate progress (0 to 1)
    const elapsed = Date.now() - returnAnimationStartTime;
    const progress = Math.min(1.0, elapsed / returnAnimationDuration);
    
    // Smooth easing function for natural movement
    const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
    const eased = easeOutQuint(progress);
    
    // Update all blown apart objects
    blownApartObjects.forEach((data, object) => {
        // Skip if object was removed
        if (!object.parent) return;
        
        // Get original state
        const originalState = originalObjectStates.get(object);
        if (!originalState) return;
        
        // Smooth position interpolation
        const currentPos = object.position.clone();
        const targetPos = originalState.position;
        
        // Use THREE.js Vector3.lerp for smooth interpolation
        object.position.copy(
            currentPos.lerp(targetPos, eased)
        );
        
        // Smooth rotation interpolation
        const lerpAngle = (start, end, t) => {
            // Normalize angles to avoid multiple rotations
            const normalize = (angle) => {
                while (angle > Math.PI) angle -= Math.PI * 2;
                while (angle < -Math.PI) angle += Math.PI * 2;
                return angle;
            };
            
            let startAngle = normalize(start);
            let endAngle = normalize(end);
            
            // Find shortest path
            let diff = endAngle - startAngle;
            if (Math.abs(diff) > Math.PI) {
                if (diff > 0) {
                    diff = diff - Math.PI * 2;
                } else {
                    diff = diff + Math.PI * 2;
                }
            }
            
            return startAngle + diff * t;
        };
        
        // Apply rotation interpolation
        object.rotation.x = lerpAngle(object.rotation.x, originalState.rotation.x, eased);
        object.rotation.y = lerpAngle(object.rotation.y, originalState.rotation.y, eased);
        object.rotation.z = lerpAngle(object.rotation.z, originalState.rotation.z, eased);
    });
    
    // End animation when complete
    if (progress >= 1.0) {
        isReturnAnimationActive = false;
        preventSecondExplosion = true; // Prevent further explosions after return
        
        // Ensure perfect placement at the end
        blownApartObjects.forEach((data, object) => {
            if (object.parent) {
                const originalState = originalObjectStates.get(object);
                if (originalState) {
                    // Set exact position and rotation
                    object.position.copy(originalState.position);
                    object.rotation.set(
                        originalState.rotation.x,
                        originalState.rotation.y,
                        originalState.rotation.z
                    );
                    
                    // Clear any temporary animation data
                    delete object.userData.blowApartDistance;
                    delete object.userData.rotationDirection;
                    delete object.userData.orbitAngle;
                    delete object.userData.orbitRadius;
                    delete object.userData.orbitSpeed;
                    delete object.userData.orbitVertical;
                }
            }
        });
    }
};

// Update audio-reactive elements based on audio analysis
const updateAudioReactiveElements = (scene, interiorElements, streetElements, time) => {
    if (!audioAnalyser || !isAudioPlaying) return;
    
    // Update frequency data
    audioAnalyser.getFrequencyData();
    
    // Check current scene from scene userData (set in main.js)
    if (scene.userData && scene.userData.currentScene) {
        updateSceneReference(scene.userData.currentScene);
    }
    
    // Get current playback time
    const currentPlaybackTime = Date.now() - audioStartTime;
    
    // Only check for scene transition if we're playing audio and current scene is exterior
    if (!sceneTransitionTriggered && isAudioPlaying && 
        currentPlaybackTime >= sceneTransitionTime && 
        scene.userData.transitionToScene && 
        scene.userData.currentScene === 'exterior') {
        
        // Call the transitionToScene function with 'interior' as target
        scene.userData.transitionToScene('interior');
        sceneTransitionTriggered = true;
        console.log("Triggered transition to interior scene at 5 seconds");
    }
    
    // Check for explosion time (1:06) - but only if we haven't prevented further explosions
    if (!explosionTriggered && !preventSecondExplosion && isAudioPlaying && currentPlaybackTime >= explosionTime) {
        createExplosionEffect(scene, interiorElements, streetElements);
        explosionTriggered = true;
        console.log("Triggered explosion effect at 1:06");
    }
    
    // Check for return to position time (2:15)
    if (explosionTriggered && !returnTriggered && isAudioPlaying && currentPlaybackTime >= returnToPositionTime) {
        triggerReturnAnimation();
        returnTriggered = true;
        console.log("Triggered return to original positions at 2:15");
    }
    
    // Update return animation if active
    if (isReturnAnimationActive) {
        updateReturnAnimation();
    }
    
    // Update lyrics display
    updateLyrics();
    
    // Get average frequency from different bands
    const bassAvg = getAverageFrequency(1, 4);    // Bass frequencies
    const midAvg = getAverageFrequency(5, 20);    // Mid frequencies
    const highAvg = getAverageFrequency(50, 100); // High frequencies
    
    // Apply global audio-reactive color effect to the entire scene
    applyGlobalAudioEffect(scene, bassAvg, midAvg, highAvg, time);
    
    // Update particles based on audio
    updateAudioParticles(scene, bassAvg, midAvg, highAvg, time);
    
    // Make furniture react to audio
    updateFurnitureReactions(interiorElements, bassAvg, midAvg, highAvg, time);
    
    // Make building react to bass
    updateBuildingReactions(streetElements, bassAvg);
};

// Apply a subtle global color shift to all objects in the scene based on audio
const applyGlobalAudioEffect = (scene, bass, mid, high, time) => {
    // Store the initial color for objects if not already stored
    if (!scene.userData.initialColorsStored) {
        storeInitialColors(scene);
        scene.userData.initialColorsStored = true;
    }
    
    // Calculate color modulations based on audio frequencies
    const bassModulation = 1.0 + bass * 0.3;      // Red modulation (1.0-1.3)
    const midModulation = 1.0 + mid * 0.3;        // Green modulation (1.0-1.3)
    const highModulation = 1.0 + high * 0.3;      // Blue modulation (1.0-1.3)
    
    // Apply subtle pulsing based on average of all frequencies
    const avgIntensity = (bass + mid + high) / 3;
    const pulse = 1.0 + avgIntensity * 0.2;
    
    // Function to check if an object is a table or chair (that should be excluded)
    const isTableOrChair = (object) => {
        // Check if this object is part of interiorElements.tables or interiorElements.chairs
        const scene = document.querySelector('canvas')?.userData?.scene;
        if (!scene || !scene.userData) return false;
        
        const interiorElements = scene.userData.interiorElements;
        if (!interiorElements) return false;
        
        // Check for tables
        if (interiorElements.tables && interiorElements.tables.includes(object)) {
            return true;
        }
        
        // Check for chairs
        if (interiorElements.chairs && interiorElements.chairs.includes(object)) {
            return true;
        }
        
        // Check if this is a child of a table or chair
        if (object.parent) {
            if (interiorElements.tables && interiorElements.tables.includes(object.parent)) {
                return true;
            }
            if (interiorElements.chairs && interiorElements.chairs.includes(object.parent)) {
                return true;
            }
        }
        
        return false;
    };
    
    // Apply color modulation to all objects with materials in the scene
    scene.traverse(object => {
        // Skip fairies and their children
        if (object.parent && object.parent.name === 'fairiesGroup') return;
        
        // Skip any audio-reactive particles completely
        if (object.parent && object.parent.name === 'audioReactiveParticles') return;
        if (object.name === 'audioReactiveParticles') return;
        
        // Skip tables and chairs completely
        if (isTableOrChair(object)) return;
        
        if (object.isMesh && object.material) {
            // Handle different material types
            if (object.material.color) {
                // Standard materials with direct color property
                applyColorModulation(object, bassModulation, midModulation, highModulation, pulse);
            } else if (object.material.uniforms && object.material.uniforms.color) {
                // Shader materials with color uniform
                const color = object.material.uniforms.color.value;
                if (color && typeof color.r !== 'undefined') {
                    // If initial color is stored, modulate based on it
                    if (object.userData.initialColor) {
                        color.r = object.userData.initialColor.r * bassModulation;
                        color.g = object.userData.initialColor.g * midModulation;
                        color.b = object.userData.initialColor.b * highModulation;
                    }
                }
            }
            
            // Also modify emissive colors if they exist
            if (object.material.emissive) {
                if (object.userData.initialEmissive) {
                    object.material.emissive.r = object.userData.initialEmissive.r * bassModulation * pulse;
                    object.material.emissive.g = object.userData.initialEmissive.g * midModulation * pulse;
                    object.material.emissive.b = object.userData.initialEmissive.b * highModulation * pulse;
                }
            }
            
            // Modify opacity for extra effect if material supports it
            if (object.material.transparent && object.userData.initialOpacity) {
                // Pulse the opacity slightly with the beat
                object.material.opacity = object.userData.initialOpacity * (0.9 + avgIntensity * 0.2);
            }
        }
    });
};

// Store initial colors for all objects to modulate from
const storeInitialColors = (scene) => {
    scene.traverse(object => {
        if (object.isMesh && object.material) {
            // Store base color
            if (object.material.color && !object.userData.initialColor) {
                object.userData.initialColor = object.material.color.clone();
            }
            
            // Store emissive color if it exists
            if (object.material.emissive && !object.userData.initialEmissive) {
                object.userData.initialEmissive = object.material.emissive.clone();
            }
            
            // Store opacity if material is transparent
            if (object.material.transparent && typeof object.material.opacity !== 'undefined') {
                object.userData.initialOpacity = object.material.opacity;
            }
            
            // Store color uniform for shader materials
            if (object.material.uniforms && object.material.uniforms.color && 
                object.material.uniforms.color.value && !object.userData.initialUniformColor) {
                object.userData.initialUniformColor = object.material.uniforms.color.value.clone();
            }
        }
    });
};

// Apply color modulation to an object based on audio
const applyColorModulation = (object, bassModulation, midModulation, highModulation, pulse) => {
    // Skip if we don't have the initial color stored
    if (!object.userData.initialColor) return;
    
    // Apply audio-reactive color modulation
    object.material.color.r = object.userData.initialColor.r * bassModulation;
    object.material.color.g = object.userData.initialColor.g * midModulation;
    object.material.color.b = object.userData.initialColor.b * highModulation;
    
    // Apply overall pulse to brightness
    const hsl = {h: 0, s: 0, l: 0};
    object.material.color.getHSL(hsl);
    hsl.l = Math.min(1.0, hsl.l * pulse);
    object.material.color.setHSL(hsl.h, hsl.s, hsl.l);
};

// Get average frequency in a range of the analyzer data
const getAverageFrequency = (start, end) => {
    let sum = 0;
    const length = Math.min(end, audioData.length) - start;
    
    if (length <= 0) return 0;
    
    for (let i = start; i < Math.min(end, audioData.length); i++) {
        sum += audioData[i];
    }
    
    return sum / length / 255; // Normalize to 0-1 range
};

// Update audio-reactive particles
const updateAudioParticles = (scene, bass, mid, high, time) => {
    if (!scene.userData || !scene.userData.audioReactiveElements) return;
    
    const elements = scene.userData.audioReactiveElements;
    if (!elements.particleGroup || !elements.particles) return;
    
    // Calculate visualization intensity based on audio - reduced impact
    const intensityFactor = 0.3 + (bass + mid + high) * 0.1; // Reduced from 0.2
    
    // Animate particles based on audio frequencies
    const animateParticles = (particles, frequencyBand, rotationFactor) => {
        particles.forEach((particle, index) => {
            // Use particle's index to create consistent patterns instead of random flickering
            const particlePhase = index * 0.1;
            // Slower oscillation
            const particleOffset = Math.sin(time * 0.15 + particlePhase) * 0.5 + 0.5; // Reduced from 0.3
            
            // Scale with audio and oscillation - gentler changes
            const baseScale = 0.7 + particleOffset * 0.2; // Reduced variation
            const audioScale = baseScale + frequencyBand * 0.3; // Reduced from 0.5
            particle.scale.set(audioScale, audioScale, audioScale);
            
            // Position animation - MUCH slower and gentler movement
            // Ensure all particle types move by using non-zero values even when frequencyBand is low
            const minMovement = 0.0005; // Minimum movement even when audio is quiet
            const xMovement = Math.sin(time * 0.08 + particlePhase) * (minMovement + frequencyBand * 0.01);
            const yMovement = Math.sin(time * 0.1 + particlePhase) * (minMovement + frequencyBand * 0.008);
            const zMovement = Math.cos(time * 0.09 + particlePhase) * (minMovement + frequencyBand * 0.01);
            
            particle.position.x += xMovement;
            particle.position.y += yMovement;
            particle.position.z += zMovement;
            
            // Rotation animation - MUCH slower rotation but always moving
            particle.rotation.x += (minMovement + frequencyBand * rotationFactor * 0.01);
            particle.rotation.y += (minMovement + frequencyBand * rotationFactor * 0.008);
            particle.rotation.z += (minMovement + frequencyBand * rotationFactor * 0.009);
            
            // Color shifts based on audio frequency - less dramatic
            const intensity = 0.6 + frequencyBand * 0.3; // Reduced from 0.5, more baseline
            
            // Different color schemes for different shapes
            if (particles === elements.particles.tetrahedrons) {
                // Red/orange for tetrahedrons (bass)
                particle.material.color.setRGB(intensity, intensity * 0.4, intensity * 0.1);
            } else if (particles === elements.particles.octahedrons) {
                // Purple for octahedrons (mid)
                particle.material.color.setRGB(intensity * 0.8, intensity * 0.2, intensity);
            } else if (particles === elements.particles.dodecahedrons) {
                // Green for dodecahedrons (high)
                particle.material.color.setRGB(intensity * 0.2, intensity, intensity * 0.4);
            } else {
                // Cyan for icosahedrons (all frequencies)
                particle.material.color.setRGB(intensity * 0.3, intensity, intensity);
            }
            
            // Opacity based on audio and phase - smoother changes
            const baseOpacity = 0.5 + particleOffset * 0.2; // Reduced variation from 0.3
            const audioOpacity = Math.min(0.9, baseOpacity + frequencyBand * 0.2); // Reduced max and impact from 1.0, 0.3
            particle.material.opacity = audioOpacity;
            
            // Always visible, but opacity and scale changes with audio
            particle.visible = true;
        });
    };
    
    // Animate different shapes based on different frequency bands
    // Reduced rotation factors
    animateParticles(elements.particles.tetrahedrons, bass, 0.4);     // Reduced from 0.8
    animateParticles(elements.particles.octahedrons, mid, 0.3);       // Reduced from 0.6
    animateParticles(elements.particles.dodecahedrons, high, 0.2);    // Reduced from 0.4
    animateParticles(elements.particles.icosahedrons, (bass + mid + high) / 3, 0.25); // Reduced from 0.5
    
    // Handle particles that moved too far away
    const maxDistance = 18;
    elements.particleGroup.children.forEach(particle => {
        const distance = particle.position.length();
        if (distance > maxDistance) {
            // Reset particle position (bring it back into the scene)
            const x = (Math.random() - 0.5) * 15;
            const y = Math.random() * 5 + 1.5;
            const z = (Math.random() - 0.5) * 15 - 5;
            particle.position.set(x, y, z);
        }
    });
};

// Make furniture react to the music - but only speakers should pulse
const updateFurnitureReactions = (interiorElements, bass, mid, high, time) => {
    if (!interiorElements) return;
    
    // Reset tables and chairs to normal scale (to be extra sure)
    if (interiorElements.tables) {
        interiorElements.tables.forEach(table => {
            table.scale.set(1, 1, 1);
        });
    }
    
    if (interiorElements.chairs) {
        interiorElements.chairs.forEach(chair => {
            chair.scale.set(1, 1, 1);
        });
    }
   
    /* REMOVED audio reactivity for tables and chairs
    // Make tables pulse with bass
    if (interiorElements.tables) {
        interiorElements.tables.forEach(table => {
            const scale = 1.0 + bass * 0.2;
            table.scale.set(scale, scale, scale);
        });
    }
    
    // Make chairs pulse with mid frequencies
    if (interiorElements.chairs) {
        interiorElements.chairs.forEach(chair => {
            const scale = 1.0 + mid * 0.15;
            chair.scale.set(scale, scale, scale);
        });
    }
    */
    
    // Make beer cans pulse with bass
    if (interiorElements.beerCans) {
        interiorElements.beerCans.forEach(can => {
            const scale = 1.0 + bass * 0.15;
            can.scale.set(scale, scale, scale);
        });
    }
    
    // Make speakers pulse with mid frequencies
    if (interiorElements.speakers) {
        interiorElements.speakers.forEach(speaker => {
            const scale = 1.0 + mid * 0.2;
            speaker.scale.set(scale, scale, scale);
        });
    }
};

// Make building react to bass
const updateBuildingReactions = (streetElements, bass) => {
    // Subtle pulse of building glow with bass
    if (streetElements.buildingGlow) {
        streetElements.buildingGlow.traverse(child => {
            if (child.isMesh && child.material && child.material.uniforms && 
                child.material.uniforms.opacity) {
                child.material.uniforms.opacity.value = 0.15 + bass * 0.15;
            }
        });
    }
};

// Make the scene accessible to the test buttons
const setSceneReference = (scene) => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
        if (!canvas.userData) canvas.userData = {};
        canvas.userData.scene = scene;
    }
};

export { 
    setupAudio, 
    createAudioReactiveElements, 
    updateAudioReactiveElements,
    updateSceneReference,
    setSceneReference
}; 