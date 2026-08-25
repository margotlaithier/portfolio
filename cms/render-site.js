(function () {
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function linkAsset(rootPrefix, assetPath = '') {
        if (!assetPath) return '';
        if (/^(https?:)?\/\//.test(assetPath) || assetPath.startsWith('data:')) {
            return assetPath;
        }
        return `${rootPrefix}${assetPath}`.replace(/\/{2,}/g, '/').replace(/^([a-z]+:)\//i, '$1//');
    }

    function groupBy(items, size) {
        const groups = [];
        for (let index = 0; index < items.length; index += size) {
            groups.push(items.slice(index, index + size));
        }
        return groups;
    }

    function normaliseProject(project) {
        return {
            ...project,
            cardTitleHtml: project.cardTitleHtml || escapeHtml(project.title),
            cardYear: project.cardYear || project.date,
            cardDescription: project.cardDescription || project.intro,
            cardSize: project.cardSize || 'third',
            cardImageFit: project.cardImageFit || 'cover',
            cardAspect: project.cardAspect || 'auto',
            characteristics: project.characteristics || [],
            blocks: project.blocks || [],
        };
    }

    function renderHeader(rootPrefix, current) {
        const toHome = `${rootPrefix}index.html`;
        const projetHref = current === 'home' ? '#projets' : `${toHome}#projets`;
        return `
            <header class="site-header">
                <div class="header-inner">
                    <a class="brand" href="${current === 'home' ? '#intro' : `${toHome}#intro`}">
                        <span class="brand-kicker">${escapeHtml(content.site.brandKicker)}</span>
                        <span class="brand-name brand-name-static" data-brand-static="true">
                            <img class="brand-logo-complete" src="${rootPrefix}logo-complet.svg" alt="Margot Laithier" />
                        </span>
                    </a>

                    <nav class="site-nav">
                        <a href="${current === 'home' ? '#intro' : `${toHome}#intro`}" data-nav="intro"${current === 'home' ? ' class="is-current"' : ''}>Accueil</a>
                        <a href="${projetHref}" data-nav="projets"${current !== 'home' ? ' class="is-current"' : ''}>Projets</a>
                        <a href="${current === 'home' ? '#contact' : `${toHome}#contact`}" data-nav="contact">Contact</a>
                    </nav>
                </div>
            </header>
        `;
    }

    function renderFooter(rootPrefix, current) {
        const toHome = `${rootPrefix}index.html`;
        return `
            <footer class="site-footer">
                <div class="site-footer-inner">
                    <div class="footer-grid">
                        <div class="footer-brand">
                            <span class="footer-kicker">${escapeHtml(content.site.brandKicker)}</span>
                            <strong class="footer-title">${escapeHtml(content.site.footerTitle)}</strong>
                        </div>

                        <div class="footer-nav">
                            <span class="footer-heading">Navigation</span>
                            <div class="footer-list">
                                <a href="${current === 'home' ? '#intro' : `${toHome}#intro`}">Accueil</a>
                                <a href="${current === 'home' ? '#projets' : `${toHome}#projets`}">Projets</a>
                                <a href="${current === 'home' ? '#contact' : `${toHome}#contact`}">Contact</a>
                            </div>
                        </div>

                        <div class="footer-contact">
                            <span class="footer-heading">Contact</span>
                            <div class="footer-list">
                                <a href="mailto:${escapeHtml(content.site.email)}">${escapeHtml(content.site.email)}</a>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        `;
    }

    function renderProjectCard(project, rootPrefix) {
        const aspectClass = project.cardAspect && project.cardAspect !== 'auto'
            ? ` card-aspect-${escapeHtml(project.cardAspect)}`
            : '';
        return `
            <a class="portfolio-card card-${escapeHtml(project.cardSize)}${project.cardImageFit === 'contain' ? ' card-image-contain' : ''}${aspectClass}" href="${rootPrefix}${project.path}">
                <img src="${linkAsset(rootPrefix, project.cardImage)}" alt="${escapeHtml(project.cardAlt || project.title)}" loading="lazy" decoding="async" />
                <div class="corner-arrow">
                    <svg viewBox="0 0 24 24">
                        <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                </div>
                <div class="overlay">
                    <span class="overlay-tag">${escapeHtml(project.cardYear || '')}</span>
                    <h2 class="overlay-title">${project.cardTitleHtml}</h2>
                    ${project.cardDescription ? `<p class="overlay-desc">${escapeHtml(project.cardDescription)}</p>` : ''}
                    <span class="overlay-cta"><span class="cta-line"></span>Voir le projet</span>
                </div>
            </a>
        `;
    }

    function projectsCatalog(rootPrefix, destination = 'projects') {
        const requestedCategory = new URLSearchParams(window.location.search).get('category');
        const categoryParam = content.categories.some((category) => category.title === requestedCategory)
            ? requestedCategory
            : '';
        const destinationPath = destination === 'home' ? `${rootPrefix}index.html` : `${rootPrefix}projets.html`;
        const categoryHash = destination === 'home' ? '#projets' : '';

        const groupedMarkup = content.categories.map((category) => {
            const items = projects.filter((project) => project.category === category.title);
            return `
                <div class="projets-group">
                    <div class="group-head">
                        <h2 class="group-title">${escapeHtml(category.title)}</h2>
                    </div>
                    <div class="projets-row">
                        ${items.map((project, index) => renderProjectCard({ ...project, cardNumber: project.cardNumber || project.globalNumber || index + 1 }, rootPrefix)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        if (!categoryParam) {
            return {
                categoryParam,
                pageTitle: content.projectsPage.heroTitle,
                markup: `<div class="projets-grouped-view">${groupedMarkup}</div>`,
            };
        }

        const filteredProjects = projects.filter((project) => project.category === categoryParam);
        return {
            categoryParam,
            pageTitle: categoryParam,
            markup: `
                <div class="projets-flow-view">
                    <a class="group-link projects-all-link" href="${destinationPath}${categoryHash}">Toutes les catégories</a>
                    <div class="projets-flow">
                        ${groupBy(filteredProjects, 3).map((row) => `
                            <div class="projets-row">
                                ${row.map((project) => renderProjectCard(project, rootPrefix)).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `,
        };
    }

    function enhanceProjectCardInteractions() {
        const cards = document.querySelectorAll('.portfolio-card');
        const touchQuery = window.matchMedia('(hover: none), (pointer: coarse)');

        cards.forEach((card) => {
            card.addEventListener('click', (event) => {
                const isTouchClick = touchQuery.matches || event.pointerType === 'touch';

                if (!isTouchClick || card.classList.contains('active')) {
                    return;
                }

                event.preventDefault();
                cards.forEach((item) => item.classList.remove('active'));
                card.classList.add('active');
            });
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.portfolio-card')) {
                cards.forEach((card) => card.classList.remove('active'));
            }
        });
    }

    function enhanceHomeInteractions() {
        const panels = Array.from(document.querySelectorAll('.page-panel'));
        const navLinks = Array.from(document.querySelectorAll('[data-nav]'));
        const dots = Array.from(document.querySelectorAll('[data-dot]'));

        function setCurrentPanel(panelId) {
            navLinks.forEach((link) => {
                link.classList.toggle('is-current', link.dataset.nav === panelId);
            });

            dots.forEach((dot) => {
                dot.classList.toggle('is-current', dot.dataset.dot === panelId);
            });
        }

        function updatePanelState() {
            const viewportCenter = window.innerHeight * 0.5;
            let currentPanel = panels.find((panel) => {
                const rect = panel.getBoundingClientRect();
                return rect.top <= viewportCenter && rect.bottom >= viewportCenter;
            }) || panels[0];

            panels.forEach((panel) => {
                const rect = panel.getBoundingClientRect();

                const activeBandTop = window.innerHeight * 0.18;
                const activeBandBottom = window.innerHeight * 0.82;
                const isActive = rect.top < activeBandBottom && rect.bottom > activeBandTop;

                panel.classList.toggle('is-active', isActive);

                if (!isActive && rect.bottom <= activeBandTop) {
                    panel.classList.add('is-leaving');
                } else {
                    panel.classList.remove('is-leaving');
                }
            });

            if (currentPanel) {
                setCurrentPanel(currentPanel.dataset.panel);
            }
        }

        navLinks.forEach((link) => {
            link.addEventListener('click', () => {
                navLinks.forEach((item) => item.classList.remove('is-current'));
                link.classList.add('is-current');
            });
        });

        updatePanelState();
        window.addEventListener('scroll', updatePanelState, { passive: true });
        window.addEventListener('resize', updatePanelState);
        enhanceProjectCardInteractions();
    }

    function renderHome(rootPrefix) {
        const heroImages = content.home.hero.images || [];
        const [largeImage, smallImage] = heroImages;
        const catalog = projectsCatalog(rootPrefix, 'home');

        document.title = content.site.portfolioTitle || 'Portfolio';
        document.body.classList.add('page-projets');
        document.body.classList.toggle('page-projets-continu', Boolean(catalog.categoryParam));
        document.body.innerHTML = `
            ${renderHeader(rootPrefix, 'home')}
            <div class="panel-rail" aria-hidden="true">
                <span class="panel-dot" data-dot="intro"></span>
                <span class="panel-dot" data-dot="projets"></span>
                <span class="panel-dot" data-dot="contact"></span>
            </div>

            <main class="page-shell">
                <div class="scroll-pages">
                    <section class="page-panel hero-panel is-active" id="intro" data-panel="intro">
                        <div class="panel-inner">
                            <div class="hero-copy">
                                <span class="panel-label">${escapeHtml(content.home.hero.panelLabel)}</span>
                                <h1 class="hero-title">
                                    ${(content.home.hero.titleLines || []).map((line) => `<span class="title-line"><span>${escapeHtml(line)}</span></span>`).join('')}
                                </h1>
                                <p class="hero-text">${escapeHtml(content.home.hero.text)}</p>
                                <p class="hero-caption">${escapeHtml(content.home.hero.caption)}</p>
                            </div>

                            <div class="hero-visual">
                                <div class="hero-stack">
                                    ${largeImage ? `<div class="floating-card ${escapeHtml(largeImage.size)}"><img src="${linkAsset(rootPrefix, largeImage.src)}" alt="${escapeHtml(largeImage.alt)}" /></div>` : ''}
                                    ${smallImage ? `<div class="floating-card ${escapeHtml(smallImage.size)}"><img src="${linkAsset(rootPrefix, smallImage.src)}" alt="${escapeHtml(smallImage.alt)}" /></div>` : ''}
                                </div>
                                <div class="floating-note">${escapeHtml(content.home.hero.note)}</div>
                            </div>
                        </div>
                    </section>

                    <section class="page-panel home-projects-catalog projets-section" id="projets" data-panel="projets">
                        <div class="container">
                            <div class="home-projects-heading">
                                <span class="section-label">${escapeHtml(content.projectsPage.heroLabel)}</span>
                                <h2 class="page-title">${escapeHtml(catalog.pageTitle)}</h2>
                            </div>
                            ${catalog.markup}
                        </div>
                    </section>

                    <section class="page-panel contact-panel" id="contact" data-panel="contact">
                        <div class="panel-inner">
                            <div>
                                <span class="panel-label">${escapeHtml(content.home.contact.panelLabel)}</span>
                                <h2 class="contact-title">${escapeHtml(content.home.contact.title)}</h2>
                                <p class="contact-text">${escapeHtml(content.home.contact.text)}</p>
                            </div>

                            <div class="contact-card">
                                <div class="contact-list">
                                    <div class="contact-item">
                                        <span>Email</span>
                                        <a href="mailto:${escapeHtml(content.home.contact.email)}">${escapeHtml(content.home.contact.email)}</a>
                                    </div>
                                    <div class="contact-item">
                                        <span>Localisation</span>
                                        <strong>${escapeHtml(content.home.contact.location)}</strong>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </main>
            ${renderFooter(rootPrefix, 'home')}
        `;

        enhanceHomeInteractions();
    }

    function renderProjectsPage(rootPrefix) {
        const catalog = projectsCatalog(rootPrefix, 'projects');
        document.title = 'Projets';
        document.body.classList.toggle('page-projets-continu', Boolean(catalog.categoryParam));
        document.body.innerHTML = `
            ${renderHeader(rootPrefix, 'projects')}
            <main>
                <section class="hero">
                    <div class="container hero-grid">
                        <div>
                            <span class="section-label">${escapeHtml(content.projectsPage.heroLabel)}</span>
                            <h1 class="page-title">${escapeHtml(catalog.pageTitle)}</h1>
                        </div>
                    </div>
                </section>

                <section class="projets-section">
                    <div class="container">
                        ${catalog.markup}
                    </div>
                </section>
            </main>
            ${renderFooter(rootPrefix, 'projects')}
        `;

        enhanceProjectCardInteractions();
    }

    function renderZoomableFigure({ src, alt, figureClass = '', imgClass = '', loading = 'lazy' }) {
        return `
            <figure class="${figureClass} study-zoomable" data-zoomable-src="${escapeHtml(src)}" data-zoomable-alt="${escapeHtml(alt)}">
                <img${imgClass ? ` class="${imgClass}"` : ''} src="${src}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async" />
            </figure>
        `;
    }

    function renderBlock(block, rootPrefix, mode) {
        const asset = (source) => mode === 'project' && source && !/^(https?:)?\/\//.test(source) ? source : linkAsset(rootPrefix, source);
        if (block.type === 'copy') {
            return `
                <section class="study-copy">
                    <div class="study-copy-block">
                            ${block.kicker ? `<span class="study-copy-kicker">${escapeHtml(block.kicker)}</span>` : ''}
                        ${block.text ? `<p>${escapeHtml(block.text)}</p>` : ''}
                    </div>
                </section>
            `;
        }

        if (block.type === 'heading') {
            return `
                <section class="study-section-heading">
                    <h2 class="study-section-title">${escapeHtml(block.title)}</h2>
                </section>
            `;
        }

        if (block.type === 'pair') {
            return `
                <div class="study-gallery-pair">
                    ${(block.items || []).map((item) => renderZoomableFigure({
                        src: asset(item.src),
                        alt: item.alt,
                        figureClass: item.fitContain ? 'study-fit-contain' : '',
                        imgClass: item.fitContain ? 'study-fit-contain' : '',
                    })).join('')}
                </div>
            `;
        }

        if (block.type === 'image') {
            return renderZoomableFigure({
                src: asset(block.src),
                alt: block.alt,
                figureClass: `study-frame${block.fitContain ? ' study-fit-contain' : ''}`,
                imgClass: block.fitContain ? 'study-fit-contain' : '',
            });
        }

        if (block.type === 'grid') {
            return `
                <div class="study-gallery-grid">
                    ${(block.items || []).map((item, itemIndex) => {
                        const widthClass = item.width && item.width !== 'quarter' ? ` study-thumb-${item.width}` : '';
                        const fitClass = item.fitContain ? ' study-fit-contain' : '';
                        return renderZoomableFigure({
                            src: asset(item.src),
                            alt: item.alt,
                            figureClass: `study-thumb${widthClass}${fitClass}`,
                            imgClass: fitClass ? 'study-fit-contain' : '',
                            loading: itemIndex < 2 ? 'eager' : 'lazy',
                        });
                    }).join('')}
                </div>
            `;
        }

        return '';
    }

    function renderProjectPage(rootPrefix, slug) {
        const project = projectsBySlug.get(slug);
        if (!project) {
            document.title = 'Projet introuvable';
            document.body.innerHTML = `${renderHeader(rootPrefix, 'projects')}<main><section class="study-hero"><div class="container"><h1 class="study-title">Projet introuvable</h1></div></section></main>${renderFooter(rootPrefix, 'projects')}`;
            return;
        }

        document.title = project.title;
        const hasAside = project.layout === 'detail' && project.characteristics.length > 0;
        const layoutInner = project.layout === 'gallery'
            ? `
                <section class="study-layout">
                    <div class="container">
                        ${(project.blocks || []).map((block) => renderBlock(block, rootPrefix, 'project')).join('')}
                    </div>
                </section>
            `
            : `
                <section class="study-layout">
                    <div class="container study-layout-grid">
                        ${hasAside ? `
                            <aside class="study-side">
                                <p class="study-side-text">Caractéristiques</p>
                                <ul class="study-side-list">
                                    ${project.characteristics.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
                                </ul>
                            </aside>
                        ` : ''}
                        <div class="study-flow">
                            ${(project.blocks || []).map((block) => renderBlock(block, rootPrefix, 'project')).join('')}
                        </div>
                    </div>
                </section>
            `;

        document.body.innerHTML = `
            ${renderHeader(rootPrefix, 'projects')}
            <main class="study-page">
                <section class="study-hero">
                    <div class="container">
                        <a class="project-back-link" href="${rootPrefix}index.html#projets" aria-label="Retour aux projets">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M19 12H5M11 6l-6 6 6 6" />
                            </svg>
                            <span>Retour aux projets</span>
                        </a>
                        <div class="study-hero-grid">
                            <div>
                                ${project.type ? `<div class="study-type">${escapeHtml(project.type)}</div>` : ''}
                                <h1 class="study-title">${escapeHtml(project.title)}</h1>
                                ${project.intro ? `<p class="study-intro">${escapeHtml(project.intro)}</p>` : ''}
                            </div>
                            ${project.date ? `
                                <div class="study-meta">
                                    <div class="study-meta-block"><span class="meta-label">Date</span><strong>${escapeHtml(project.date)}</strong></div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </section>
                ${layoutInner}
            </main>
            <div class="study-lightbox" data-study-lightbox hidden aria-hidden="true" role="dialog" aria-modal="true" aria-label="Galerie du projet">
                <div class="study-lightbox-backdrop" data-study-lightbox-close></div>
                <div class="study-lightbox-dialog">
                    <button class="study-lightbox-arrow study-lightbox-prev" type="button" data-study-lightbox-prev aria-label="Image précédente">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <img data-study-lightbox-image src="" alt="" />
                    <button class="study-lightbox-arrow study-lightbox-next" type="button" data-study-lightbox-next aria-label="Image suivante">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                    <span class="study-lightbox-counter" data-study-lightbox-counter aria-live="polite"></span>
                </div>
            </div>
            ${renderFooter(rootPrefix, 'projects')}
        `;
        enhanceProjectImageZoom();
    }

    function enhanceProjectImageZoom() {
        const lightbox = document.querySelector('[data-study-lightbox]');
        const lightboxImage = document.querySelector('[data-study-lightbox-image]');
        const previousButton = document.querySelector('[data-study-lightbox-prev]');
        const nextButton = document.querySelector('[data-study-lightbox-next]');
        const counter = document.querySelector('[data-study-lightbox-counter]');
        const dialog = lightbox?.querySelector('.study-lightbox-dialog');
        const figures = Array.from(document.querySelectorAll('.study-zoomable'));
        const imageNumberFromSource = (source) => {
            const cleanSource = String(source || '').split(/[?#]/, 1)[0];
            const filename = cleanSource.split('/').pop() || '';
            const match = filename.match(/(?:^|[-_])(\d+)\.[^.]+$/);
            return match ? String(Number(match[1])) : '';
        };
        const images = figures.map((figure, originalIndex) => {
            const src = figure.dataset.zoomableSrc;
            return {
                figure,
                src,
                alt: figure.dataset.zoomableAlt || '',
                number: imageNumberFromSource(src),
                originalIndex,
            };
        }).filter((image) => image.src).sort((firstImage, secondImage) => {
            const firstNumber = Number(firstImage.number);
            const secondNumber = Number(secondImage.number);
            const firstIsNumbered = Number.isFinite(firstNumber) && firstImage.number !== '';
            const secondIsNumbered = Number.isFinite(secondNumber) && secondImage.number !== '';

            if (firstIsNumbered && secondIsNumbered && firstNumber !== secondNumber) {
                return firstNumber - secondNumber;
            }
            if (firstIsNumbered !== secondIsNumbered) {
                return firstIsNumbered ? -1 : 1;
            }
            return firstImage.originalIndex - secondImage.originalIndex;
        });
        let activeIndex = -1;
        let activeTrigger = null;

        if (!lightbox || !lightboxImage || !previousButton || !nextButton || images.length === 0) {
            return;
        }

        const hasMultipleImages = images.length > 1;
        previousButton.hidden = !hasMultipleImages;
        nextButton.hidden = !hasMultipleImages;

        const normaliseIndex = (index) => (index + images.length) % images.length;

        const preloadAdjacentImages = () => {
            [-1, 1].forEach((offset) => {
                const adjacent = images[normaliseIndex(activeIndex + offset)];
                const preload = new Image();
                preload.src = adjacent.src;
            });
        };

        const showImage = (index) => {
            activeIndex = normaliseIndex(index);
            const image = images[activeIndex];
            lightboxImage.src = image.src;
            lightboxImage.alt = image.alt;
            if (counter) {
                counter.textContent = `${image.number || activeIndex + 1} / ${images.length}`;
            }
            preloadAdjacentImages();
        };

        const closeLightbox = () => {
            lightbox.hidden = true;
            lightbox.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('study-lightbox-open');
            lightboxImage.src = '';
            lightboxImage.alt = '';
            activeIndex = -1;
            if (activeTrigger) {
                activeTrigger.focus({ preventScroll: true });
                activeTrigger = null;
            }
        };

        const openLightbox = (index, trigger) => {
            activeTrigger = trigger;
            showImage(index);
            lightbox.hidden = false;
            lightbox.setAttribute('aria-hidden', 'false');
            document.body.classList.add('study-lightbox-open');
            if (hasMultipleImages) {
                nextButton.focus({ preventScroll: true });
            }
        };

        images.forEach((image, index) => {
            const figure = image.figure;
            const imageNumber = image.number || String(index + 1);
            figure.tabIndex = 0;
            figure.setAttribute('role', 'button');
            figure.setAttribute('aria-label', `Agrandir l’image ${imageNumber} sur ${images.length}`);
            figure.addEventListener('click', () => openLightbox(index, figure));
            figure.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openLightbox(index, figure);
                }
            });
        });

        previousButton.addEventListener('click', () => showImage(activeIndex - 1));
        nextButton.addEventListener('click', () => showImage(activeIndex + 1));

        lightbox.querySelectorAll('[data-study-lightbox-close]').forEach((node) => {
            node.addEventListener('click', closeLightbox);
        });
        lightboxImage.addEventListener('click', closeLightbox);
        dialog?.addEventListener('click', (event) => {
            if (event.target === dialog || event.target === counter) {
                closeLightbox();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !lightbox.hidden) {
                closeLightbox();
            }
            if (event.key === 'ArrowLeft' && !lightbox.hidden) {
                showImage(activeIndex - 1);
            }
            if (event.key === 'ArrowRight' && !lightbox.hidden) {
                showImage(activeIndex + 1);
            }
        });
    }

    const content = clone(window.PORTFOLIO_CONTENT || {});
    const projects = (content.projects || []).map((project, index) => normaliseProject({ ...project, globalNumber: index + 1 }));
    const projectsBySlug = new Map(projects.map((project) => [project.slug, project]));

    document.addEventListener('DOMContentLoaded', () => {
        const body = document.body;
        const rootPrefix = body.dataset.rootPrefix || '';
        const page = body.dataset.page;

        if (page === 'home') {
            renderHome(rootPrefix);
            return;
        }

        if (page === 'projects') {
            renderProjectsPage(rootPrefix);
            return;
        }

        if (page === 'project') {
            renderProjectPage(rootPrefix, body.dataset.projectSlug);
        }
    });
}());
