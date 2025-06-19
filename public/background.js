// --- Random Background Image Script ---
const backgroundImages = [
    'https://app.box.com/shared/static/blkmwh9wa10rnb85nnalpm7krgusr4y7.jpg',
    'https://app.box.com/shared/static/d3hjajjrdbn9309o9lmhclw05r47k893.jpg',
    'https://app.box.com/shared/static/euq5qprpq8h7z9wdzcfpbqkcociwia91.jpg',
    'https://app.box.com/shared/static/lwdyunovc01sixef8laq2rkoj3rbdart.jpg',
    'https://app.box.com/shared/static/83ch847bc5gt0fvcuuokcv6ff8l4pqj9.jpg',
    'https://app.box.com/shared/static/iwgdfrbubg9aai3o9qgsatxw3uyvra38.jpg',
    'https://app.box.com/shared/static/71uhzwdvm82n1qqcl0ebm2z2bpyncfh3.jpg',
    'https://app.box.com/shared/static/o2egtoyz541lyaj2ucn21xe1cnonvgyv.jpg',
    'https://app.box.com/shared/static/0b6z6fplug7gm50lu6cdbjwln18qvehi.jpg'
];

// Select a random image from the array
const randomImageUrl = backgroundImages[Math.floor(Math.random() * backgroundImages.length)];

// Apply the random image to the CSS variable on the root element
document.documentElement.style.setProperty('--bg-image', `url('${randomImageUrl}')`);