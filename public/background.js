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
    'https://app.box.com/shared/static/0b6z6fplug7gm50lu6cdbjwln18qvehi.jpg',
    'https://app.box.com/shared/static/f7nxd7kd7dolccq5kkbwnezbxtnf0pld.png',
    'https://app.box.com/shared/static/ktwhhugy2iz094bg9o1s5qqyemhrrhzg.jpg',
    'https://app.box.com/shared/static/k7c2hutfdpz2to1mnf7nld8c9z4c7o85.png',
    'https://app.box.com/shared/static/hgxoproazqsxbklq5nmpwdcw87uj3n1e.png',
    'https://app.box.com/shared/static/bmr92txiet22tl126y356v5o23r011ra.png'
];

// Select a random image from the array
const randomImageUrl = backgroundImages[Math.floor(Math.random() * backgroundImages.length)];

// Apply the random image to the CSS variable on the root element
document.documentElement.style.setProperty('--bg-image', `url('${randomImageUrl}')`);