const backgroundPalettes = [
    {
        base: '#071a3d',
        baseDeep: '#030d21',
        primary: '#145da0',
        secondary: '#2e8bc0',
        tertiary: '#30c7b5',
        accent: '#88ecff',
        highlight: '#d9f8ff'
    },
    {
        base: '#1a103d',
        baseDeep: '#09041a',
        primary: '#5b2c83',
        secondary: '#a03d8f',
        tertiary: '#e26d8f',
        accent: '#ffd6f7',
        highlight: '#ffe4f2'
    },
    {
        base: '#102a21',
        baseDeep: '#05150f',
        primary: '#1f7a5c',
        secondary: '#35a87f',
        tertiary: '#52c7b8',
        accent: '#d8ffea',
        highlight: '#f1ffcc'
    },
    {
        base: '#31130d',
        baseDeep: '#140704',
        primary: '#8f3f2b',
        secondary: '#d97b2d',
        tertiary: '#d95b6a',
        accent: '#ffe4c7',
        highlight: '#fff1d6'
    },
    {
        base: '#1b1f3b',
        baseDeep: '#080b18',
        primary: '#304ffe',
        secondary: '#00b8d4',
        tertiary: '#42e2b8',
        accent: '#d5f6ff',
        highlight: '#e6ddff'
    },
    {
        base: '#25112c',
        baseDeep: '#0d0512',
        primary: '#6d2e7d',
        secondary: '#c24f7b',
        tertiary: '#f0a35e',
        accent: '#ffe0d6',
        highlight: '#fff2c6'
    }
];

function hexToRgb(hex) {
    const normalizedHex = hex.replace('#', '');
    const sanitizedHex = normalizedHex.length === 3
        ? normalizedHex.split('').map((char) => char + char).join('')
        : normalizedHex;

    const colorValue = Number.parseInt(sanitizedHex, 16);

    return {
        red: (colorValue >> 16) & 255,
        green: (colorValue >> 8) & 255,
        blue: colorValue & 255
    };
}

function withAlpha(hex, alpha) {
    const { red, green, blue } = hexToRgb(hex);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function toCssVariableName(name) {
    return `--bg-${name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`;
}

const selectedPalette = backgroundPalettes[Math.floor(Math.random() * backgroundPalettes.length)];
const rootStyle = document.documentElement.style;
const paletteWithGlow = {
    ...selectedPalette,
    glow: withAlpha(selectedPalette.accent, 0.26),
    glowSoft: withAlpha(selectedPalette.highlight, 0.22),
    glowContrast: withAlpha(selectedPalette.tertiary, 0.18)
};

Object.entries(paletteWithGlow).forEach(([key, value]) => {
    rootStyle.setProperty(toCssVariableName(key), value);
});
