// server.js
// This server uses Express to handle web requests and Puppeteer to scrape the Wistia page.

const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// **PERFORMANCE OPTIMIZATION**: We will launch the browser once when the server starts,
// and then reuse this single browser instance for all incoming requests. This is much faster.
let browserInstance;

async function initializeBrowser() {
    console.log('Initializing a new persistent browser instance...');
    browserInstance = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            // Note: --single-process is often for more resource-constrained environments.
            // With 2vCPUs, we can let Chromium manage its processes, which can be more stable.
            '--disable-gpu'
        ],
    });
    console.log('Browser instance initialized successfully.');
    
    // Gracefully close the browser when the server shuts down
    process.on('SIGINT', async () => {
        if (browserInstance) await browserInstance.close();
        process.exit();
    });
    process.on('SIGTERM', async () => {
        if (browserInstance) await browserInstance.close();
        process.exit();
    });
}

/**
 * API Endpoint: /api/get-duration
 * Now uses the persistent browser instance.
 */
app.get('/api/get-duration', async (req, res) => {
    const wistiaUrl = req.query.url;

    if (!wistiaUrl) {
        return res.status(400).json({ error: 'URL query parameter is required.' });
    }

    // Restrict to URLs containing 'wistia'
    if (!wistiaUrl.toLowerCase().includes('wistia')) {
        return res.status(400).json({ error: 'Only Wistia URLs are allowed.' });
    }

    let page = null;
    try {
        // Get a new page from the existing browser instance.
        page = await browserInstance.newPage();

        // Forward browser console messages to Node.js terminal
        page.on('console', msg => {
            for (let i = 0; i < msg.args().length; ++i)
                console.log(`[browser] ${msg.args()[i]}`);
        });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await page.goto(wistiaUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); // Increased timeout

        const finalUrl = page.url();
        if (finalUrl.includes('/session/new')) {
            throw new Error('This Wistia folder is private and requires a login.');
        }

        // "Smart wait" with scrolling to trigger lazy-loaded content.
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                let lastHeight = 0;
                let stableChecks = 0;
                const maxStableChecks = 5;
                let totalChecks = 0;

                const interval = setInterval(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    const currentHeight = document.body.scrollHeight;
                    if (currentHeight > 0 && currentHeight === lastHeight) {
                        stableChecks++;
                    } else {
                        stableChecks = 0;
                        lastHeight = currentHeight;
                    }

                    if (stableChecks >= maxStableChecks) {
                        clearInterval(interval);
                        resolve();
                    }
                    
                    totalChecks++;
                    if (totalChecks > 120) { // 60 second timeout
                        clearInterval(interval);
                        reject(new Error("Page did not stabilize within 60 seconds."));
                    }
                }, 500);
            });
        });

        // Aggressively reveal any "SHOW MORE" / "VIEW MORE" items (scroll + dispatch real mouse events)
        await page.evaluate(async () => {

            function isVisible(el) {
                return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            }

            function findShowMoreCandidates() {
                const nodes = Array.from(document.querySelectorAll('button, a, span, div'));
                return nodes.filter(el => {
                    if (!el || !el.textContent) return false;
                    const txt = el.textContent.replace(/\s+/g, ' ').trim();
                    if (!txt) return false;
                    const low = txt.toLowerCase();
                    // Match exact or contained phrases, tolerant to case/whitespace
                    if (low === 'show more' || low === 'view more') return true;
                    if (/\bshow more\b/.test(low) || /\bview more\b/.test(low)) return true;
                    return false;
                }).filter(isVisible);
            }

            function findRemainingNodes() {
                const nodes = Array.from(document.querySelectorAll('*'));
                return nodes.filter(el => {
                    if (!el || !el.textContent) return false;
                    return /remaining/i.test(el.textContent) && isVisible(el);
                });
            }

            const sleep = (ms) => new Promise(r => setTimeout(r, ms));

            let attempts = 0;
            const maxAttempts = 40;
            while (attempts < maxAttempts) {
                // Scroll to bottom to trigger lazy loading
                window.scrollTo(0, document.body.scrollHeight);
                await sleep(400);

                const buttons = findShowMoreCandidates();
                if (buttons.length === 0) {
                    // fallback: try "remaining" nodes that sometimes are clickable
                    const rem = findRemainingNodes();
                    if (rem.length === 0) break;
                    for (const el of rem) {
                        try {
                            el.scrollIntoView({ behavior: 'auto', block: 'center' });
                            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                            await sleep(500);
                        } catch (e) { /* ignore and continue */ }
                    }
                    attempts++;
                    continue;
                }

                // Click each found button/link/span/div
                for (const btn of buttons) {
                    try {
                        btn.scrollIntoView({ behavior: 'auto', block: 'center' });
                        // Use a real mouse event to trigger framework handlers
                        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        // extra click just in case
                        await sleep(300);
                    } catch (e) {
                        // ignore
                    }
                }

                // wait for any newly loaded items to render
                await sleep(600);
                attempts++;
            }

            // final small scroll to ensure any newly revealed videos load
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(500);
        });

const calculationData = await page.evaluate(() => {
    const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files', 'Editing Dump', 'Unedited', 'Holding Pen', 'Archive Videos', 'Archive'];
    const titleElement = document.querySelector('h1');
    const courseTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Course';
    const sectionData = {};
    const result = {
        totalSeconds: 0,
        videoCount: 0,
        courseTitle: courseTitle,
        sectionDetails: [],
    };
    const parseTime = (timeStr) => {
        const parts = timeStr.trim().split(':').map(Number);
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 1) return parts[0];
        return 0;
    };

    const sectionHeaders = Array.from(document.querySelectorAll('.sc-fhfEft.dFEJoJ'));
sectionHeaders.forEach(sectionHeader => {
    const sectionName = sectionHeader.textContent.trim();
    if (EXCLUDED_SECTIONS.some(ex => sectionName.includes(ex))) return;

    // Find all video nodes within this section
    let sectionContainer = sectionHeader.parentElement;
    const videosInSection = Array.from(sectionContainer.querySelectorAll('*')).filter(el => {
        return el.textContent.trim().match(/^Video\s+\d{1,2}:\d{2}(:\d{2})?$/);
    });

    videosInSection.forEach(node => {
        const timeStr = node.textContent.replace(/^Video\s+/, '').trim();
        const duration = parseTime(timeStr);
        result.totalSeconds += duration;
        result.videoCount++;
        if (!sectionData[sectionName]) {
            sectionData[sectionName] = { videoCount: 0, totalDuration: 0 };
        }
        sectionData[sectionName].videoCount++;
        sectionData[sectionName].totalDuration += duration;
    });
});

    result.sectionDetails = Object.keys(sectionData).map(name => ({
        name,
        videoCount: sectionData[name].videoCount,
        totalDuration: sectionData[name].totalDuration
    }));
    return result;
});

        if (calculationData === null || calculationData.videoCount === 0) {
            throw new Error('Could not find any video items on the page with the expected structure.');
        }

        console.log(`Calculation complete: ${calculationData.videoCount} videos, ${calculationData.totalSeconds} seconds.`);
        res.json(calculationData);

    } catch (error) {
        console.error('Scraping failed:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred during scraping.' });
    } finally {
        // **OPTIMIZATION**: We only close the page, not the entire browser.
        if (page) await page.close();
    }
});

// Start the server only after the browser has been initialized.
initializeBrowser().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
});
