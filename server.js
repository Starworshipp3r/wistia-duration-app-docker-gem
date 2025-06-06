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
 * e.g., /api/get-duration?url=https://epiclive.wistia.com/folders/kq28owpl4k
 */
app.get('/api/get-duration', async (req, res) => {
    const wistiaUrl = req.query.url;

    // --- Validation ---
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
        // --- Puppeteer Logic ---
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
        
        // **IMPROVEMENT 1**: Set a realistic User-Agent to mimic a real browser.
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(wistiaUrl, { waitUntil: 'domcontentloaded' });
        
        // **IMPROVEMENT 2**: Wait specifically for the script tag that contains the data to appear.
        // This is more reliable than waiting for the network to be idle.
        // We look for any script tag whose inner HTML contains the key variable name.
        await page.waitForFunction(
          'Array.from(document.querySelectorAll("script")).some(s => s.textContent.includes("window.folderPage.folder"))',
          { timeout: 30000 } // Wait for up to 30 seconds.
        );

        // Now that we know the script exists, execute the evaluation logic.
        const projectData = await page.evaluate(() => {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                if (script.textContent.includes('window.folderPage.folder =')) {
                    const match = script.textContent.match(/window\.folderPage\.folder = (\{.*\});/s);
                    if (match && match[1]) {
                        return JSON.parse(match[1]);
                    }
                }
            }
            return null;
        });

        if (!projectData || !projectData.medias) {
            // This error should be less likely now, but we keep it as a fallback.
            throw new Error('Could not find video data on the page after waiting. The page structure might have changed.');
        }

        // --- Calculation Logic ---
        const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
        const totalSeconds = projectData.medias.reduce((total, video) => {
            if (video.section && EXCLUDED_SECTIONS.includes(video.section.name)) {
                return total;
            }
            return total + (video.duration || 0);
        }, 0);

        // --- Success Response ---
        res.json({ totalSeconds });

    } catch (error) {
        console.error('Scraping failed:', error);
        // Provide a more specific error message to the frontend.
        let errorMessage = 'Failed to process Wistia page data.';
        if (error.message.includes('timeout')) {
            errorMessage = 'The page took too long to load and timed out. This could be a network issue or the page is protected.';
        } else if (error.message.includes('Could not find video data')) {
            errorMessage = 'Could not find video data on the page. The page structure may have changed.';
        }
        res.status(500).json({ error: errorMessage });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
