// 3D Animation Canvas
const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 3D Shape class
class Shape3D {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.z = Math.random() * 1000;
        this.size = Math.random() * 60 + 20;
        this.rotationX = Math.random() * Math.PI * 2;
        this.rotationY = Math.random() * Math.PI * 2;
        this.rotationZ = Math.random() * Math.PI * 2;
        this.rotationSpeedX = (Math.random() - 0.5) * 0.02;
        this.rotationSpeedY = (Math.random() - 0.5) * 0.02;
        this.rotationSpeedZ = (Math.random() - 0.5) * 0.02;
        this.velocityX = (Math.random() - 0.5) * 0.5;
        this.velocityY = (Math.random() - 0.5) * 0.5;
        this.velocityZ = (Math.random() - 0.5) * 2;
        this.type = Math.floor(Math.random() * 4); // 0: cube, 1: sphere, 2: pyramid, 3: torus
        this.color = this.getRandomColor();
        this.opacity = Math.random() * 0.3 + 0.1;
    }

    getRandomColor() {
        const colors = [
            'rgba(138, 43, 226, ',  // Purple
            'rgba(75, 0, 130, ',     // Indigo
            'rgba(0, 210, 255, ',    // Cyan
            'rgba(255, 71, 87, ',    // Red
            'rgba(255, 165, 2, ',    // Orange
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        // Update position
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.z += this.velocityZ;

        // Update rotation
        this.rotationX += this.rotationSpeedX;
        this.rotationY += this.rotationSpeedY;
        this.rotationZ += this.rotationSpeedZ;

        // Wrap around screen
        if (this.x < -100) this.x = canvas.width + 100;
        if (this.x > canvas.width + 100) this.x = -100;
        if (this.y < -100) this.y = canvas.height + 100;
        if (this.y > canvas.height + 100) this.y = -100;
        if (this.z < -500) this.z = 1000;
        if (this.z > 1000) this.z = -500;
    }

    draw() {
        ctx.save();
        
        // Calculate perspective
        const scale = 800 / (800 + this.z);
        const x = this.x;
        const y = this.y;
        const size = this.size * scale;

        ctx.globalAlpha = this.opacity * scale;
        ctx.translate(x, y);
        ctx.rotate(this.rotationZ);

        switch (this.type) {
            case 0: // Cube
                this.drawCube(size);
                break;
            case 1: // Sphere
                this.drawSphere(size);
                break;
            case 2: // Pyramid
                this.drawPyramid(size);
                break;
            case 3: // Torus
                this.drawTorus(size);
                break;
        }

        ctx.restore();
    }

    drawCube(size) {
        // Simple 2D projection of a rotating cube
        const vertices = [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ];

        const rotated = vertices.map(v => {
            let [x, y, z] = v;
            
            // Rotate around X axis
            let tempY = y * Math.cos(this.rotationX) - z * Math.sin(this.rotationX);
            let tempZ = y * Math.sin(this.rotationX) + z * Math.cos(this.rotationX);
            y = tempY;
            z = tempZ;
            
            // Rotate around Y axis
            let tempX = x * Math.cos(this.rotationY) + z * Math.sin(this.rotationY);
            tempZ = -x * Math.sin(this.rotationY) + z * Math.cos(this.rotationY);
            x = tempX;
            z = tempZ;
            
            return [x * size / 2, y * size / 2, z];
        });

        // Draw edges
        const edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];

        ctx.strokeStyle = this.color + this.opacity + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        edges.forEach(([start, end]) => {
            ctx.moveTo(rotated[start][0], rotated[start][1]);
            ctx.lineTo(rotated[end][0], rotated[end][1]);
        });
        
        ctx.stroke();
    }

    drawSphere(size) {
        // Draw a gradient circle
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size / 2);
        gradient.addColorStop(0, this.color + (this.opacity * 1.5) + ')');
        gradient.addColorStop(0.5, this.color + this.opacity + ')');
        gradient.addColorStop(1, this.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Add some rings for 3D effect
        ctx.strokeStyle = this.color + (this.opacity * 0.5) + ')';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, 0, size / 2, size / 4 * Math.cos(this.rotationX + i), this.rotationY, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    drawPyramid(size) {
        // Draw a 3D pyramid
        const height = size * 1.2;
        const base = size / 2;
        
        const vertices = [
            [0, -height / 2, 0],           // Top
            [-base, height / 2, -base],    // Base corners
            [base, height / 2, -base],
            [base, height / 2, base],
            [-base, height / 2, base]
        ];

        const rotated = vertices.map(v => {
            let [x, y, z] = v;
            
            // Rotate around X axis
            let tempY = y * Math.cos(this.rotationX) - z * Math.sin(this.rotationX);
            let tempZ = y * Math.sin(this.rotationX) + z * Math.cos(this.rotationX);
            y = tempY;
            z = tempZ;
            
            // Rotate around Y axis
            let tempX = x * Math.cos(this.rotationY) + z * Math.sin(this.rotationY);
            tempZ = -x * Math.sin(this.rotationY) + z * Math.cos(this.rotationY);
            x = tempX;
            z = tempZ;
            
            return [x, y, z];
        });

        // Draw edges
        ctx.strokeStyle = this.color + this.opacity + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Edges from top to base
        for (let i = 1; i <= 4; i++) {
            ctx.moveTo(rotated[0][0], rotated[0][1]);
            ctx.lineTo(rotated[i][0], rotated[i][1]);
        }
        
        // Base edges
        for (let i = 1; i <= 4; i++) {
            ctx.moveTo(rotated[i][0], rotated[i][1]);
            ctx.lineTo(rotated[i % 4 + 1][0], rotated[i % 4 + 1][1]);
        }
        
        ctx.stroke();
    }

    drawTorus(size) {
        // Draw a torus (donut shape)
        const outerRadius = size / 2;
        const innerRadius = size / 4;
        
        // Draw outer circle
        ctx.strokeStyle = this.color + this.opacity + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, outerRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw inner circle
        ctx.beginPath();
        ctx.arc(0, 0, innerRadius, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw cross sections for 3D effect
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i + this.rotationY;
            const x1 = Math.cos(angle) * outerRadius;
            const y1 = Math.sin(angle) * outerRadius * Math.sin(this.rotationX);
            const x2 = Math.cos(angle) * innerRadius;
            const y2 = Math.sin(angle) * innerRadius * Math.sin(this.rotationX);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    }
}

// Create shapes
const shapes = [];
const numShapes = 15;

for (let i = 0; i < numShapes; i++) {
    shapes.push(new Shape3D());
}

// Animation loop
function animate() {
    // Clear canvas with fade effect
    ctx.fillStyle = 'rgba(10, 10, 10, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update and draw shapes
    shapes.forEach(shape => {
        shape.update();
        shape.draw();
    });

    requestAnimationFrame(animate);
}

// Start animation
animate();

// Add mouse interaction
let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    // Influence nearby shapes
    shapes.forEach(shape => {
        const dx = mouseX - shape.x;
        const dy = mouseY - shape.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 200) {
            const force = (200 - distance) / 200;
            shape.velocityX += (dx / distance) * force * 0.1;
            shape.velocityY += (dy / distance) * force * 0.1;
        }
    });
});
