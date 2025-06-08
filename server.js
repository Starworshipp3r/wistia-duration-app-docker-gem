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

        // **NEW ROBUST SELECTOR**: Wait for the test ID of the content blocks.
        await page.waitForSelector('[data-testid="collapsible-group-content"]', { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000)); // Brief wait for all content to settle.

        // **REWRITTEN LOGIC**: This function now uses stable data-testid attributes instead of brittle CSS classes.
        const calculationData = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            
            // Use a more generic selector for the main course title.
            const titleElement = document.querySelector('h1');
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

            // Find all section content blocks using the stable test ID.
            const sectionContentBlocks = document.querySelectorAll('[data-testid="collapsible-group-content"]');
            if (sectionContentBlocks.length === 0) {
                return null;
            }

            sectionContentBlocks.forEach(contentBlock => {
                // Find the title element associated with this content block.
                const titleContainer = contentBlock.previousElementSibling;
                let sectionName = '';
                if (titleContainer) {
                    const titleEl = titleContainer.querySelector('div[id^="CollapsibleGroup_"]');
                    if (titleEl) {
                        sectionName = titleEl.textContent.trim();
                    }
                }

                if (!EXCLUDED_SECTIONS.includes(sectionName)) {
                    if (sectionName) {
                        includedSectionsSet.add(sectionName);
                    }
                    
                    const timeElements = contentBlock.querySelectorAll('time');
                    timeElements.forEach(timeEl => {
                        result.totalSeconds += parseTime(timeEl.textContent);
                        result.videoCount++;
                    });
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
