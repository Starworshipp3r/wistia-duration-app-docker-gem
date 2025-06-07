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

        // **DEFINITIVE FIX**: Wait specifically for the script tag that contains the JSON data.
        // This is the most reliable way to know the page has all its data ready.
        await page.waitForFunction(
          'Array.from(document.querySelectorAll("script")).some(s => s.textContent.includes("window.folderPage.folder"))',
          { timeout: 30000 } // Wait for up to 30 seconds.
        );

        // **NEW LOGIC**: Extract the data directly from the JSON object in the page script.
        // This is faster and more reliable than parsing the DOM.
        const calculationData = await page.evaluate(() => {
            const EXCLUDED_SECTIONS = ['0.0 Course Preview', 'Working Source Files'];
            
            let projectData = null;
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                if (script.textContent.includes('window.folderPage.folder =')) {
                    const match = script.textContent.match(/window\.folderPage\.folder = (\{.*\});/s);
                    if (match && match[1]) {
                        projectData = JSON.parse(match[1]);
                        break; 
                    }
                }
            }

            if (!projectData || !projectData.medias) {
                // This will be returned to the server and throw an error.
                return null;
            }

            const includedSectionsSet = new Set();
            const result = {
                totalSeconds: 0,
                videoCount: 0,
                courseTitle: projectData.name || 'Unknown Course',
                includedSections: [],
            };

            projectData.medias.forEach(video => {
                if (video.section && !EXCLUDED_SECTIONS.includes(video.section.name)) {
                    result.totalSeconds += video.duration || 0;
                    result.videoCount++;
                    if (video.section.name) {
                        includedSectionsSet.add(video.section.name);
                    }
                }
            });
            
            result.includedSections = Array.from(includedSectionsSet);
            return result;
        });

        if (calculationData === null) {
            throw new Error('Could not find the embedded video data on the page. The page structure has likely changed.');
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
