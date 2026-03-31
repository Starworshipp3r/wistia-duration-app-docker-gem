// server.js
// This server uses Express to handle web requests and Puppeteer to scrape the Wistia page.

const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// **PERFORMANCE OPTIMIZATION**: Launch the browser once when the server starts,
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
            const EXCLUDED_SECTIONS = ['Course Preview', 'Working Source Files', 'Working Source Folders', 'Editing Dump', 'Unedited', 'Holding Pen', 'Archive Videos', 'Archive'];
            const titleElement = document.querySelector('h1');
            const courseTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Course';
            const sectionData = {};
            const result = {
                totalSeconds: 0,
                videoCount: 0,
                courseTitle,
                sectionDetails: [],
            };
            const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"], strong, b, div, span, p';
            const DURATION_NODE_SELECTOR = 'span, div, p, a, button, li, time';
            const exactVideoDurationPattern = /^Video\s+(\d{1,2}:\d{2}(?::\d{2})?)$/i;
            const bareDurationPattern = /^(\d{1,2}:\d{2}(?::\d{2})?)$/;
            const durationCache = new WeakMap();
            const headingCandidatesCache = new WeakMap();
            const excludedHeadingCandidatesCache = new WeakMap();
            const sectionNameCache = new WeakMap();

            const normalizeText = (value = '') => value.replace(/\s+/g, ' ').trim();
            const isVisible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
            const isExcludedSectionName = (value = '') => {
                const normalizedValue = normalizeText(value).toLowerCase();
                return EXCLUDED_SECTIONS.some((excludedSection) => normalizedValue.includes(excludedSection.toLowerCase()));
            };
            const parseTime = (timeStr) => {
                const parts = timeStr.trim().split(':').map(Number);
                if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
                if (parts.length === 2) return parts[0] * 60 + parts[1];
                if (parts.length === 1) return parts[0];
                return 0;
            };
            const extractDurationText = (text, allowBareDurations = true) => {
                const normalized = normalizeText(text);
                const exactMatch = normalized.match(exactVideoDurationPattern);
                if (exactMatch) return exactMatch[1];
                if (!allowBareDurations) return null;

                const bareMatch = normalized.match(bareDurationPattern);
                return bareMatch ? bareMatch[1] : null;
            };
            const compareDocumentOrder = (a, b) => {
                if (a === b) return 0;
                return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
            };
            const hasMatchingChild = (el, allowBareDurations) => {
                return Array.from(el.children).some((child) => Boolean(extractDurationText(child.textContent, allowBareDurations)));
            };
            const collectDurationNodes = () => {
                const candidates = Array.from(document.querySelectorAll(DURATION_NODE_SELECTOR)).filter((el) => isVisible(el));
                const exactMatches = candidates.filter((el) => Boolean(extractDurationText(el.textContent, false)) && !hasMatchingChild(el, false));
                if (exactMatches.length > 0) {
                    return exactMatches.sort(compareDocumentOrder);
                }

                return candidates
                    .filter((el) => {
                        const text = normalizeText(el.textContent);
                        return text.length <= 8 && Boolean(extractDurationText(text, true)) && !hasMatchingChild(el, true);
                    })
                    .sort(compareDocumentOrder);
            };

            const durationNodes = collectDurationNodes();
            const getContainedDurations = (container) => {
                if (!container) return [];
                if (durationCache.has(container)) return durationCache.get(container);

                const durations = durationNodes.filter((durationNode) => container.contains(durationNode));
                durationCache.set(container, durations);
                return durations;
            };
            const findVideoContainer = (durationNode, stopContainer) => {
                let current = durationNode;

                while (current.parentElement && current.parentElement !== stopContainer) {
                    current = current.parentElement;
                }

                return current;
            };
            const isHeadingCandidate = (element, firstDurationNode, firstVideoContainer, sectionContainer) => {
                if (!element || !isVisible(element)) return false;

                const text = normalizeText(element.textContent);
                if (!text || text === courseTitle || text.length > 120) return false;
                if (extractDurationText(text, true)) return false;
                if (element.children.length > 10) return false;
                if (element.contains(firstDurationNode)) return false;
                if (firstVideoContainer && firstVideoContainer.contains(element)) return false;
                if (!(element.compareDocumentPosition(firstDurationNode) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
                if (getContainedDurations(element).length > 0) return false;

                const lowerText = text.toLowerCase();
                if (/\bshow more\b|\bview more\b|\bremaining\b/.test(lowerText)) return false;
                if (/^\d+\s+videos?$/i.test(text) || /^\d+\s+lessons?$/i.test(text)) return false;
                if (Array.from(element.children).some((child) => normalizeText(child.textContent) === text)) return false;

                const directChildOfSection = element.parentElement === sectionContainer;
                const grandchildOfSection = element.parentElement && element.parentElement.parentElement === sectionContainer;
                const looksStructural = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)
                    || element.getAttribute('role') === 'heading'
                    || directChildOfSection
                    || grandchildOfSection;

                if (!looksStructural) {
                    const fontWeight = Number.parseInt(window.getComputedStyle(element).fontWeight, 10);
                    if (Number.isNaN(fontWeight) || fontWeight < 600) {
                        return false;
                    }
                }

                return true;
            };
            const getHeadingScore = (element, sectionContainer) => {
                const text = normalizeText(element.textContent);
                let score = 0;

                if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName)) score += 6;
                if (element.getAttribute('role') === 'heading') score += 6;
                if (element.parentElement === sectionContainer) score += 3;
                if (/^\d+(\.\d+)*\s+/.test(text)) score += 3;
                if (/\b(section|module|chapter|lesson|week)\b/i.test(text)) score += 2;
                if (text.length <= 80) score += 1;

                const fontWeight = Number.parseInt(window.getComputedStyle(element).fontWeight, 10);
                if (!Number.isNaN(fontWeight) && fontWeight >= 600) score += 2;

                return score;
            };
            const getSectionHeadingCandidates = (sectionContainer) => {
                if (!sectionContainer) return [];
                if (headingCandidatesCache.has(sectionContainer)) return headingCandidatesCache.get(sectionContainer);

                const containedDurations = getContainedDurations(sectionContainer);
                if (containedDurations.length === 0) {
                    headingCandidatesCache.set(sectionContainer, []);
                    return [];
                }

                const firstDurationNode = containedDurations[0];
                const firstVideoContainer = findVideoContainer(firstDurationNode, sectionContainer);
                const candidates = Array.from(sectionContainer.querySelectorAll(HEADING_SELECTOR))
                    .filter((element) => isHeadingCandidate(element, firstDurationNode, firstVideoContainer, sectionContainer))
                    .map((element) => ({
                        name: normalizeText(element.textContent),
                        score: getHeadingScore(element, sectionContainer),
                    }))
                    .sort((a, b) => b.score - a.score || a.name.length - b.name.length);

                headingCandidatesCache.set(sectionContainer, candidates);
                return candidates;
            };
            const getExcludedSectionHeadingCandidates = (sectionContainer) => {
                if (!sectionContainer) return [];
                if (excludedHeadingCandidatesCache.has(sectionContainer)) return excludedHeadingCandidatesCache.get(sectionContainer);

                const containedDurations = getContainedDurations(sectionContainer);
                if (containedDurations.length === 0) {
                    excludedHeadingCandidatesCache.set(sectionContainer, []);
                    return [];
                }

                const firstDurationNode = containedDurations[0];
                const firstVideoContainer = findVideoContainer(firstDurationNode, sectionContainer);
                const candidates = Array.from(sectionContainer.querySelectorAll(HEADING_SELECTOR))
                    .filter((element) => {
                        if (!element || !isVisible(element)) return false;

                        const text = normalizeText(element.textContent);
                        if (!text || !isExcludedSectionName(text)) return false;
                        if (element.contains(firstDurationNode)) return false;
                        if (firstVideoContainer && firstVideoContainer.contains(element)) return false;
                        if (!(element.compareDocumentPosition(firstDurationNode) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
                        if (getContainedDurations(element).length > 0) return false;

                        return true;
                    })
                    .map((element) => ({
                        name: normalizeText(element.textContent),
                        score: getHeadingScore(element, sectionContainer),
                    }))
                    .sort((a, b) => b.score - a.score || a.name.length - b.name.length);

                excludedHeadingCandidatesCache.set(sectionContainer, candidates);
                return candidates;
            };
            const findSectionContainer = (durationNode) => {
                let current = durationNode.parentElement;
                let multiDurationFallback = null;
                let singleDurationFallback = null;

                while (current && current !== document.body) {
                    const containedDurations = getContainedDurations(current);
                    if (containedDurations.length === 0) {
                        current = current.parentElement;
                        continue;
                    }

                    const firstVideoContainer = findVideoContainer(containedDurations[0], current);
                    const isOnlyVideoCard = containedDurations.length === 1 && current === firstVideoContainer;
                    const hasExcludedHeadingCandidates = getExcludedSectionHeadingCandidates(current).length > 0;
                    const hasHeadingCandidates = getSectionHeadingCandidates(current).length > 0;

                    if (hasExcludedHeadingCandidates) {
                        return current;
                    }

                    if (containedDurations.length > 1) {
                        if (!multiDurationFallback) {
                            multiDurationFallback = current;
                        }
                        if (hasHeadingCandidates) {
                            return current;
                        }
                    }
                    else if (!isOnlyVideoCard && hasHeadingCandidates) {
                        singleDurationFallback = current;
                    }

                    current = current.parentElement;
                }

                return singleDurationFallback || multiDurationFallback;
            };
            const deriveSectionName = (durationNode) => {
                const sectionContainer = findSectionContainer(durationNode);
                if (!sectionContainer) return 'Uncategorized';
                if (sectionNameCache.has(sectionContainer)) return sectionNameCache.get(sectionContainer);

                const excludedCandidates = getExcludedSectionHeadingCandidates(sectionContainer);
                if (excludedCandidates[0]) {
                    sectionNameCache.set(sectionContainer, excludedCandidates[0].name);
                    return excludedCandidates[0].name;
                }

                const candidates = getSectionHeadingCandidates(sectionContainer);
                const sectionName = candidates[0] ? candidates[0].name : 'Uncategorized';
                sectionNameCache.set(sectionContainer, sectionName);
                return sectionName;
            };

            durationNodes.forEach((durationNode) => {
                const timeText = extractDurationText(durationNode.textContent, true);
                const duration = timeText ? parseTime(timeText) : 0;
                const sectionName = deriveSectionName(durationNode);

                if (!duration || isExcludedSectionName(sectionName)) {
                    return;
                }

                result.totalSeconds += duration;
                result.videoCount++;

                if (!sectionData[sectionName]) {
                    sectionData[sectionName] = { videoCount: 0, totalDuration: 0 };
                }

                sectionData[sectionName].videoCount++;
                sectionData[sectionName].totalDuration += duration;
            });

            result.sectionDetails = Object.keys(sectionData).map((name) => ({
                name,
                videoCount: sectionData[name].videoCount,
                totalDuration: sectionData[name].totalDuration,
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
