# 🧮 Advanced Scientific Calculator

A groundbreaking scientific calculator with stunning 3D animations and modern glassmorphic design.

![Calculator Preview](calculator-preview.png)

## ✨ Features

### 🔢 Mathematical Functions
- **Basic Operations:** Addition, subtraction, multiplication, division
- **Trigonometric Functions:** sin, cos, tan, sin⁻¹, cos⁻¹, tan⁻¹
- **Logarithms:** log (base 10), ln (natural log)
- **Advanced:** Square root, power, factorial, reciprocal, absolute value
- **Constants:** π (pi), e (Euler's number)
- **Angle Modes:** DEG (degrees) and RAD (radians)

### 🎨 Design Features
- **Glassmorphic UI:** Semi-transparent panels with backdrop blur
- **3D Animations:** Floating geometric shapes (cubes, spheres, pyramids, torus)
- **Interactive:** Shapes react to mouse movement
- **Gradient Buttons:** Modern gradient designs with ripple effects
- **Glow Effects:** Purple accent glows throughout
- **Smooth Animations:** Floating calculator, shimmer effects, button transitions

### 🚀 User Experience
- **Auto-Closing Brackets:** Function brackets close automatically
- **Keyboard Support:** Full keyboard input support
- **Error Handling:** Visual shake animation for errors
- **Responsive Design:** Works on all screen sizes
- **Visual Feedback:** Button press animations and hover effects

## 🎯 How to Use

### Basic Calculations
1. Click number buttons or type on keyboard
2. Click operator buttons (+, -, ×, ÷)
3. Press `=` or Enter to calculate

### Trigonometric Functions
1. Click a trig function button (sin, cos, tan, etc.)
2. The bracket opens and closes automatically
3. Type your number (e.g., 120)
4. Press `=` to calculate
5. **Example:** tan⁻¹(120) = 89.52° (in DEG mode)

### Angle Mode
- Click **DEG** for degrees (default)
- Click **RAD** for radians
- The active mode is highlighted in purple

### Keyboard Shortcuts
- **Numbers:** 0-9
- **Operators:** +, -, *, /
- **Decimal:** .
- **Parentheses:** ( )
- **Calculate:** Enter or =
- **Clear:** Escape
- **Backspace:** Delete last character

## 🛠️ Technical Details

### Files Structure
```
├── index.html          # Main HTML structure
├── styles.css          # Modern styling with animations
├── script.js           # Calculator logic and functions
├── animation.js        # 3D animation system
├── calculator-preview.png  # Preview image
├── README.md          # This file
└── CHANGES.md         # Detailed changelog
```

### Technologies Used
- **HTML5 Canvas:** For 3D animations
- **Vanilla JavaScript:** No frameworks needed
- **CSS3:** Advanced animations and effects
- **Glassmorphism:** Modern UI design trend

### Browser Support
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 🐛 Bug Fixes

### Fixed Issues
1. ✅ **Trigonometric Functions:** All trig functions now work correctly
2. ✅ **Auto-Closing Brackets:** Functions automatically close brackets
3. ✅ **Expression Evaluation:** Improved regex-based parsing
4. ✅ **Error Handling:** Better error messages and recovery

### What Was Wrong Before
- Trigonometric functions like `tan⁻¹(120)` returned errors
- Users had to manually close brackets after typing `sin(`
- Parentheses counting logic was broken
- Basic styling with no animations

## 🎨 Design Philosophy

### Visual Hierarchy
1. **Background:** Pure black with 3D shapes
2. **Calculator:** Glassmorphic panel with purple glow
3. **Display:** Gradient background with shimmer effect
4. **Buttons:** Categorized by color (numbers, operators, functions)

### Color Palette
- **Primary:** Purple (#8a2be2) and Indigo (#4b0082)
- **Accent:** Cyan (#00d2ff), Orange (#ffa502), Red (#ff4757)
- **Background:** Pure Black (#0a0a0a)
- **Text:** White with purple glow

### Animation System
- **Shapes:** 15 floating 3D shapes
- **Types:** Cubes, spheres, pyramids, torus
- **Movement:** Continuous floating with depth
- **Interaction:** Mouse attraction effect
- **Performance:** Optimized with requestAnimationFrame

## 📱 Responsive Design

### Desktop (> 500px)
- Full-size calculator with all features
- Large buttons and display
- Full 3D animation system

### Mobile (< 500px)
- Compact layout
- Smaller buttons and text
- Optimized animations

## 🔮 Future Enhancements

Potential features for future versions:
- [ ] Scientific notation support
- [ ] History of calculations
- [ ] More 3D shape types
- [ ] Custom color themes
- [ ] Graph plotting
- [ ] Matrix operations
- [ ] Complex numbers

## 📄 License

This project is open source and available for educational purposes.

## 🤝 Contributing

Feel free to fork, modify, and improve this calculator!

---

**Made with ❤️ and lots of math**

*Enjoy calculating in style!* ✨
