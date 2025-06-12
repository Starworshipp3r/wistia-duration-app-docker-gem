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

    let page = null;
    try {
        // Get a new page from the existing browser instance.
        page = await browserInstance.newPage();
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

        const calculationData = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            const titleElement = document.querySelector('.TitleAndDescriptionContainer-wZVJS h1');
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
            const videoItems = document.querySelectorAll('div.MediaContainer-iGTxDE');
            if (videoItems.length === 0) return null;

            videoItems.forEach(item => {
                const sectionContainer = item.closest('.sc-fXSgeo');
                let sectionName = '';
                if (sectionContainer) {
                    const titleEl = sectionContainer.querySelector('.sc-jXbUNg.sc-bbSZdi');
                    if (titleEl) sectionName = titleEl.textContent.trim();
                }
                if (!EXCLUDED_SECTIONS.includes(sectionName) && sectionName) {
                    const timeEl = item.querySelector('time');
                    if (timeEl) {
                        const duration = parseTime(timeEl.textContent);
                        result.totalSeconds += duration;
                        result.videoCount++;
                        if (!sectionData[sectionName]) {
                            sectionData[sectionName] = { videoCount: 0, totalDuration: 0 };
                        }
                        sectionData[sectionName].videoCount++;
                        sectionData[sectionName].totalDuration += duration;
                    }
                }
            });
            result.sectionDetails = Object.keys(sectionData).map(name => {
                return { name: name, videoCount: sectionData[name].videoCount, totalDuration: sectionData[name].totalDuration };
            });
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
