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
    },
    {
        base: '#10252a',
        baseDeep: '#041015',
        primary: '#1d6f73',
        secondary: '#33b5a5',
        tertiary: '#7ed957',
        accent: '#dcfff0',
        highlight: '#f5ffd8'
    },
    {
        base: '#24152f',
        baseDeep: '#0c0611',
        primary: '#6c3fa4',
        secondary: '#b256d8',
        tertiary: '#ff8d5c',
        accent: '#ffe3ea',
        highlight: '#fff3d8'
    },
    {
        base: '#182236',
        baseDeep: '#060c18',
        primary: '#3e63dd',
        secondary: '#27b1bf',
        tertiary: '#f0c25e',
        accent: '#ffecc8',
        highlight: '#fff8dc'
    },
    {
        base: '#1f1d18',
        baseDeep: '#090806',
        primary: '#6e5a2b',
        secondary: '#b59a52',
        tertiary: '#7abf9a',
        accent: '#f5e7c8',
        highlight: '#fbf7df'
    },
    {
        base: '#29141a',
        baseDeep: '#10070a',
        primary: '#8e3756',
        secondary: '#d0616b',
        tertiary: '#f1a86a',
        accent: '#ffe0cf',
        highlight: '#fff2e5'
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
