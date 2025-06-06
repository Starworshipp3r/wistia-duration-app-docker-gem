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
        // Launch a headless browser. The 'args' are important for running in a Docker container on Render.
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // This is for Docker environments
                '--disable-gpu'
            ],
        });

        const page = await browser.newPage();
        
        // Navigate to the Wistia page and wait for the network to be idle,
        // which indicates that dynamic content has likely finished loading.
        await page.goto(wistiaUrl, { waitUntil: 'networkidle2' });

        // Execute code within the context of the page to find the embedded video data.
        const projectData = await page.evaluate(() => {
            // This code runs in the browser context, after all JS has loaded.
            // It finds the same script tag we were looking for before.
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                if (script.textContent.includes('window.folderPage.folder =')) {
                    const match = script.textContent.match(/window\.folderPage\.folder = (\{.*\});/s);
                    if (match && match[1]) {
                        // The matched string is returned to our Node.js server.
                        return JSON.parse(match[1]);
                    }
                }
            }
            return null; // Return null if data is not found
        });

        if (!projectData || !projectData.medias) {
            throw new Error('Could not find video data on the page. The structure might have changed.');
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
        res.status(500).json({ error: 'Failed to fetch or process Wistia page data.' });
    } finally {
        // Ensure the browser is always closed, even if an error occurs.
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});