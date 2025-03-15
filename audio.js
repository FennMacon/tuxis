// audio.js - Audio handling for the 3D scene

import * as THREE from 'three';

// Audio variables
let audioListener, audioSource;
let audioAnalyser;
let audioData = [];
let isAudioPlaying = false;
let audioStartTime = 0;

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
        { time: 27000, text: "karaoke at our favorite bar" },
        { time: 33000, text: "I wanna sing away my cares" },
        { time: 39000, text: "text me when you're on the bus" },
        { time: 44000, text: "I'll order us a Gansett pair" }
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
    
    // Load the sound file
    audioLoader.load('huey.mp3', function(buffer) {
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
                playButton.textContent = 'Play Music';
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
    });
};

// Add audio control button
const addAudioControls = () => {
    const controlsDiv = document.createElement('div');
    controlsDiv.style.position = 'absolute';
    controlsDiv.style.bottom = '20px';
    controlsDiv.style.left = '20px';
    controlsDiv.style.zIndex = '1000';
    
    const playButton = document.createElement('button');
    playButton.textContent = 'Play Music';
    playButton.style.padding = '10px 20px';
    playButton.style.backgroundColor = '#333';
    playButton.style.color = '#fff';
    playButton.style.border = '2px solid #666';
    playButton.style.cursor = 'pointer';
    playButton.style.fontFamily = 'monospace';
    playButton.style.borderRadius = '4px';
    
    playButton.addEventListener('click', () => {
        if (!isAudioPlaying) {
            // Play audio
            audioSource.play();
            
            playButton.textContent = 'Pause Music';
            isAudioPlaying = true;
            audioStartTime = Date.now();
            
            // Reset transition flag when starting playback
            sceneTransitionTriggered = false;
            
            // Reset lyrics display when starting playback
            currentStanzaIndex = -1;
            currentLineIndex = -1;
            
            // Clear any existing lyrics
            stanzaContainer = null;
            
            // Clear any existing timeout
            if (stanzaFadeTimeout) {
                clearTimeout(stanzaFadeTimeout);
            }
        } else {
            // Pause audio
            audioSource.pause();
            
            playButton.textContent = 'Play Music';
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
    lyricsContainer.style.top = currentSceneRef === 'exterior' ? '15%' : '65%'; // Moved up by 5%
    lyricsContainer.style.left = '0';
    lyricsContainer.style.width = '100%';
    lyricsContainer.style.textAlign = 'center';
    lyricsContainer.style.zIndex = '1000';
    lyricsContainer.style.pointerEvents = 'none'; // Don't interfere with user interaction
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
        }
        
        /* Individual lyric line */
        .lyric-line {
            display: block;
            width: 100%;
            text-align: center;
            opacity: 0;
            margin: 8px 0;
            transition: opacity 0.8s ease-in-out;
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

// Update the current scene reference to move lyrics position
const updateSceneReference = (sceneName) => {
    if (sceneName && (sceneName === 'exterior' || sceneName === 'interior')) {
        currentSceneRef = sceneName;
        
        // Update lyric position based on current scene
        if (lyricsContainer) {
            if (currentSceneRef === 'exterior') {
                lyricsContainer.style.top = '15%'; // Higher position in exterior view (moved up by 5%)
            } else {
                lyricsContainer.style.top = '65%'; // Lower position in interior view (moved up by 5%)
            }
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
    
    // Make furniture and objects react to audio
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
    
    // Apply color modulation to all objects with materials in the scene
    scene.traverse(object => {
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
    
    // Calculate visualization intensity based on audio
    // Higher audio values = more intense visualization
    const intensityFactor = 0.3 + (bass + mid + high) * 0.2; // 0.3 to 0.9 range
    
    // Animate particles based on audio frequencies
    const animateParticles = (particles, frequencyBand, rotationFactor) => {
        particles.forEach((particle, index) => {
            // Use particle's index to create consistent patterns instead of random flickering
            const particlePhase = index * 0.1;
            const particleOffset = Math.sin(time * 0.3 + particlePhase) * 0.5 + 0.5; // 0 to 1 range
            
            // Scale with audio and oscillation (never disappear completely)
            const baseScale = 0.6 + particleOffset * 0.3; // Base oscillation
            const audioScale = baseScale + frequencyBand * 0.5; // Add audio reactivity
            particle.scale.set(audioScale, audioScale, audioScale);
            
            // Position animation - smoother movement
            particle.position.x += Math.sin(time * 0.2 + particlePhase) * frequencyBand * 0.02;
            particle.position.y += Math.sin(time * 0.3 + particlePhase) * frequencyBand * 0.015;
            particle.position.z += Math.cos(time * 0.25 + particlePhase) * frequencyBand * 0.02;
            
            // Rotation animation - steady rotation based on audio levels
            particle.rotation.x += frequencyBand * rotationFactor * 0.03;
            particle.rotation.y += frequencyBand * rotationFactor * 0.02;
            particle.rotation.z += frequencyBand * rotationFactor * 0.025;
            
            // Color shifts based on audio frequency
            const intensity = 0.5 + frequencyBand * 0.5;
            
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
            
            // Opacity based on audio and phase - smooth fade in/out
            const baseOpacity = 0.4 + particleOffset * 0.3; // 0.4 to 0.7 range
            const audioOpacity = Math.min(1.0, baseOpacity + frequencyBand * 0.3); // Add audio reactivity
            particle.material.opacity = audioOpacity;
            
            // Always visible, but opacity and scale changes with audio
            particle.visible = true;
        });
    };
    
    // Animate different shapes based on different frequency bands
    animateParticles(elements.particles.tetrahedrons, bass, 0.8);     // Bass controls tetrahedrons
    animateParticles(elements.particles.octahedrons, mid, 0.6);       // Mid frequencies control octahedrons
    animateParticles(elements.particles.dodecahedrons, high, 0.4);    // High frequencies control dodecahedrons
    animateParticles(elements.particles.icosahedrons, (bass + mid + high) / 3, 0.5); // All frequencies control icosahedrons
    
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

// Make furniture react to the music
const updateFurnitureReactions = (interiorElements, bass, mid, high, time) => {
    // Make speakers "bump" with the bass
    if (interiorElements.speakers) {
        interiorElements.speakers.forEach(speaker => {
            if (speaker) {
                speaker.scale.set(
                    1.0 + bass * 0.15, 
                    1.0 + bass * 0.1, 
                    1.0 + bass * 0.15
                );
                
                // Update speaker glow based on bass
                speaker.traverse(child => {
                    if (child.isMesh && child.material && child.material.uniforms && 
                        child.material.uniforms.glowIntensity) {
                        child.material.uniforms.glowIntensity.value = 0.45 + bass * 0.4;
                    }
                });
            }
        });
    }
    
    // Make booth tables react to mid frequencies
    if (interiorElements.dinerBooths) {
        interiorElements.dinerBooths.forEach(booth => {
            if (booth) {
                // Find the table part within the booth
                booth.traverse(child => {
                    if (child.name === 'boothTable' && child.material && 
                        child.material.uniforms && child.material.uniforms.glowIntensity) {
                        child.material.uniforms.glowIntensity.value = 0.36 + mid * 0.25;
                    }
                });
            }
        });
    }
    
    // Make bar stools glow with high frequencies
    if (interiorElements.barStools) {
        interiorElements.barStools.forEach(stool => {
            if (stool) {
                stool.traverse(child => {
                    if (child.isMesh && child.material && child.material.uniforms && 
                        child.material.uniforms.glowIntensity) {
                        child.material.uniforms.glowIntensity.value = 0.27 + high * 0.3;
                    }
                });
            }
        });
    }
    
    // Make fairy lights react to high frequencies
    if (interiorElements.fairies) {
        interiorElements.fairies.forEach((fairy, index) => {
            // Increased movement based on high frequencies
            fairy.position.y = Math.sin(time * 0.5 + index * 0.5) * (0.1 + high * 0.2);
            // Pulse scale with high frequencies
            const scale = 1.0 + high * 0.5;
            fairy.scale.set(scale, scale, scale);
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

export { 
    setupAudio, 
    createAudioReactiveElements, 
    updateAudioReactiveElements,
    updateSceneReference
}; 