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

        // **RE-ADDED**: Check if we were redirected to a login page.
        const finalUrl = page.url();
        if (finalUrl.includes('/session/new')) {
            throw new Error('This Wistia folder is private and requires a login.');
        }

        // Use the "smart wait" logic to wait for all content to load by scrolling.
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let lastHeight = 0;
                let stableChecks = 0;
                const maxStableChecks = 5;
                const interval = setInterval(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    const currentHeight = document.body.scrollHeight;
                    if (currentHeight === lastHeight) {
                        stableChecks++;
                    } else {
                        stableChecks = 0;
                        lastHeight = currentHeight;
                    }
                    if (stableChecks >= maxStableChecks) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 500);
            });
        });

        const calculationData = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            
            const titleElement = document.querySelector('.TitleAndDescriptionContainer-wZVJS h1');
            const courseTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Course';

            const sectionCounts = {}; 

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
            if (videoItems.length === 0) {
                return null;
            }

            videoItems.forEach(item => {
                const sectionContainer = item.closest('.sc-fXSgeo');
                let sectionName = '';
                if (sectionContainer) {
                    const titleEl = sectionContainer.querySelector('.sc-jXbUNg.sc-bbSZdi');
                    if (titleEl) {
                        sectionName = titleEl.textContent.trim();
                    }
                }

                if (!EXCLUDED_SECTIONS.includes(sectionName) && sectionName) {
                    const timeEl = item.querySelector('time');
                    if (timeEl) {
                        result.totalSeconds += parseTime(timeEl.textContent);
                        result.videoCount++;
                        sectionCounts[sectionName] = (sectionCounts[sectionName] || 0) + 1;
                    }
                }
            });
            
            result.sectionDetails = Object.keys(sectionCounts).map(name => {
                return { name: name, videoCount: sectionCounts[name] };
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
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
