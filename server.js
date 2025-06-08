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

        // **NEW "SMART WAIT" LOGIC**:
        // This function will run inside the browser and will only resolve its Promise
        // once the page height has stopped changing, indicating all content has loaded.
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                let lastHeight = 0;
                let stableChecks = 0;
                const maxStableChecks = 5; // Require 5 stable checks (2.5 seconds of stability)
                let totalChecks = 0;

                const interval = setInterval(() => {
                    const currentHeight = document.body.scrollHeight;
                    if (currentHeight > 0 && currentHeight === lastHeight) {
                        stableChecks++;
                    } else {
                        stableChecks = 0; // Reset counter if height changes
                        lastHeight = currentHeight;
                    }

                    // If height is stable for the required number of checks, we're done.
                    if (stableChecks >= maxStableChecks) {
                        clearInterval(interval);
                        resolve();
                    }
                    
                    // Failsafe timeout to prevent infinite loops
                    totalChecks++;
                    if (totalChecks > 60) { // 30 second timeout
                        clearInterval(interval);
                        reject(new Error("Page did not stabilize within 30 seconds."));
                    }
                }, 500);
            });
        });

        // This logic now runs only after the page has fully stabilized.
        const calculationData = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            
            const titleElement = document.querySelector('.TitleAndDescriptionContainer-wZVJS h1');
            const courseTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Course';

            const includedSectionsSet = new Set();
            const result = {
                totalSeconds: 0,
                videoCount: 0,
                courseTitle: courseTitle,
                includedSections: [],
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

                if (!EXCLUDED_SECTIONS.includes(sectionName)) {
                    const timeEl = item.querySelector('time');
                    if (timeEl) {
                        result.totalSeconds += parseTime(timeEl.textContent);
                        result.videoCount++;
                        if (sectionName) {
                            includedSectionsSet.add(sectionName);
                        }
                    }
                }
            });
            
            result.includedSections = Array.from(includedSectionsSet);
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
