(function () {
    const STORAGE_KEY = 'portfolio-studio-draft-v1';
    const GITHUB_CONFIG_KEY = 'portfolio-studio-github-v1';

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

    function jsPayload(data) {
        return `window.PORTFOLIO_CONTENT = ${JSON.stringify(data, null, 2)};\n`;
    }

    function download(name, content, type) {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
    }

    function encodeBase64Utf8(value) {
        return btoa(unescape(encodeURIComponent(value)));
    }

    function defaultGitHubConfig() {
        return {
            enabled: false,
            owner: '',
            repo: '',
            branch: 'main',
            path: 'cms/portfolio-content.js',
            token: '',
            currentSha: '',
            commitMessage: 'Studio portfolio update',
        };
    }

    const state = {
        data: clone(window.PORTFOLIO_CONTENT || {}),
        activeSection: 'site',
        activeProjectSlug: (window.PORTFOLIO_CONTENT?.projects || [])[0]?.slug || '',
        saveState: 'Brouillon local uniquement',
        serverWritable: false,
        github: defaultGitHubConfig(),
        dirty: false,
        commitStatus: 'idle',
        saveQueued: false,
        saveInFlight: false,
        saveTimer: null,
    };

    try {
        const draft = localStorage.getItem(STORAGE_KEY);
        if (draft) {
            state.data = JSON.parse(draft);
        }
    } catch (error) {
        console.warn('Impossible de charger le brouillon studio.', error);
    }

    try {
        const githubDraft = localStorage.getItem(GITHUB_CONFIG_KEY);
        if (githubDraft) {
            state.github = { ...defaultGitHubConfig(), ...JSON.parse(githubDraft) };
        }
    } catch (error) {
        console.warn('Impossible de charger la configuration GitHub.', error);
    }

    const root = document.getElementById('studio-app');

    function hasGitHubSync() {
        return Boolean(
            state.github.enabled &&
            state.github.owner &&
            state.github.repo &&
            state.github.branch &&
            state.github.path &&
            state.github.token
        );
    }

    function persistGitHubConfig() {
        localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(state.github));
    }

    function activeSaveTargetLabel() {
        if (hasGitHubSync()) {
            if (state.commitStatus === 'pending') {
                return 'Commit GitHub en cours...';
            }
            if (state.commitStatus === 'error') {
                return 'Échec du commit GitHub. Studio verrouillé jusqu’au prochain commit.';
            }
            if (state.dirty) {
                return 'Modifications locales en attente de commit GitHub';
            }
            if (state.commitStatus === 'success') {
                return 'Commit GitHub réussi';
            }
            return 'GitHub direct actif';
        }
        if (state.serverWritable) {
            return 'Auto-enregistrement direct actif';
        }
        return 'Brouillon local uniquement';
    }

    function isStudioLocked() {
        return hasGitHubSync() && (state.commitStatus === 'pending' || state.commitStatus === 'error');
    }

    async function fetchGitHubSha() {
        const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(state.github.owner)}/${encodeURIComponent(state.github.repo)}/contents/${state.github.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(state.github.branch)}`, {
            headers: {
                Authorization: `Bearer ${state.github.token}`,
                Accept: 'application/vnd.github+json',
            },
        });
        if (!response.ok) {
            throw new Error(`github_read_failed_${response.status}`);
        }
        const payload = await response.json();
        state.github.currentSha = payload.sha || '';
        persistGitHubConfig();
        return payload.sha || '';
    }

    async function testGitHubConnection() {
        if (!hasGitHubSync()) {
            state.saveState = 'Configuration GitHub incomplète';
            updateSaveState();
            return;
        }
        state.saveState = 'Test de connexion GitHub...';
        updateSaveState();
        try {
            const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(state.github.owner)}/${encodeURIComponent(state.github.repo)}/contents/${state.github.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(state.github.branch)}`, {
                headers: {
                    Authorization: `Bearer ${state.github.token}`,
                    Accept: 'application/vnd.github+json',
                },
            });
            if (!response.ok) {
                throw new Error(`github_test_failed_${response.status}`);
            }
            const payload = await response.json();
            state.github.currentSha = payload.sha || '';
            persistGitHubConfig();
            state.saveState = 'Connexion GitHub OK';
        } catch (error) {
            console.error(error);
            state.saveState = 'Connexion GitHub échouée';
        }
        updateSaveState();
    }

    async function commitStudioChanges() {
        if (!hasGitHubSync() || state.saveInFlight || !state.dirty) {
            return;
        }
        await flushGitHubSave();
    }

    async function flushServerSave() {
        if (!state.serverWritable || hasGitHubSync()) {
            return;
        }
        if (state.saveInFlight) {
            state.saveQueued = true;
            return;
        }
        state.saveInFlight = true;
        state.saveState = 'Enregistrement...';
        updateSaveState();
        try {
            const response = await fetch('/__studio/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: state.data }),
            });
            if (!response.ok) {
                throw new Error(`save_failed_${response.status}`);
            }
            state.saveState = 'Fichier enregistré automatiquement';
        } catch (error) {
            console.error(error);
            state.saveState = 'Échec de l’enregistrement automatique';
        } finally {
            state.saveInFlight = false;
            updateSaveState();
            if (state.saveQueued) {
                state.saveQueued = false;
                flushServerSave();
            }
        }
    }

    async function flushGitHubSave() {
        if (!hasGitHubSync()) {
            return;
        }
        if (state.saveInFlight) {
            state.saveQueued = true;
            return;
        }
        state.saveInFlight = true;
        state.commitStatus = 'pending';
        state.saveState = activeSaveTargetLabel();
        render();
        updateSaveState();
        try {
            const sha = state.github.currentSha || await fetchGitHubSha();
            const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(state.github.owner)}/${encodeURIComponent(state.github.repo)}/contents/${state.github.path.split('/').map(encodeURIComponent).join('/')}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${state.github.token}`,
                    Accept: 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: state.github.commitMessage || 'Studio portfolio update',
                    content: encodeBase64Utf8(jsPayload(state.data)),
                    branch: state.github.branch,
                    sha,
                }),
            });
            if (!response.ok) {
                throw new Error(`github_save_failed_${response.status}`);
            }
            const payload = await response.json();
            state.github.currentSha = payload?.content?.sha || state.github.currentSha;
            persistGitHubConfig();
            state.dirty = false;
            state.commitStatus = 'success';
            state.saveState = activeSaveTargetLabel();
        } catch (error) {
            console.error(error);
            state.commitStatus = 'error';
            state.saveState = activeSaveTargetLabel();
        } finally {
            state.saveInFlight = false;
            updateSaveState();
            render();
        }
    }

    function updateSaveState() {
        const node = root.querySelector('[data-save-state]');
        if (node) {
            node.textContent = state.saveState;
        }
    }

    function persist() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
        if (hasGitHubSync()) {
            state.dirty = true;
            if (state.commitStatus !== 'error') {
                state.commitStatus = 'dirty';
            }
            state.saveState = activeSaveTargetLabel();
            updateSaveState();
            return;
        }
        if (state.serverWritable) {
            clearTimeout(state.saveTimer);
            state.saveTimer = setTimeout(() => {
                flushServerSave();
            }, 180);
        }
    }

    function projectBySlug(slug) {
        return state.data.projects.find((project) => project.slug === slug);
    }

    function updateProjectSlugList() {
        if (!projectBySlug(state.activeProjectSlug) && state.data.projects[0]) {
            state.activeProjectSlug = state.data.projects[0].slug;
        }
    }

    function bindInput(selector, handler) {
        root.querySelectorAll(selector).forEach((input) => {
            input.addEventListener('input', () => {
                handler(input);
                persist();
            });
            input.addEventListener('change', () => {
                handler(input);
                persist();
                render();
            });
        });
    }

    function addProject() {
        const slug = prompt('Slug du projet (ex: nouveau-projet)');
        if (!slug) return;
        const title = prompt('Titre du projet', slug.replace(/-/g, ' ')) || slug;
        state.data.projects.push({
            slug,
            path: `projets/${slug}/`,
            title,
            cardTitleHtml: title,
            type: 'Projet d\'étude',
            intro: '',
            date: '',
            category: state.data.categories[0]?.title || 'Projets',
            cardSize: 'third',
            cardImage: '',
            cardAlt: title,
            cardYear: '',
            cardDescription: '',
            layout: 'detail',
            characteristics: [],
            blocks: [],
        });
        state.activeProjectSlug = slug;
        persist();
        render();
    }

    function moveProject(direction) {
        const index = state.data.projects.findIndex((project) => project.slug === state.activeProjectSlug);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= state.data.projects.length) return;
        const [project] = state.data.projects.splice(index, 1);
        state.data.projects.splice(target, 0, project);
        persist();
        render();
    }

    function removeProject() {
        const index = state.data.projects.findIndex((project) => project.slug === state.activeProjectSlug);
        if (index < 0) return;
        const project = state.data.projects[index];
        if (!window.confirm(`Supprimer le projet "${project.title}" du contenu ?`)) {
            return;
        }
        state.data.projects.splice(index, 1);
        state.activeProjectSlug = state.data.projects[0]?.slug || '';
        persist();
        render();
    }

    function addCategory() {
        state.data.categories.push({ title: 'Nouvelle catégorie' });
        persist();
        render();
    }

    function moveCategory(index, direction) {
        const target = index + direction;
        if (target < 0 || target >= state.data.categories.length) return;
        const [category] = state.data.categories.splice(index, 1);
        state.data.categories.splice(target, 0, category);
        persist();
        render();
    }

    function removeCategory(index) {
        state.data.categories.splice(index, 1);
        persist();
        render();
    }

    function addHeroImage() {
        state.data.home.hero.images = state.data.home.hero.images || [];
        state.data.home.hero.images.push({
            size: 'small',
            src: '',
            alt: '',
        });
        persist();
        render();
    }

    function moveHeroImage(index, direction) {
        const images = state.data.home.hero.images || [];
        const target = index + direction;
        if (target < 0 || target >= images.length) return;
        const [image] = images.splice(index, 1);
        images.splice(target, 0, image);
        persist();
        render();
    }

    function removeHeroImage(index) {
        (state.data.home.hero.images || []).splice(index, 1);
        persist();
        render();
    }

    function addAboutCard() {
        state.data.home.about.cards = state.data.home.about.cards || [];
        state.data.home.about.cards.push({
            title: 'Nouvelle carte',
            text: '',
        });
        persist();
        render();
    }

    function moveAboutCard(index, direction) {
        const cards = state.data.home.about.cards || [];
        const target = index + direction;
        if (target < 0 || target >= cards.length) return;
        const [card] = cards.splice(index, 1);
        cards.splice(target, 0, card);
        persist();
        render();
    }

    function removeAboutCard(index) {
        (state.data.home.about.cards || []).splice(index, 1);
        persist();
        render();
    }

    function addBlock(type) {
        const project = projectBySlug(state.activeProjectSlug);
        if (!project) return;
        const templates = {
            copy: { type: 'copy', kicker: 'Intention', text: '' },
            heading: { type: 'heading', title: 'Nouveau sous-titre' },
            image: { type: 'image', src: '', alt: '', fitContain: false },
            pair: { type: 'pair', items: [{ src: '', alt: '', fitContain: false }, { src: '', alt: '', fitContain: false }] },
            grid: { type: 'grid', items: [{ src: '', alt: '', width: 'quarter', fitContain: false }] },
        };
        project.blocks.push(clone(templates[type]));
        persist();
        render();
    }

    function moveBlock(index, direction) {
        const project = projectBySlug(state.activeProjectSlug);
        if (!project) return;
        const target = index + direction;
        if (target < 0 || target >= project.blocks.length) return;
        const [block] = project.blocks.splice(index, 1);
        project.blocks.splice(target, 0, block);
        persist();
        render();
    }

    function removeBlock(index) {
        const project = projectBySlug(state.activeProjectSlug);
        if (!project) return;
        project.blocks.splice(index, 1);
        persist();
        render();
    }

    function addGridItem(blockIndex) {
        const project = projectBySlug(state.activeProjectSlug);
        if (!project) return;
        project.blocks[blockIndex].items.push({ src: '', alt: '', width: 'quarter', fitContain: false });
        persist();
        render();
    }

    function removeGridItem(blockIndex, itemIndex) {
        const project = projectBySlug(state.activeProjectSlug);
        if (!project) return;
        project.blocks[blockIndex].items.splice(itemIndex, 1);
        persist();
        render();
    }

    function activeSectionContent() {
        const project = projectBySlug(state.activeProjectSlug);
        if (state.activeSection === 'site') {
            return `
                <div class="studio-panel">
                    <div class="studio-card">
                        <h2>Infos générales</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Titre du portfolio</label><input data-path="site.portfolioTitle" value="${escapeHtml(state.data.site.portfolioTitle || '')}" /></div>
                            <div class="studio-field"><label>Baseline marque</label><input data-path="site.brandKicker" value="${escapeHtml(state.data.site.brandKicker || '')}" /></div>
                            <div class="studio-field"><label>Email</label><input data-path="site.email" value="${escapeHtml(state.data.site.email || '')}" /></div>
                            <div class="studio-field"><label>Localisation</label><input data-path="site.location" value="${escapeHtml(state.data.site.location || '')}" /></div>
                            <div class="studio-field"><label>Titre footer</label><input data-path="site.footerTitle" value="${escapeHtml(state.data.site.footerTitle || '')}" /></div>
                        </div>
                    </div>
                    <div class="studio-card">
                        <h2>Catégories</h2>
                        <div class="studio-list">
                            ${(state.data.categories || []).map((category, index) => `
                                <div class="studio-block">
                                    <div class="studio-block-header">
                                        <span class="studio-subtle-label">Catégorie ${index + 1}</span>
                                        <div class="studio-inline-actions">
                                            <button type="button" data-move-category="${index}" data-direction="-1">Monter</button>
                                            <button type="button" data-move-category="${index}" data-direction="1">Descendre</button>
                                            <button type="button" data-remove-category="${index}">Supprimer</button>
                                        </div>
                                    </div>
                                    <div class="studio-field">
                                        <label>Titre</label>
                                        <input data-category-field="${index}.title" value="${escapeHtml(category.title || '')}" />
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="studio-add" type="button" data-action="add-category">Ajouter une catégorie</button>
                    </div>
                    <div class="studio-card">
                        <h2>Synchronisation iPad / GitHub</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Activer</label><select data-github-field="enabled"><option value="false"${!state.github.enabled ? ' selected' : ''}>false</option><option value="true"${state.github.enabled ? ' selected' : ''}>true</option></select></div>
                            <div class="studio-field"><label>Owner</label><input data-github-field="owner" value="${escapeHtml(state.github.owner || '')}" /></div>
                            <div class="studio-field"><label>Repo</label><input data-github-field="repo" value="${escapeHtml(state.github.repo || '')}" /></div>
                            <div class="studio-field"><label>Branch</label><input data-github-field="branch" value="${escapeHtml(state.github.branch || '')}" /></div>
                            <div class="studio-field"><label>Chemin fichier</label><input data-github-field="path" value="${escapeHtml(state.github.path || '')}" /></div>
                            <div class="studio-field"><label>Message de commit</label><input data-github-field="commitMessage" value="${escapeHtml(state.github.commitMessage || '')}" /></div>
                        </div>
                        <div class="studio-field">
                            <label>Token GitHub</label>
                            <input type="password" data-github-field="token" value="${escapeHtml(state.github.token || '')}" />
                        </div>
                        <div class="studio-inline-actions">
                            <button type="button" data-action="test-github">Tester la connexion</button>
                        </div>
                        <div class="studio-note">Utilise un token GitHub finement limité avec accès écriture au contenu du dépôt. Ce mode permet l’édition depuis Safari sur iPad sans serveur local.</div>
                        <div class="studio-note">Chemin attendu par défaut : <code>cms/portfolio-content.js</code>.</div>
                    </div>
                </div>
            `;
        }

        if (state.activeSection === 'home') {
            return `
                <div class="studio-panel">
                    <div class="studio-card">
                        <h2>Page d'accueil</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Label hero</label><input data-path="home.hero.panelLabel" value="${escapeHtml(state.data.home.hero.panelLabel || '')}" /></div>
                            <div class="studio-field"><label>Caption</label><input data-path="home.hero.caption" value="${escapeHtml(state.data.home.hero.caption || '')}" /></div>
                        </div>
                        <div class="studio-field">
                            <label>Lignes du grand titre</label>
                            <textarea data-plain-list="home.hero.titleLines">${escapeHtml((state.data.home.hero.titleLines || []).join('\n'))}</textarea>
                        </div>
                        <div class="studio-field">
                            <label>Texte hero</label>
                            <textarea data-path="home.hero.text">${escapeHtml(state.data.home.hero.text || '')}</textarea>
                        </div>
                        <div class="studio-field">
                            <label>Note hero</label>
                            <input data-path="home.hero.note" value="${escapeHtml(state.data.home.hero.note || '')}" />
                        </div>
                    </div>
                    <div class="studio-card">
                        <div class="studio-block-header">
                            <h2>Images hero</h2>
                            <div class="studio-inline-actions">
                                <button type="button" data-action="add-hero-image">Ajouter une image</button>
                            </div>
                        </div>
                        <div class="studio-list">
                            ${(state.data.home.hero.images || []).map((image, index) => `
                                <div class="studio-block">
                                    <div class="studio-block-header">
                                        <span class="studio-subtle-label">Image ${index + 1}</span>
                                        <div class="studio-inline-actions">
                                            <button type="button" data-move-hero-image="${index}" data-direction="-1">Monter</button>
                                            <button type="button" data-move-hero-image="${index}" data-direction="1">Descendre</button>
                                            <button type="button" data-remove-hero-image="${index}">Supprimer</button>
                                        </div>
                                    </div>
                                    <div class="studio-grid-3">
                                        <div class="studio-field">
                                            <label>Taille</label>
                                            <select data-hero-image-field="${index}.size">
                                                <option value="large"${image.size === 'large' ? ' selected' : ''}>large</option>
                                                <option value="small"${image.size === 'small' ? ' selected' : ''}>small</option>
                                            </select>
                                        </div>
                                        <div class="studio-field">
                                            <label>Src</label>
                                            <input data-hero-image-field="${index}.src" value="${escapeHtml(image.src || '')}" />
                                        </div>
                                        <div class="studio-field">
                                            <label>Alt</label>
                                            <input data-hero-image-field="${index}.alt" value="${escapeHtml(image.alt || '')}" />
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="studio-card">
                        <h2>À propos</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Label</label><input data-path="home.about.panelLabel" value="${escapeHtml(state.data.home.about.panelLabel || '')}" /></div>
                            <div class="studio-field"><label>Petit texte</label><input data-path="home.about.caption" value="${escapeHtml(state.data.home.about.caption || '')}" /></div>
                        </div>
                        <div class="studio-field"><label>Accroche</label><textarea data-path="home.about.lead">${escapeHtml(state.data.home.about.lead || '')}</textarea></div>
                    </div>
                    <div class="studio-card">
                        <div class="studio-block-header">
                            <h2>Cartes À propos</h2>
                            <div class="studio-inline-actions">
                                <button type="button" data-action="add-about-card">Ajouter une carte</button>
                            </div>
                        </div>
                        <div class="studio-list">
                            ${(state.data.home.about.cards || []).map((card, index) => `
                                <div class="studio-block">
                                    <div class="studio-block-header">
                                        <span class="studio-subtle-label">Carte ${index + 1}</span>
                                        <div class="studio-inline-actions">
                                            <button type="button" data-move-about-card="${index}" data-direction="-1">Monter</button>
                                            <button type="button" data-move-about-card="${index}" data-direction="1">Descendre</button>
                                            <button type="button" data-remove-about-card="${index}">Supprimer</button>
                                        </div>
                                    </div>
                                    <div class="studio-grid">
                                        <div class="studio-field"><label>Titre</label><input data-about-card-field="${index}.title" value="${escapeHtml(card.title || '')}" /></div>
                                        <div class="studio-field"><label>Texte</label><textarea data-about-card-field="${index}.text">${escapeHtml(card.text || '')}</textarea></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="studio-card">
                        <h2>Sélection et contact</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Label sélection</label><input data-path="home.featured.panelLabel" value="${escapeHtml(state.data.home.featured.panelLabel || '')}" /></div>
                            <div class="studio-field"><label>Titre sélection</label><input data-path="home.featured.title" value="${escapeHtml(state.data.home.featured.title || '')}" /></div>
                            <div class="studio-field"><label>Lien sélection</label><input data-path="home.featured.linkLabel" value="${escapeHtml(state.data.home.featured.linkLabel || '')}" /></div>
                            <div class="studio-field"><label>Label contact</label><input data-path="home.contact.panelLabel" value="${escapeHtml(state.data.home.contact.panelLabel || '')}" /></div>
                            <div class="studio-field"><label>Titre contact</label><input data-path="home.contact.title" value="${escapeHtml(state.data.home.contact.title || '')}" /></div>
                            <div class="studio-field"><label>Email contact</label><input data-path="home.contact.email" value="${escapeHtml(state.data.home.contact.email || '')}" /></div>
                            <div class="studio-field"><label>Localisation contact</label><input data-path="home.contact.location" value="${escapeHtml(state.data.home.contact.location || '')}" /></div>
                        </div>
                        <div class="studio-field"><label>Projets mis en avant</label><textarea data-plain-list="home.featured.selectedSlugs">${escapeHtml((state.data.home.featured.selectedSlugs || []).join('\n'))}</textarea></div>
                        <div class="studio-field"><label>Texte contact</label><textarea data-path="home.contact.text">${escapeHtml(state.data.home.contact.text || '')}</textarea></div>
                        <div class="studio-note">Utilise un slug par ligne pour la sélection, dans l'ordre d'affichage voulu.</div>
                    </div>
                    <div class="studio-card">
                        <h2>Référence du portfolio existant</h2>
                        <div class="studio-note">Cette section pilote directement les blocs déjà rendus par le vrai index.html public : hero, manifeste, sélection et contact.</div>
                        <div class="studio-note">Les changements ici doivent donc se refléter sur la page d’accueil sans reprendre le code à la main.</div>
                    </div>
                </div>
            `;
        }

        if (state.activeSection === 'projects-page') {
            return `
                <div class="studio-panel">
                    <div class="studio-card">
                        <h2>Page projets</h2>
                        <div class="studio-grid">
                            <div class="studio-field"><label>Label hero</label><input data-path="projectsPage.heroLabel" value="${escapeHtml(state.data.projectsPage.heroLabel || '')}" /></div>
                            <div class="studio-field"><label>Titre hero</label><input data-path="projectsPage.heroTitle" value="${escapeHtml(state.data.projectsPage.heroTitle || '')}" /></div>
                            <div class="studio-field"><label>Label du lien catégorie</label><input data-path="projectsPage.categoryLinkLabel" value="${escapeHtml(state.data.projectsPage.categoryLinkLabel || '')}" /></div>
                        </div>
                        <div class="studio-note">L'ordre d'affichage des groupes suit l'ordre des catégories défini dans l’onglet Site.</div>
                        <div class="studio-note">L'ordre des cartes dans une catégorie suit l'ordre des projets dans l’onglet Pages projet.</div>
                    </div>
                    <div class="studio-card">
                        <h2>Référence du portfolio existant</h2>
                        <div class="studio-note">Cette section pilote la vue groupée de projets.html ainsi que la vue filtrée ?category=... déjà utilisée dans le portfolio.</div>
                    </div>
                </div>
            `;
        }

        if (!project) {
            return '<div class="studio-card"><p class="studio-note">Aucun projet sélectionné.</p></div>';
        }

        return `
            <div class="studio-panel">
                <div class="studio-card">
                    <div class="studio-block-header">
                        <h2>${escapeHtml(project.title)}</h2>
                        <div class="studio-inline-actions">
                            <button type="button" data-action="move-project" data-direction="-1">Monter</button>
                            <button type="button" data-action="move-project" data-direction="1">Descendre</button>
                            <button type="button" data-action="remove-project">Supprimer</button>
                        </div>
                    </div>
                    <div class="studio-grid-3">
                        <div class="studio-field"><label>Slug</label><input data-project-field="slug" value="${escapeHtml(project.slug)}" /></div>
                        <div class="studio-field"><label>Chemin</label><input data-project-field="path" value="${escapeHtml(project.path)}" /></div>
                        <div class="studio-field"><label>Catégorie</label><input data-project-field="category" value="${escapeHtml(project.category || '')}" /></div>
                        <div class="studio-field"><label>Titre</label><input data-project-field="title" value="${escapeHtml(project.title || '')}" /></div>
                        <div class="studio-field"><label>Type</label><input data-project-field="type" value="${escapeHtml(project.type || '')}" /></div>
                        <div class="studio-field"><label>Date</label><input data-project-field="date" value="${escapeHtml(project.date || '')}" /></div>
                        <div class="studio-field"><label>Année carte</label><input data-project-field="cardYear" value="${escapeHtml(project.cardYear || '')}" /></div>
                        <div class="studio-field"><label>Layout</label><select data-project-field="layout"><option value="detail"${project.layout === 'detail' ? ' selected' : ''}>detail</option><option value="gallery"${project.layout === 'gallery' ? ' selected' : ''}>gallery</option></select></div>
                        <div class="studio-field"><label>Titre carte HTML</label><input data-project-field="cardTitleHtml" value="${escapeHtml(project.cardTitleHtml || '')}" /></div>
                        <div class="studio-field"><label>Taille carte</label><select data-project-field="cardSize"><option value="third"${project.cardSize === 'third' ? ' selected' : ''}>third</option><option value="half"${project.cardSize === 'half' ? ' selected' : ''}>half</option><option value="wide"${project.cardSize === 'wide' ? ' selected' : ''}>wide</option></select></div>
                    </div>
                    <div class="studio-grid">
                        <div class="studio-field"><label>Image carte</label><input data-project-field="cardImage" value="${escapeHtml(project.cardImage || '')}" /></div>
                        <div class="studio-field"><label>Alt carte</label><input data-project-field="cardAlt" value="${escapeHtml(project.cardAlt || '')}" /></div>
                    </div>
                    <div class="studio-field"><label>Description carte</label><textarea data-project-field="cardDescription">${escapeHtml(project.cardDescription || '')}</textarea></div>
                    <div class="studio-field"><label>Introduction</label><textarea data-project-field="intro">${escapeHtml(project.intro || '')}</textarea></div>
                    <div class="studio-field"><label>Caractéristiques</label><textarea data-project-list="characteristics">${escapeHtml((project.characteristics || []).join('\n'))}</textarea></div>
                    <div class="studio-note">Cette fiche pilote à la fois la carte affichée dans projets.html et la page détaillée sous /projets/.</div>
                </div>

                <div class="studio-card">
                    <div class="studio-block-header">
                        <h2>Blocs de page</h2>
                        <div class="studio-inline-actions">
                            <button type="button" data-add-block="copy">Ajouter texte</button>
                            <button type="button" data-add-block="heading">Ajouter sous-titre</button>
                            <button type="button" data-add-block="image">Ajouter image</button>
                            <button type="button" data-add-block="pair">Ajouter paire</button>
                            <button type="button" data-add-block="grid">Ajouter grille</button>
                        </div>
                    </div>
                    <div class="studio-block-list">
                        ${(project.blocks || []).map((block, blockIndex) => renderBlockEditor(block, blockIndex)).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    function renderBlockEditor(block, blockIndex) {
        const blockActions = `
            <div class="studio-inline-actions">
                <button type="button" data-move-block="${blockIndex}" data-direction="-1">Monter</button>
                <button type="button" data-move-block="${blockIndex}" data-direction="1">Descendre</button>
                <button type="button" data-remove-block="${blockIndex}">Supprimer</button>
            </div>
        `;

        if (block.type === 'copy') {
            return `
                <div class="studio-block">
                    <div class="studio-block-header"><span class="studio-pill">Texte</span>${blockActions}</div>
                    <div class="studio-grid">
                        <div class="studio-field"><label>Kicker</label><input data-block-field="${blockIndex}.kicker" value="${escapeHtml(block.kicker || '')}" /></div>
                        <div class="studio-field"><label>Texte</label><textarea data-block-field="${blockIndex}.text">${escapeHtml(block.text || '')}</textarea></div>
                    </div>
                </div>
            `;
        }

        if (block.type === 'heading') {
            return `
                <div class="studio-block">
                    <div class="studio-block-header"><span class="studio-pill">Sous-titre</span>${blockActions}</div>
                    <div class="studio-field"><label>Titre</label><input data-block-field="${blockIndex}.title" value="${escapeHtml(block.title || '')}" /></div>
                </div>
            `;
        }

        if (block.type === 'image') {
            return `
                <div class="studio-block">
                    <div class="studio-block-header"><span class="studio-pill">Image seule</span>${blockActions}</div>
                    <div class="studio-grid-3">
                        <div class="studio-field"><label>Src</label><input data-block-field="${blockIndex}.src" value="${escapeHtml(block.src || '')}" /></div>
                        <div class="studio-field"><label>Alt</label><input data-block-field="${blockIndex}.alt" value="${escapeHtml(block.alt || '')}" /></div>
                        <div class="studio-field"><label>Fit contain</label><select data-block-field="${blockIndex}.fitContain"><option value="false"${!block.fitContain ? ' selected' : ''}>false</option><option value="true"${block.fitContain ? ' selected' : ''}>true</option></select></div>
                    </div>
                </div>
            `;
        }

        if (block.type === 'pair') {
            return `
                <div class="studio-block">
                    <div class="studio-block-header"><span class="studio-pill">Paire d’images</span>${blockActions}</div>
                    ${(block.items || []).map((item, itemIndex) => `
                        <div class="studio-grid-3">
                            <div class="studio-field"><label>Src ${itemIndex + 1}</label><input data-block-item-field="${blockIndex}.${itemIndex}.src" value="${escapeHtml(item.src || '')}" /></div>
                            <div class="studio-field"><label>Alt ${itemIndex + 1}</label><input data-block-item-field="${blockIndex}.${itemIndex}.alt" value="${escapeHtml(item.alt || '')}" /></div>
                            <div class="studio-field"><label>Fit contain</label><select data-block-item-field="${blockIndex}.${itemIndex}.fitContain"><option value="false"${!item.fitContain ? ' selected' : ''}>false</option><option value="true"${item.fitContain ? ' selected' : ''}>true</option></select></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (block.type === 'grid') {
            return `
                <div class="studio-block">
                    <div class="studio-block-header"><span class="studio-pill">Ligne de grille</span>${blockActions}</div>
                    <div class="studio-list">
                        ${(block.items || []).map((item, itemIndex) => `
                            <div class="studio-block">
                                <div class="studio-block-header"><span class="studio-subtle-label">Image ${itemIndex + 1}</span><div class="studio-inline-actions"><button type="button" data-remove-grid-item="${blockIndex}.${itemIndex}">Supprimer</button></div></div>
                                <div class="studio-grid-3">
                                    <div class="studio-field"><label>Src</label><input data-block-item-field="${blockIndex}.${itemIndex}.src" value="${escapeHtml(item.src || '')}" /></div>
                                    <div class="studio-field"><label>Alt</label><input data-block-item-field="${blockIndex}.${itemIndex}.alt" value="${escapeHtml(item.alt || '')}" /></div>
                                    <div class="studio-field"><label>Largeur</label><select data-block-item-field="${blockIndex}.${itemIndex}.width"><option value="quarter"${item.width === 'quarter' ? ' selected' : ''}>quarter</option><option value="third"${item.width === 'third' ? ' selected' : ''}>third</option><option value="half"${item.width === 'half' ? ' selected' : ''}>half</option><option value="wide"${item.width === 'wide' ? ' selected' : ''}>wide</option></select></div>
                                    <div class="studio-field"><label>Fit contain</label><select data-block-item-field="${blockIndex}.${itemIndex}.fitContain"><option value="false"${!item.fitContain ? ' selected' : ''}>false</option><option value="true"${item.fitContain ? ' selected' : ''}>true</option></select></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="studio-add" type="button" data-add-grid-item="${blockIndex}">Ajouter une image à la ligne</button>
                </div>
            `;
        }

        return '';
    }

    function render() {
        updateProjectSlugList();
        root.innerHTML = `
            <div class="studio-shell">
                <aside class="studio-sidebar">
                    <div class="studio-brand">
                        <span>Interface d’édition</span>
                        <strong>Studio</strong>
                    </div>

                    <div class="studio-nav">
                        <button type="button" data-section="site"${state.activeSection === 'site' ? ' class="is-active"' : ''}>Site</button>
                        <button type="button" data-section="home"${state.activeSection === 'home' ? ' class="is-active"' : ''}>Accueil</button>
                        <button type="button" data-section="projects-page"${state.activeSection === 'projects-page' ? ' class="is-active"' : ''}>Page projets</button>
                        <button type="button" data-section="projects"${state.activeSection === 'projects' ? ' class="is-active"' : ''}>Pages projet</button>
                    </div>

                    <div class="studio-project-picker">
                        <h2>Projets</h2>
                        <div class="studio-project-list">
                            ${state.data.projects.map((project) => `
                                <button type="button" data-project-slug="${escapeHtml(project.slug)}"${state.activeProjectSlug === project.slug ? ' class="is-active"' : ''}>${escapeHtml(project.title)}</button>
                            `).join('')}
                        </div>
                        <div class="studio-inline-actions" style="margin-top:0.9rem;">
                            <button type="button" data-action="add-project">Ajouter un projet</button>
                        </div>
                    </div>
                </aside>

                <div class="studio-main">
                    <div class="studio-toolbar">
                        <div>
                            <strong>Le site public lira le fichier <code>cms/portfolio-content.js</code>.</strong>
                            <div class="studio-note">En mode GitHub, les changements restent en brouillon jusqu’au bouton de commit.</div>
                            <div class="studio-note" data-save-state>${escapeHtml(state.saveState)}</div>
                        </div>
                        <div class="studio-toolbar-actions">
                            <button type="button" data-action="commit-github" class="studio-primary"${!hasGitHubSync() || !state.dirty || state.saveInFlight ? ' disabled' : ''}>Sauvegarder / Commit</button>
                            <button type="button" data-action="download-json">Télécharger JSON</button>
                            <button type="button" data-action="download-js">Télécharger portfolio-content.js</button>
                            <label>Importer JSON<input id="studio-import" class="studio-file-input" type="file" accept=".json,application/json" /></label>
                            <button type="button" data-action="reset-draft">Effacer le brouillon</button>
                        </div>
                    </div>

                    <div class="studio-content">
                        ${activeSectionContent()}
                    </div>
                </div>
            </div>
        `;

        root.querySelectorAll('[data-section]').forEach((button) => {
            button.addEventListener('click', () => {
                state.activeSection = button.dataset.section;
                render();
            });
        });

        root.querySelectorAll('[data-project-slug]').forEach((button) => {
            button.addEventListener('click', () => {
                state.activeProjectSlug = button.dataset.projectSlug;
                state.activeSection = 'projects';
                render();
            });
        });

        root.querySelector('[data-action="add-project"]')?.addEventListener('click', addProject);
        root.querySelector('[data-action="add-category"]')?.addEventListener('click', addCategory);
        root.querySelector('[data-action="add-hero-image"]')?.addEventListener('click', addHeroImage);
        root.querySelector('[data-action="add-about-card"]')?.addEventListener('click', addAboutCard);
        root.querySelector('[data-action="test-github"]')?.addEventListener('click', testGitHubConnection);
        root.querySelector('[data-action="commit-github"]')?.addEventListener('click', commitStudioChanges);
        root.querySelectorAll('[data-action="move-project"]').forEach((button) => {
            button.addEventListener('click', () => moveProject(Number(button.dataset.direction)));
        });
        root.querySelector('[data-action="remove-project"]')?.addEventListener('click', removeProject);
        root.querySelector('[data-action="download-json"]')?.addEventListener('click', () => download('portfolio-content.json', JSON.stringify(state.data, null, 2), 'application/json'));
        root.querySelector('[data-action="download-js"]')?.addEventListener('click', () => download('portfolio-content.js', jsPayload(state.data), 'application/javascript'));
        root.querySelector('[data-action="reset-draft"]')?.addEventListener('click', () => {
            localStorage.removeItem(STORAGE_KEY);
            state.data = clone(window.PORTFOLIO_CONTENT || {});
            state.saveState = state.serverWritable ? 'Brouillon réinitialisé, enregistrement...' : 'Brouillon local réinitialisé';
            persist();
            render();
        });

        root.querySelector('#studio-import')?.addEventListener('change', async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            state.data = JSON.parse(text);
            persist();
            render();
        });

        bindInput('[data-path]', (input) => {
            const path = input.dataset.path.split('.');
            let target = state.data;
            while (path.length > 1) {
                target = target[path.shift()];
            }
            target[path[0]] = input.value;
        });

        bindInput('[data-plain-list]', (input) => {
            const key = input.dataset.plainList;
            const values = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
            if (key === 'home.hero.titleLines') {
                state.data.home.hero.titleLines = values;
                return;
            }
            if (key === 'home.featured.selectedSlugs') {
                state.data.home.featured.selectedSlugs = values;
            }
        });

        bindInput('[data-category-field]', (input) => {
            const [index, field] = input.dataset.categoryField.split('.');
            state.data.categories[Number(index)][field] = input.value;
        });

        bindInput('[data-github-field]', (input) => {
            const field = input.dataset.githubField;
            state.github[field] = input.value === 'true' ? true : input.value === 'false' ? false : input.value;
            if (field !== 'currentSha') {
                state.github.currentSha = '';
            }
            persistGitHubConfig();
            if (!hasGitHubSync()) {
                state.commitStatus = 'idle';
            }
            state.saveState = activeSaveTargetLabel();
            updateSaveState();
        });

        bindInput('[data-hero-image-field]', (input) => {
            const [index, field] = input.dataset.heroImageField.split('.');
            state.data.home.hero.images[Number(index)][field] = input.value;
        });

        bindInput('[data-about-card-field]', (input) => {
            const [index, field] = input.dataset.aboutCardField.split('.');
            state.data.home.about.cards[Number(index)][field] = input.value;
        });

        bindInput('[data-project-field]', (input) => {
            const project = projectBySlug(state.activeProjectSlug);
            if (!project) return;
            const field = input.dataset.projectField;
            project[field] = input.tagName === 'SELECT' ? input.value : input.value;
            if (field === 'slug') {
                state.activeProjectSlug = input.value;
            }
        });

        bindInput('[data-project-list]', (input) => {
            const project = projectBySlug(state.activeProjectSlug);
            if (!project) return;
            project[input.dataset.projectList] = input.value.split('\n').map((item) => item.trim()).filter(Boolean);
        });

        bindInput('[data-block-field]', (input) => {
            const project = projectBySlug(state.activeProjectSlug);
            if (!project) return;
            const [blockIndex, field] = input.dataset.blockField.split('.');
            project.blocks[Number(blockIndex)][field] = input.value === 'true' ? true : input.value === 'false' ? false : input.value;
        });

        bindInput('[data-block-item-field]', (input) => {
            const project = projectBySlug(state.activeProjectSlug);
            if (!project) return;
            const [blockIndex, itemIndex, field] = input.dataset.blockItemField.split('.');
            project.blocks[Number(blockIndex)].items[Number(itemIndex)][field] = input.value === 'true' ? true : input.value === 'false' ? false : input.value;
        });

        root.querySelectorAll('[data-add-block]').forEach((button) => {
            button.addEventListener('click', () => addBlock(button.dataset.addBlock));
        });
        root.querySelectorAll('[data-move-block]').forEach((button) => {
            button.addEventListener('click', () => moveBlock(Number(button.dataset.moveBlock), Number(button.dataset.direction)));
        });
        root.querySelectorAll('[data-remove-block]').forEach((button) => {
            button.addEventListener('click', () => removeBlock(Number(button.dataset.removeBlock)));
        });
        root.querySelectorAll('[data-add-grid-item]').forEach((button) => {
            button.addEventListener('click', () => addGridItem(Number(button.dataset.addGridItem)));
        });
        root.querySelectorAll('[data-remove-grid-item]').forEach((button) => {
            button.addEventListener('click', () => {
                const [blockIndex, itemIndex] = button.dataset.removeGridItem.split('.').map(Number);
                removeGridItem(blockIndex, itemIndex);
            });
        });
        root.querySelectorAll('[data-move-category]').forEach((button) => {
            button.addEventListener('click', () => moveCategory(Number(button.dataset.moveCategory), Number(button.dataset.direction)));
        });
        root.querySelectorAll('[data-remove-category]').forEach((button) => {
            button.addEventListener('click', () => removeCategory(Number(button.dataset.removeCategory)));
        });
        root.querySelectorAll('[data-move-hero-image]').forEach((button) => {
            button.addEventListener('click', () => moveHeroImage(Number(button.dataset.moveHeroImage), Number(button.dataset.direction)));
        });
        root.querySelectorAll('[data-remove-hero-image]').forEach((button) => {
            button.addEventListener('click', () => removeHeroImage(Number(button.dataset.removeHeroImage)));
        });
        root.querySelectorAll('[data-move-about-card]').forEach((button) => {
            button.addEventListener('click', () => moveAboutCard(Number(button.dataset.moveAboutCard), Number(button.dataset.direction)));
        });
        root.querySelectorAll('[data-remove-about-card]').forEach((button) => {
            button.addEventListener('click', () => removeAboutCard(Number(button.dataset.removeAboutCard)));
        });

        if (isStudioLocked()) {
            root.querySelectorAll('input, textarea, select, button').forEach((node) => {
                if (
                    node.matches('[data-github-field]') ||
                    node.matches('[data-action="test-github"]') ||
                    node.matches('[data-action="commit-github"]') ||
                    node.matches('[data-section]') ||
                    node.matches('[data-project-slug]')
                ) {
                    return;
                }
                node.disabled = true;
            });
        }
    }

    async function initialise() {
        try {
            const response = await fetch('/__studio/status', { cache: 'no-store' });
            if (response.ok) {
                state.serverWritable = true;
                state.saveState = activeSaveTargetLabel();
            } else {
                state.saveState = hasGitHubSync() ? 'GitHub direct actif' : 'Serveur studio absent. Active GitHub direct ou ouvre http://localhost:4173/studio.html';
            }
        } catch (error) {
            state.saveState = hasGitHubSync() ? 'GitHub direct actif' : 'Serveur studio absent. Active GitHub direct ou ouvre http://localhost:4173/studio.html';
        }
        render();
    }

    initialise();
}());
