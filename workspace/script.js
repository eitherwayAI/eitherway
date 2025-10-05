let display = document.getElementById('display');
let expression = document.getElementById('expression');
let currentInput = '0';
let currentExpression = '';
let angleMode = 'deg'; // 'deg' or 'rad'
let lastResult = null;

// Initialize display
updateDisplay();

function updateDisplay() {
    display.textContent = currentInput;
    expression.textContent = currentExpression;
}

function setAngleMode(mode) {
    angleMode = mode;
    document.getElementById('deg-btn').classList.toggle('active', mode === 'deg');
    document.getElementById('rad-btn').classList.toggle('active', mode === 'rad');
}

function appendNumber(num) {
    if (currentInput === '0' || currentInput === 'Error') {
        if (num === 'π') {
            currentInput = Math.PI.toString();
        } else if (num === 'e') {
            currentInput = Math.E.toString();
        } else {
            currentInput = num;
        }
    } else {
        if (num === 'π') {
            currentInput += '*' + Math.PI.toString();
        } else if (num === 'e') {
            currentInput += '*' + Math.E.toString();
        } else {
            currentInput += num;
        }
    }
    updateDisplay();
}

function appendOperator(op) {
    if (currentInput === 'Error') {
        clearAll();
    }
    
    // Handle special case for opening parenthesis after a number
    if (op === '(' && currentInput !== '0' && !isOperator(currentInput.slice(-1))) {
        currentInput += '*';
    }
    
    currentInput += op;
    updateDisplay();
}

function appendFunction(func) {
    if (currentInput === '0' || currentInput === 'Error') {
        currentInput = func;
    } else if (!isOperator(currentInput.slice(-1)) && currentInput.slice(-1) !== '(') {
        currentInput += '*' + func;
    } else {
        currentInput += func;
    }
    
    // Auto-close bracket for functions
    setTimeout(() => {
        currentInput += ')';
        updateDisplay();
        display.classList.add('bracket-hint');
        setTimeout(() => display.classList.remove('bracket-hint'), 200);
    }, 0);
    
    updateDisplay();
}

function isOperator(char) {
    return ['+', '-', '*', '/', '^', '%'].includes(char);
}

function clearAll() {
    currentInput = '0';
    currentExpression = '';
    lastResult = null;
    updateDisplay();
}

function clearEntry() {
    currentInput = '0';
    updateDisplay();
}

function backspace() {
    if (currentInput === 'Error') {
        clearAll();
        return;
    }
    
    if (currentInput.length > 1) {
        currentInput = currentInput.slice(0, -1);
    } else {
        currentInput = '0';
    }
    updateDisplay();
}

function toggleSign() {
    if (currentInput === 'Error' || currentInput === '0') return;
    
    if (currentInput.startsWith('-')) {
        currentInput = currentInput.substring(1);
    } else {
        currentInput = '-' + currentInput;
    }
    updateDisplay();
}

function square() {
    try {
        let value = evaluateExpression(currentInput);
        currentExpression = currentInput + '²';
        currentInput = (value * value).toString();
        updateDisplay();
    } catch (error) {
        showError();
    }
}

function reciprocal() {
    try {
        let value = evaluateExpression(currentInput);
        if (value === 0) {
            showError();
            return;
        }
        currentExpression = '1/(' + currentInput + ')';
        currentInput = (1 / value).toString();
        updateDisplay();
    } catch (error) {
        showError();
    }
}

function factorial() {
    try {
        let value = evaluateExpression(currentInput);
        if (value < 0 || !Number.isInteger(value)) {
            showError();
            return;
        }
        currentExpression = currentInput + '!';
        currentInput = calculateFactorial(value).toString();
        updateDisplay();
    } catch (error) {
        showError();
    }
}

