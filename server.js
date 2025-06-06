// server.js
// This server uses Express to handle web requests and Puppeteer to scrape the Wistia page.

const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
// Render sets the PORT environment variable.
const PORT = process.env.PORT || 3000;

// Serve the static frontend file (index.html)
app.use(express.static(path.join(__dirname, 'public')));

/**
 * API Endpoint: /api/get-duration
 * Expects a 'url' query parameter with the Wistia folder URL.
 */
app.get('/api/get-duration', async (req, res) => {
    const wistiaUrl = req.query.url;

    if (!wistiaUrl) {
        return res.status(400).json({ error: 'URL query parameter is required.' });
    }
    try {
        new URL(wistiaUrl);
    } catch (error) {
        return res.status(400).json({ error: 'Invalid URL provided.' });
    }

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ],
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        await page.goto(wistiaUrl, { waitUntil: 'domcontentloaded' });

        // Wait for the specific container for each video to appear on the page.
        // Based on the provided HTML, 'div.MediaContainer-iGTxDE' is the correct selector.
        await page.waitForSelector('div.MediaContainer-iGTxDE', { timeout: 30000 });


        // Evaluate the page by parsing the DOM for <time> tags.
        const totalSeconds = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            let seconds = 0;

            const parseTime = (timeStr) => {
                const parts = timeStr.trim().split(':').map(Number);
                if (parts.length === 3) { // HH:MM:SS
                    return parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (parts.length === 2) { // MM:SS
                    return parts[0] * 60 + parts[1];
                } else if (parts.length === 1) { // SS
                    return parts[0];
                }
                return 0;
            };

            // **CORRECTED SELECTOR**: Use the class for the div that wraps each individual video item.
            const videoItems = document.querySelectorAll('div.MediaContainer-iGTxDE');
            if (videoItems.length === 0) {
                return null;
            }

            videoItems.forEach(item => {
                // The section title is in a sibling element *before* the list of videos.
                // We need to find the collapsible group this video belongs to.
                const sectionContainer = item.closest('.sc-fXSgeo'); // This is the container for the whole section
                let sectionName = '';
                if (sectionContainer) {
                    const titleEl = sectionContainer.querySelector('.sc-jXbUNg.sc-bbSZdi');
                    if (titleEl) {
                        sectionName = titleEl.textContent.trim();
                    }
                }

                if (!EXCLUDED_SECTIONS.includes(sectionName)) {
                    const timeEl = item.querySelector('time');
                    if (timeEl) {
                        seconds += parseTime(timeEl.textContent);
                    }
                }
            });

            return seconds;
        });

        if (totalSeconds === null) {
            throw new Error('Could not find any video items on the page with the expected structure.');
        }

        // --- Success Response ---
        res.json({ totalSeconds });

    } catch (error) {
        console.error('Scraping failed:', error);
        res.status(500).json({ error: error.message || 'An unexpected error occurred during scraping.' });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
