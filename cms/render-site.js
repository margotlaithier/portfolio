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
                        <a href="${current === 'home' ? '#vision' : `${toHome}#vision`}" data-nav="vision">À propos</a>
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
                                <a href="${current === 'home' ? '#vision' : `${toHome}#vision`}">À propos</a>
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
        return `
            <a class="portfolio-card card-${escapeHtml(project.cardSize)}" href="${rootPrefix}${project.path}">
                <img src="${linkAsset(rootPrefix, project.cardImage)}" alt="${escapeHtml(project.cardAlt || project.title)}" />
                <span class="card-number">${escapeHtml(String(project.cardNumber || '').padStart(2, '0'))}</span>
                <div class="corner-arrow">
                    <svg viewBox="0 0 24 24">
                        <path d="M7 17L17 7M7 7h10v10" />
                    </svg>
                </div>
                <div class="overlay">
                    <span class="overlay-tag">${escapeHtml(project.cardYear || '')}</span>
                    <h2 class="overlay-title">${project.cardTitleHtml}</h2>
                    <p class="overlay-desc">${escapeHtml(project.cardDescription || '')}</p>
                    <span class="overlay-cta"><span class="cta-line"></span>Voir le projet</span>
                </div>
            </a>
        `;
    }

    function enhanceHomeInteractions() {
        const panels = Array.from(document.querySelectorAll('.page-panel'));
        const navLinks = Array.from(document.querySelectorAll('[data-nav]'));
        const dots = Array.from(document.querySelectorAll('[data-dot]'));
        const cards = document.querySelectorAll('.portfolio-card');
        const isTouchDevice = window.matchMedia('(hover: none)').matches;

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
            let currentPanel = panels[0];

            panels.forEach((panel) => {
                const rect = panel.getBoundingClientRect();
                const panelMiddle = rect.top + rect.height / 2;
                const distanceToCenter = Math.abs(panelMiddle - viewportCenter);

                if (!currentPanel || distanceToCenter < Math.abs((currentPanel.getBoundingClientRect().top + currentPanel.getBoundingClientRect().height / 2) - viewportCenter)) {
                    currentPanel = panel;
                }

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

        if (isTouchDevice) {
            cards.forEach((card) => {
                card.addEventListener('click', (event) => {
                    if (!card.classList.contains('active')) {
                        event.preventDefault();
                        cards.forEach((item) => item.classList.remove('active'));
                        card.classList.add('active');
                    }
                });
            });

            document.addEventListener('click', (event) => {
                if (!event.target.closest('.portfolio-card')) {
                    cards.forEach((card) => card.classList.remove('active'));
                }
            });
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
    }

    function renderHome(rootPrefix) {
        const selectedProjects = content.home.featured.selectedSlugs
            .map((slug) => projectsBySlug.get(slug))
            .filter(Boolean)
            .map((project, index) => ({ ...project, cardNumber: index + 1 }));

        const heroImages = content.home.hero.images || [];
        const [largeImage, smallImage] = heroImages;

        document.title = content.site.portfolioTitle || 'Portfolio';
        document.body.innerHTML = `
            ${renderHeader(rootPrefix, 'home')}
            <div class="panel-rail" aria-hidden="true">
                <span class="panel-dot" data-dot="intro"></span>
                <span class="panel-dot" data-dot="vision"></span>
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

                    <section class="page-panel manifesto-panel" id="vision" data-panel="vision">
                        <div class="panel-inner">
                            <div class="manifesto-side">
                                <span class="panel-label">${escapeHtml(content.home.about.panelLabel)}</span>
                                <strong>${escapeHtml(content.home.about.lead)}</strong>
                                <span>${escapeHtml(content.home.about.caption)}</span>
                            </div>

                            <div class="manifesto-grid">
                                ${(content.home.about.cards || []).map((card) => `
                                    <article class="manifesto-card">
                                        <h3>${escapeHtml(card.title)}</h3>
                                        <p>${escapeHtml(card.text)}</p>
                                    </article>
                                `).join('')}
                            </div>
                        </div>
                    </section>

                    <section class="page-panel projets-panel" id="projets" data-panel="projets">
                        <div class="panel-inner">
                            <div class="projets-head">
                                <div>
                                    <span class="panel-label">${escapeHtml(content.home.featured.panelLabel)}</span>
                                    <h2 class="projets-title">${escapeHtml(content.home.featured.title)}</h2>
                                </div>
                                <a class="projets-link" href="${rootPrefix}projets.html">${escapeHtml(content.home.featured.linkLabel)}</a>
                            </div>

                            <div class="portfolio-grid">
                                ${selectedProjects.map((project) => renderProjectCard(project, rootPrefix)).join('')}
                            </div>
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
        const categoryParam = new URLSearchParams(window.location.search).get('category');
        document.title = 'Projets';

        const groupedMarkup = content.categories.map((category) => {
            const items = projects.filter((project) => project.category === category.title);
            return `
                <div class="projets-group">
                    <div class="group-head">
                        <h2 class="group-title">${escapeHtml(category.title)}</h2>
                        <a class="group-link" href="${rootPrefix}projets.html?category=${encodeURIComponent(category.title)}">${escapeHtml(content.projectsPage.categoryLinkLabel)}</a>
                    </div>
                    <div class="projets-row">
                        ${items.map((project, index) => renderProjectCard({ ...project, cardNumber: project.cardNumber || project.globalNumber || index + 1 }, rootPrefix)).join('')}
                    </div>
                </div>
            `;
        }).join('');

        let flowMarkup = '';
        let pageTitle = content.projectsPage.heroTitle;
        if (categoryParam) {
            const filteredProjects = projects.filter((project) => project.category === categoryParam);
            pageTitle = categoryParam;
            flowMarkup = `
                <div class="projets-flow-view">
                    <div class="projets-flow">
                        ${groupBy(filteredProjects, 3).map((row, index) => `
                            <div class="projets-row">
                                ${row.map((project) => renderProjectCard({ ...project, cardNumber: index * 3 + 1 }, rootPrefix)).join('')}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        document.body.classList.toggle('page-projets-continu', Boolean(categoryParam));
        document.body.innerHTML = `
            ${renderHeader(rootPrefix, 'projects')}
            <main>
                <section class="hero">
                    <div class="container hero-grid">
                        <div>
                            <span class="section-label">${escapeHtml(content.projectsPage.heroLabel)}</span>
                            <h1 class="page-title">${escapeHtml(pageTitle)}</h1>
                        </div>
                    </div>
                </section>

                <section class="projets-section">
                    <div class="container">
                        ${categoryParam ? flowMarkup : `<div class="projets-grouped-view">${groupedMarkup}</div>`}
                    </div>
                </section>
            </main>
            ${renderFooter(rootPrefix, 'projects')}
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
                    ${(block.items || []).map((item) => `
                        <figure${item.fitContain ? ' class="study-fit-contain"' : ''}>
                            <img${item.fitContain ? ' class="study-fit-contain"' : ''} src="${asset(item.src)}" alt="${escapeHtml(item.alt)}" />
                        </figure>
                    `).join('')}
                </div>
            `;
        }

        if (block.type === 'image') {
            return `
                <figure class="study-frame${block.fitContain ? ' study-fit-contain' : ''}">
                    <img${block.fitContain ? ' class="study-fit-contain"' : ''} src="${asset(block.src)}" alt="${escapeHtml(block.alt)}" />
                </figure>
            `;
        }

        if (block.type === 'grid') {
            return `
                <div class="study-gallery-grid">
                    ${(block.items || []).map((item) => {
                        const widthClass = item.width && item.width !== 'quarter' ? ` study-thumb-${item.width}` : '';
                        const fitClass = item.fitContain ? ' study-fit-contain' : '';
                        return `
                            <figure class="study-thumb${widthClass}${fitClass}">
                                <img${fitClass ? ' class="study-fit-contain"' : ''} src="${asset(item.src)}" alt="${escapeHtml(item.alt)}" />
                            </figure>
                        `;
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
                    <div class="container study-hero-grid">
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
                </section>
                ${layoutInner}
            </main>
            ${renderFooter(rootPrefix, 'projects')}
        `;
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