function calculateFactorial(n) {
    if (n === 0 || n === 1) return 1;
    if (n > 170) throw new Error('Number too large');
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

function calculate() {
    if (currentInput === 'Error') {
        clearAll();
        return;
    }
    
    try {
        currentExpression = currentInput;
        let result = evaluateExpression(currentInput);
        currentInput = result.toString();
        lastResult = result;
        updateDisplay();
    } catch (error) {
        showError();
    }
}

function evaluateExpression(expr) {
    // Replace mathematical symbols with JavaScript equivalents
    expr = expr.replace(/π/g, Math.PI.toString());
    expr = expr.replace(/e/g, Math.E.toString());
    expr = expr.replace(/×/g, '*');
    expr = expr.replace(/÷/g, '/');
    expr = expr.replace(/−/g, '-');
    
    // Handle power operator
    expr = expr.replace(/\^/g, '**');
    
    // Create evaluation context
    const toRadians = (degrees) => {
        if (angleMode === 'deg') {
            return degrees * Math.PI / 180;
        }
        return degrees;
    };
    
    const toDegrees = (radians) => {
        if (angleMode === 'deg') {
            return radians * 180 / Math.PI;
        }
        return radians;
    };
    
    // Handle trigonometric functions - wrap the argument, not add extra parens
    // Use a more sophisticated replacement that handles nested parentheses
    expr = expr.replace(/sin\(([^)]+)\)/g, (match, arg) => {
        return `Math.sin(toRadians(${arg}))`;
    });
    expr = expr.replace(/cos\(([^)]+)\)/g, (match, arg) => {
        return `Math.cos(toRadians(${arg}))`;
    });
    expr = expr.replace(/tan\(([^)]+)\)/g, (match, arg) => {
        return `Math.tan(toRadians(${arg}))`;
    });
    
    // Handle inverse trig functions
    expr = expr.replace(/asin\(([^)]+)\)/g, (match, arg) => {
        return `toDegrees(Math.asin(${arg}))`;
    });
    expr = expr.replace(/acos\(([^)]+)\)/g, (match, arg) => {
        return `toDegrees(Math.acos(${arg}))`;
    });
    expr = expr.replace(/atan\(([^)]+)\)/g, (match, arg) => {
        return `toDegrees(Math.atan(${arg}))`;
    });
    
    // Handle logarithms
    expr = expr.replace(/log\(([^)]+)\)/g, (match, arg) => {
        return `Math.log10(${arg})`;
    });
    expr = expr.replace(/ln\(([^)]+)\)/g, (match, arg) => {
        return `Math.log(${arg})`;
    });
    
    // Handle square root
    expr = expr.replace(/sqrt\(([^)]+)\)/g, (match, arg) => {
        return `Math.sqrt(${arg})`;
    });
    
    // Handle absolute value
    expr = expr.replace(/abs\(([^)]+)\)/g, (match, arg) => {
        return `Math.abs(${arg})`;
    });
    
    // Evaluate the expression
    try {
        // Use Function constructor for safer evaluation
        const func = new Function('Math', 'toRadians', 'toDegrees', `return ${expr}`);
        const result = func(Math, toRadians, toDegrees);
        
        if (!isFinite(result)) {
            throw new Error('Invalid result');
        }
        
        // Round to avoid floating point errors
        return Math.round(result * 1e10) / 1e10;
    } catch (error) {
        throw new Error('Invalid expression');
    }
}

function showError() {
    currentInput = 'Error';
    display.classList.add('error');
    updateDisplay();
    
    setTimeout(() => {
        display.classList.remove('error');
    }, 300);
}

// Keyboard support
document.addEventListener('keydown', (event) => {
    const key = event.key;
    
    if (key >= '0' && key <= '9') {
        appendNumber(key);
    } else if (key === '.') {
        appendNumber('.');
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        appendOperator(key);
    } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        calculate();
    } else if (key === 'Escape') {
        clearAll();
    } else if (key === 'Backspace') {
        event.preventDefault();
        backspace();
    } else if (key === '(' || key === ')') {
        appendOperator(key);
    }
});
