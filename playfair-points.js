(() => {
    const DOT_COLOR = '#e73e01';
    const BRAND_LOGO_PATH = 'M.2.2v760h151l1-418,191,200,192-200,1,254h150V.2h-46l-296,329L47.2.2H.2Z';
    const BRAND_LOGO_DOT = { cx: 611.2, cy: 700.2, r: 75 };
    const BRAND_LOGO_BOX = { xMin: 0.2, xMax: 611.2, yMin: 0.2, yMax: 760.2 };
    const FONT_URLS = {
        regular: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf',
        bold: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf'
    };

    const fontCache = new Map();
    let resizeTimer = null;
    let textMeasureCanvas = null;

    function decodeHtmlEntities(value) {
        const decoder = document.createElement('textarea');
        let current = value;

        for (let index = 0; index < 5; index += 1) {
            decoder.innerHTML = current;
            const decoded = decoder.value;

            if (decoded === current) {
                return decoded;
            }

            current = decoded;
        }

        return current;
    }

    function isPlayfairElement(element) {
        return window.getComputedStyle(element).fontFamily.includes('Playfair Display');
    }

    function isRootPlayfairElement(element) {
        if (!isPlayfairElement(element)) {
            return false;
        }

        if (element.closest('.brand-name')) {
            return false;
        }

        if (element.querySelector('img, svg')) {
            return false;
        }

        if (element.matches('a[href^="mailto:"]')) {
            return false;
        }

        let parent = element.parentElement;
        while (parent) {
            if (parent.matches && parent.matches('a[href^="mailto:"]')) {
                return false;
            }
            if (isPlayfairElement(parent)) {
                return false;
            }
            parent = parent.parentElement;
        }

        return true;
    }

    function extractSourceText(element) {
        const rawSource = element.dataset.playfairSourceText || element.innerHTML
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '');

        const normalized = decodeHtmlEntities(rawSource)
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();

        element.dataset.playfairSourceText = normalized;
        return normalized;
    }

    function getRenderedText(element) {
        const sourceText = extractSourceText(element);
        const transform = window.getComputedStyle(element).textTransform;

        if (transform === 'uppercase') {
            return sourceText.toUpperCase();
        }

        if (transform === 'lowercase') {
            return sourceText.toLowerCase();
        }

        if (transform === 'capitalize') {
            return sourceText.replace(/\b(\p{L})/gu, (match) => match.toUpperCase());
        }

        return sourceText;
    }

    async function loadFont(weightKey) {
        if (fontCache.has(weightKey)) {
            return fontCache.get(weightKey);
        }

        if (!window.opentype) {
            throw new Error('opentype.js unavailable');
        }

        const promise = fetch(FONT_URLS[weightKey])
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Playfair font unavailable: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => window.opentype.parse(buffer));

        fontCache.set(weightKey, promise);
        return promise;
    }

    function splitContours(commands) {
        const contours = [];
        let current = [];

        for (const command of commands) {
            if (command.type === 'M') {
                if (current.length) {
                    contours.push(current);
                }
                current = [command];
            } else {
                current.push(command);
            }
        }

        if (current.length) {
            contours.push(current);
        }

        return contours;
    }

    function contourToPath(contour) {
        return contour.map((command) => {
            if (command.type === 'M') return `M ${command.x} ${command.y}`;
            if (command.type === 'L') return `L ${command.x} ${command.y}`;
            if (command.type === 'C') return `C ${command.x1} ${command.y1} ${command.x2} ${command.y2} ${command.x} ${command.y}`;
            if (command.type === 'Q') return `Q ${command.x1} ${command.y1} ${command.x} ${command.y}`;
            if (command.type === 'Z') return 'Z';
            return '';
        }).join(' ');
    }

    function getBox(contour) {
        const xs = [];
        const ys = [];

        for (const command of contour) {
            ['x', 'x1', 'x2'].forEach((key) => {
                if (command[key] !== undefined) {
                    xs.push(command[key]);
                }
            });
            ['y', 'y1', 'y2'].forEach((key) => {
                if (command[key] !== undefined) {
                    ys.push(command[key]);
                }
            });
        }

        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);

        return {
            width: xMax - xMin,
            height: yMax - yMin,
            xMin,
            xMax,
            yMin,
            yMax,
            centerY: (yMin + yMax) / 2
        };
    }

    function getGlyphBox(contours) {
        const boxes = contours.map(getBox);
        const yMin = Math.min(...boxes.map((box) => box.yMin));
        const yMax = Math.max(...boxes.map((box) => box.yMax));

        return {
            yMin,
            yMax,
            height: yMax - yMin
        };
    }

    function getContourArea(box) {
        return box.width * box.height;
    }

    function getDotContourIndexes(character, contours) {
        const boxes = contours.map(getBox);
        const indexed = boxes.map((box, index) => ({
            index,
            box,
            area: getContourArea(box)
        }));

        if (!indexed.length) {
            return new Set();
        }

        if (character === '.') {
            return new Set(indexed.map((item) => item.index));
        }

        if (character === 'i' || character === 'j') {
            const topContour = indexed
                .slice()
                .sort((a, b) => a.box.centerY - b.box.centerY || a.area - b.area)[0];

            return topContour ? new Set([topContour.index]) : new Set();
        }

        if (character === '!' || character === '?') {
            const bottomContour = indexed
                .slice()
                .sort((a, b) => b.box.centerY - a.box.centerY || a.area - b.area)[0];

            return bottomContour ? new Set([bottomContour.index]) : new Set();
        }

        if (character === ':') {
            return new Set(
                indexed
                    .slice()
                    .sort((a, b) => a.box.centerY - b.box.centerY || a.area - b.area)
                    .slice(0, Math.min(2, indexed.length))
                    .map((item) => item.index)
            );
        }

        if (character === ';') {
            return new Set(
                indexed
                    .slice()
                    .sort((a, b) => a.box.centerY - b.box.centerY || a.area - b.area)
                    .slice(0, Math.min(2, indexed.length))
                    .map((item) => item.index)
            );
        }

        return new Set();
    }

    function getFontSize(element) {
        return parseFloat(window.getComputedStyle(element).fontSize) || 16;
    }

    function getLineHeight(element, fontSize) {
        const value = parseFloat(window.getComputedStyle(element).lineHeight);
        return Number.isFinite(value) ? value : fontSize * 1.15;
    }

    function getLetterSpacing(element) {
        const value = parseFloat(window.getComputedStyle(element).letterSpacing);
        return Number.isFinite(value) ? value : 0;
    }

    function getWeightKey(element) {
        const weight = parseInt(window.getComputedStyle(element).fontWeight, 10);
        return Number.isFinite(weight) && weight >= 600 ? 'bold' : 'regular';
    }

    function getFontWeightValue(element) {
        return window.getComputedStyle(element).fontWeight || '400';
    }

    function getExplicitLines(element) {
        return extractSourceText(element)
            .split('\n')
            .map((part) => part.replace(/[ \t]{2,}/g, ' ').trim())
            .filter((part, index, array) => part.length || index < array.length - 1);
    }

    function measureText(font, text, fontSize, letterSpacing) {
        let width = 0;

        for (let index = 0; index < text.length; index += 1) {
            const glyph = font.charToGlyph(text[index]);
            width += glyph.advanceWidth * fontSize / font.unitsPerEm;

            if (index < text.length - 1) {
                width += letterSpacing;
            }
        }

        return width;
    }

    function measureGeorgiaCharacter(character, fontSize, fontWeight) {
        if (!textMeasureCanvas) {
            textMeasureCanvas = document.createElement('canvas');
        }

        const context = textMeasureCanvas.getContext('2d');
        context.font = `${fontWeight} ${fontSize}px Georgia, serif`;
        return context.measureText(character).width;
    }

    function appendGeorgiaCharacter(svg, character, fontSize, baseline, x, fontWeight) {
        const textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textNode.setAttribute('x', x);
        textNode.setAttribute('y', baseline);
        textNode.setAttribute('fill', 'currentColor');
        textNode.setAttribute('font-family', 'Georgia, serif');
        textNode.setAttribute('font-size', fontSize);
        textNode.setAttribute('font-weight', fontWeight);
        textNode.textContent = character;
        svg.appendChild(textNode);

        return measureGeorgiaCharacter(character, fontSize, fontWeight);
    }

    function wrapLine(font, text, fontSize, letterSpacing, maxWidth) {
        if (!text) {
            return [''];
        }

        const words = text.split(/\s+/).filter(Boolean);
        const lines = [];
        let current = '';

        for (const word of words) {
            const candidate = current ? `${current} ${word}` : word;

            if (!current || measureText(font, candidate, fontSize, letterSpacing) <= maxWidth) {
                current = candidate;
            } else {
                lines.push(current);
                current = word;
            }
        }

        if (current) {
            lines.push(current);
        }

        return lines.length ? lines : [''];
    }

    function buildLines(element, font, fontSize, letterSpacing, maxWidth) {
        const explicitLines = getExplicitLines(element);

        if (explicitLines.length > 1) {
            const compactLine = explicitLines.join(' ').replace(/[ \t]{2,}/g, ' ').trim();

            if (compactLine && measureText(font, compactLine, fontSize, letterSpacing) <= maxWidth) {
                return [compactLine];
            }

            return explicitLines.flatMap((line) => wrapLine(font, line, fontSize, letterSpacing, maxWidth));
        }

        return wrapLine(font, getRenderedText(element), fontSize, letterSpacing, maxWidth);
    }

    async function renderElement(element) {
        const text = getRenderedText(element);
        if (!text) {
            return;
        }

        const fontSize = getFontSize(element);
        const lineHeight = getLineHeight(element, fontSize);
        const letterSpacing = getLetterSpacing(element);
        const fontWeight = getFontWeightValue(element);
        const font = await loadFont(getWeightKey(element));
        const rect = element.getBoundingClientRect();
        // Keep a small tolerance because the SVG font metrics are not perfectly
        // identical to the browser's text shaping for Playfair in CSS.
        const maxWidth = Math.max(rect.width * 1.1, fontSize);
        const lines = buildLines(element, font, fontSize, letterSpacing, maxWidth);

        const ascender = font.ascender * fontSize / font.unitsPerEm;
        const descender = Math.abs(font.descender) * fontSize / font.unitsPerEm;
        const totalHeight = Math.max(ascender + descender + Math.max(0, lines.length - 1) * lineHeight, lineHeight);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        svg.style.overflow = 'visible';

        let measuredWidth = 0;

        lines.forEach((line, lineIndex) => {
            let x = 0;
            const baseline = ascender + lineIndex * lineHeight;

            for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
                const character = line[charIndex];

                if (character === '&') {
                    x += appendGeorgiaCharacter(svg, character, fontSize, baseline, x, fontWeight);
                    if (charIndex < line.length - 1) {
                        x += letterSpacing;
                    }
                    continue;
                }

                const glyph = font.charToGlyph(character);
                const path = glyph.getPath(x, baseline, fontSize);
                const contours = splitContours(path.commands);
                const dotIndexes = getDotContourIndexes(character, contours);
                const mainContours = [];
                const dotContours = [];

                contours.forEach((contour, contourIndex) => {
                    if (dotIndexes.has(contourIndex)) {
                        dotContours.push(contourToPath(contour));
                    } else {
                        mainContours.push(contourToPath(contour));
                    }
                });

                if (mainContours.length) {
                    const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    mainPath.setAttribute('d', mainContours.join(' '));
                    mainPath.setAttribute('fill', 'currentColor');
                    svg.appendChild(mainPath);
                }

                if (dotContours.length) {
                    const dotPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    dotPath.setAttribute('d', dotContours.join(' '));
                    dotPath.setAttribute('fill', DOT_COLOR);
                    svg.appendChild(dotPath);
                }

                x += glyph.advanceWidth * fontSize / font.unitsPerEm;
                if (charIndex < line.length - 1) {
                    x += letterSpacing;
                }
            }

            measuredWidth = Math.max(measuredWidth, x);
        });

        const width = Math.max(measuredWidth, 1);
        svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
        svg.setAttribute('width', width);
        svg.setAttribute('height', totalHeight);
        svg.style.width = `${width}px`;
        svg.style.height = `${totalHeight}px`;
        svg.style.maxWidth = '100%';
        svg.style.display = 'block';

        element.setAttribute('aria-label', text);
        element.textContent = '';
        element.appendChild(svg);
        element.classList.add('playfair-points-ready');
    }

    function getBrandText(element) {
        if (!element.dataset.brandText) {
            const textElement = element.querySelector('.brand-name-text');
            element.dataset.brandText = textElement
                ? textElement.textContent.replace(/\s+/g, ' ').trim()
                : element.textContent.replace(/\s+/g, ' ').trim();
        }

        return element.dataset.brandText;
    }

    function appendGlyphPaths(svg, character, font, fontSize, baseline, x, dotColor, fontWeight) {
        if (character === '&') {
            return appendGeorgiaCharacter(svg, character, fontSize, baseline, x, fontWeight);
        }

        const glyph = font.charToGlyph(character);
        const path = glyph.getPath(x, baseline, fontSize);
        const contours = splitContours(path.commands);
        const dotIndexes = getDotContourIndexes(character, contours);
        const mainContours = [];
        const dotContours = [];

        contours.forEach((contour, contourIndex) => {
            if (dotIndexes.has(contourIndex)) {
                dotContours.push(contourToPath(contour));
            } else {
                mainContours.push(contourToPath(contour));
            }
        });

        if (mainContours.length) {
            const mainPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            mainPath.setAttribute('d', mainContours.join(' '));
            mainPath.setAttribute('fill', 'currentColor');
            svg.appendChild(mainPath);
        }

        if (dotContours.length) {
            const dotPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            dotPath.setAttribute('d', dotContours.join(' '));
            dotPath.setAttribute('fill', dotColor);
            svg.appendChild(dotPath);
        }

        return glyph.advanceWidth * fontSize / font.unitsPerEm;
    }

    function getGlyphVisualBox(font, character, fontSize, baseline) {
        const path = font.charToGlyph(character).getPath(0, baseline, fontSize);
        return getGlyphBox(splitContours(path.commands));
    }

    async function renderBrandName(element) {
        const text = getBrandText(element);
        if (!text) {
            return;
        }

        const textElement = element.querySelector('.brand-name-text');
        const fontSource = textElement || element;
        const fontSize = getFontSize(fontSource);
        const letterSpacing = getLetterSpacing(fontSource);
        const fontWeight = getFontWeightValue(fontSource);
        const font = await loadFont(getWeightKey(fontSource));
        const ascender = font.ascender * fontSize / font.unitsPerEm;
        const descender = Math.abs(font.descender) * fontSize / font.unitsPerEm;
        const totalHeight = ascender + descender;
        const baseline = ascender;
        const capBox = getGlyphVisualBox(font, 'L', fontSize, baseline);
        const logoHeight = BRAND_LOGO_BOX.yMax - BRAND_LOGO_BOX.yMin;
        const logoScale = capBox.height / logoHeight;
        const logoWidth = (BRAND_LOGO_BOX.xMax - BRAND_LOGO_BOX.xMin) * logoScale;
        const brandGap = fontSize * 0.11;
        const textX = logoWidth + brandGap;
        let textWidth = 0;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
        svg.style.overflow = 'visible';
        svg.style.display = 'block';

        const logoGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const logoBottom = capBox.yMax;
        const logoTranslateX = -BRAND_LOGO_BOX.xMin * logoScale;
        const logoTranslateY = logoBottom - BRAND_LOGO_BOX.yMax * logoScale;
        logoGroup.setAttribute('transform', `translate(${logoTranslateX} ${logoTranslateY}) scale(${logoScale})`);

        const logoPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        logoPath.setAttribute('d', BRAND_LOGO_PATH);
        logoPath.setAttribute('fill', 'currentColor');
        logoGroup.appendChild(logoPath);

        const logoDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        logoDot.setAttribute('cx', BRAND_LOGO_DOT.cx);
        logoDot.setAttribute('cy', BRAND_LOGO_DOT.cy);
        logoDot.setAttribute('r', BRAND_LOGO_DOT.r);
        logoDot.setAttribute('fill', DOT_COLOR);
        logoGroup.appendChild(logoDot);
        svg.appendChild(logoGroup);

        let x = textX;
        for (let index = 0; index < text.length; index += 1) {
            const character = text[index];
            x += appendGlyphPaths(svg, character, font, fontSize, baseline, x, DOT_COLOR, fontWeight);
            if (index < text.length - 1) {
                x += letterSpacing;
            }
        }
        textWidth = x - textX;

        const width = Math.max(textX + textWidth, 1);
        svg.setAttribute('viewBox', `0 0 ${width} ${totalHeight}`);
        svg.setAttribute('width', width);
        svg.setAttribute('height', totalHeight);
        svg.style.width = `${width}px`;
        svg.style.height = `${totalHeight}px`;
        svg.style.maxWidth = 'none';

        element.setAttribute('aria-label', `M${text}`);
        element.textContent = '';
        element.appendChild(svg);
        element.classList.add('playfair-points-ready', 'brand-name-rendered');
    }

    async function renderAll() {
        const brandNames = Array.from(document.querySelectorAll('.brand-name'))
            .filter((element) => element.dataset.brandStatic !== 'true');
        for (const element of brandNames) {
            try {
                await renderBrandName(element);
            } catch (error) {
                console.error('Brand name render failed', error);
            }
        }

        const elements = Array.from(document.body.querySelectorAll('*'))
            .filter((element) => {
                if (!isRootPlayfairElement(element)) {
                    return false;
                }

                const text = getRenderedText(element);
                return text.length > 0;
            });

        for (const element of elements) {
            try {
                await renderElement(element);
            } catch (error) {
                console.error('Playfair points render failed', error);
            }
        }
    }

    function scheduleRerender() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            renderAll();
        }, 180);
    }

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await renderAll();
            window.addEventListener('resize', scheduleRerender);
        } catch (error) {
            console.error('Playfair points setup failed', error);
        }
    });
})();
