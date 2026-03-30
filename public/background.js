const backgroundPalettes = [
    {
        base: '#071a3d',
        primary: '#145da0',
        secondary: '#2e8bc0',
        accent: '#b1f0ff',
        glow: 'rgba(177, 240, 255, 0.28)'
    },
    {
        base: '#1a103d',
        primary: '#5b2c83',
        secondary: '#a03d8f',
        accent: '#ffd6f7',
        glow: 'rgba(255, 214, 247, 0.24)'
    },
    {
        base: '#102a21',
        primary: '#1f7a5c',
        secondary: '#35a87f',
        accent: '#d8ffea',
        glow: 'rgba(216, 255, 234, 0.24)'
    },
    {
        base: '#31130d',
        primary: '#8f3f2b',
        secondary: '#d97b2d',
        accent: '#ffe4c7',
        glow: 'rgba(255, 228, 199, 0.24)'
    },
    {
        base: '#1b1f3b',
        primary: '#304ffe',
        secondary: '#00b8d4',
        accent: '#d5f6ff',
        glow: 'rgba(213, 246, 255, 0.28)'
    }
];

const selectedPalette = backgroundPalettes[Math.floor(Math.random() * backgroundPalettes.length)];
const rootStyle = document.documentElement.style;

rootStyle.setProperty('--bg-base', selectedPalette.base);
rootStyle.setProperty('--bg-primary', selectedPalette.primary);
rootStyle.setProperty('--bg-secondary', selectedPalette.secondary);
rootStyle.setProperty('--bg-accent', selectedPalette.accent);
rootStyle.setProperty('--bg-glow', selectedPalette.glow);
