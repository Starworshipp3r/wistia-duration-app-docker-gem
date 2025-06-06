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

        // **IMPROVEMENT**: Instead of just waiting for the network, we now explicitly wait
        // for the container of the video list to appear on the page. This is far more reliable.
        await page.waitForSelector('.folder-video-item', { timeout: 30000 });


        // **NEW LOGIC**: Evaluate the page by parsing the DOM for <time> tags, as you suggested.
        // This is more robust than looking for a specific script variable.
        const totalSeconds = await page.evaluate(() => {
            // This function runs in the browser's context after the page is fully loaded.
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            let seconds = 0;

            // Helper function to parse time strings like "1:23:45" or "59:30" into seconds.
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

            // Find all the video items on the page.
            const videoItems = document.querySelectorAll('.folder-video-item');
            if (videoItems.length === 0) {
                // If we can't find any video items, we can't proceed.
                // Returning null will cause an error to be thrown on the server.
                return null;
            }

            videoItems.forEach(item => {
                // Find the section title for the current video item.
                const sectionContainer = item.closest('.folder-section');
                let sectionName = '';
                if (sectionContainer) {
                    const titleEl = sectionContainer.querySelector('.folder-section-title h2');
                    if (titleEl) {
                        sectionName = titleEl.textContent.trim();
                    }
                }

                // If the section is not in the exclusion list, process the video's time.
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
            // This error will be thrown if the page structure has changed and we can't find any '.folder-video-item' elements.
            throw new Error('Could not find any video items on the page. The page structure has likely changed.');
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
