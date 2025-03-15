# 8-Bit Wireframe Karaoke Bar Animation

A Three.js application that creates an 8-bit wireframe aesthetic with a black background featuring a karaoke bar inspired by song lyrics. This project uses several techniques to achieve the retro look:

1. Low-resolution rendering using a WebGLRenderTarget with a low pixel ratio
2. Wireframe rendering of geometric shapes
3. Pixel-perfect rendering with disabled antialiasing
4. Low-poly geometric models

## Features

### Exterior Scene
- Complete street scene with a karaoke bar building, street, and sidewalk
- Animated neon "KARAOKE" sign with flashing letters
- Street lamps with glowing lights
- Moving cars on the street

### Interior Scene
- Complete karaoke bar interior with bar counter, tables, chairs, and corner booth
- Karaoke stage with microphone and TV screen for lyrics
- Spinning fairy decorations above the stage (as mentioned in the lyrics)
- Narragansett beer "tall boy" cans on tables
- Karaoke signup sheet with animated pen
- Glowing blue walls for better visibility against the black background
- All the elements referenced in the song lyrics

### Seamless Scene Transitions
- Door animation that swings open as you approach the bar
- Smooth camera movement from outside to inside
- Gradual fade-in of interior elements as you enter
- Unified scene with no hard cuts between exterior and interior
- Press the spacebar to toggle between scenes

## How to Run

Simply open the `index.html` file in a web browser, or run a local web server:

```bash
# Using Python 3's built-in HTTP server (port 8080)
python3 -m http.server 8080

# Then visit http://localhost:8080 in your browser
```

## Controls

- Click and drag to rotate the view
- Scroll to zoom in and out
- Press spacebar to toggle between exterior and interior scenes

## Song Lyrics That Inspired The Animation

```
karaoke at our favorite bar
I wanna sing away my cares
text me when you're on the bus
I'll order us a Gansett pair

my name upon the dotted line
fairies spinning above
cried when I did "Stuck With You"
that's the power of love

we can get a handle on anything they put us through
so kiss me in the corner booth. kiss me.
```

## Technology

- Three.js for 3D rendering
- WebGL shaders for post-processing effects
- Vanilla JavaScript for animation 