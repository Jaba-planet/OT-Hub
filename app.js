import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, doc, updateDoc, increment, addDoc, serverTimestamp, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = { 
    apiKey: "AIzaSyAnejFU2ohnH2TDzQLRbNVy41jDPUIs73Y", 
    authDomain: "kmtc-ot-papers.firebaseapp.com", 
    projectId: "kmtc-ot-papers", 
    storageBucket: "kmtc-ot-papers.firebasestorage.app", 
    messagingSenderId: "1056575026262", 
    appId: "1:1056575026262:web:2cdd202079b89e4ff8b7f7" 
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

try { enableIndexedDbPersistence(db); } catch (e) { console.log("Persistence error:", e); }

// --- CONFIG ---
const HOT_THRESHOLD = 1000; 
const FQE_UNITS = ['Physical Dysfunctions', 'Psychiatry', 'Human Occupations', 'Paediatrics'];
const NOTE_UNITS = [
    'First Aid', 'Sociology', 'Kinesiology and Ergonomics', 'Health statics', 'Neuroscience',
    'Conceptual and practice Models', 'Geriatrics', 'Community Based Rehabilitation',
    'Orthotics and prosthetics', 'Vocational Rehabilitation', 'Occupational Therapy Process',
    'Foundations of Occupational Therapy', 'Health system Management', 'Oncology',
    'Entrepreneurship', 'Research', 'Physical Dysfunctions', 'Psychiatry', 
    'Human Occupations', 'Paediatrics'
];

let allData = [], filteredItems = [];
let currentType = 'paper';
let currentUnitFilter = 'All'; 
let itemsRendered = 0;
const PAGE_SIZE = 15;
let detailsModalInstance = null;
let scrollObserver = null;
let deferredPrompt; // Global variable for the prompt

// --- 1. INSTALL PROMPT LISTENER (Global Scope) ---
// This must be outside window.onload to catch the event early
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    
    // Show your custom UI
    const promptDiv = document.getElementById('installPrompt');
    if(promptDiv) {
        promptDiv.classList.remove('d-none');
        
        const btn = document.getElementById('btnInstall');
        if(btn) {
            btn.addEventListener('click', async () => {
                // Hide the UI
                promptDiv.classList.add('d-none');
                // Show the install prompt
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                // We've used the prompt, and can't use it again, throw it away
                deferredPrompt = null;
            });
        }
    }
});

// --- UTILITIES ---
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function getUnitColor(unit) {
    const map = {
        'Anatomy': 'var(--color-anatomy)', 'Psychiatry': 'var(--color-psych)',
        'Paediatrics': 'var(--color-peds)', 'Physical Dysfunctions': 'var(--color-dysfunction)',
        'Human Occupations': 'var(--color-default)'
    };
    return map[unit] || 'var(--text-secondary)';
}

// --- INIT ---
window.addEventListener('load', () => {
    initTheme(); 
    
    // Splash Screen
    const splash = document.getElementById('custom-splash');
    if(splash) { 
        setTimeout(() => { 
            splash.style.opacity = '0'; 
            splash.style.visibility = 'hidden';
            setTimeout(() => splash.remove(), 600); 
        }, 2000); 
    }
    
    detailsModalInstance = new bootstrap.Modal(document.getElementById('detailsModal'));
    
    // Initialize Features
    initSwipeGestures(); 
    initPullToRefresh();
    initFabMenu();
    initSearchLogic(); 
    
    setupInfiniteScroll();
    loadData();
    initUploadForm();
});

// --- SEARCH LOGIC ---
function initSearchLogic() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('btnSearchToggle');
    const searchContainer = document.getElementById('searchContainer');
    const closeSearchBtn = document.getElementById('btnCloseSearch');

    if(searchInput) searchInput.addEventListener('keyup', prepareFilteredList);

    if (searchBtn && searchContainer) {
        searchBtn.addEventListener('click', () => {
            searchContainer.classList.remove('d-none');
            if(searchInput) searchInput.focus();
        });
    }

    if (closeSearchBtn && searchContainer) {
        closeSearchBtn.addEventListener('click', () => {
            searchContainer.classList.add('d-none');
            if(searchInput) {
                searchInput.value = ''; 
                prepareFilteredList();  
            }
        });
    }
}

// --- FAB SPEED DIAL ---
function initFabMenu() {
    const mainFab = document.getElementById('mainFab');
    const fabMenu = document.getElementById('fabMenu');
    
    if(mainFab && fabMenu) {
        mainFab.addEventListener('click', () => {
            mainFab.classList.toggle('active');
            fabMenu.classList.toggle('active');
            
            const icon = mainFab.querySelector('i');
            if(mainFab.classList.contains('active')) {
                icon.classList.remove('fa-plus');
                icon.classList.add('fa-times');
            } else {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-plus');
            }
        });
        
        fabMenu.querySelectorAll('.fab-mini').forEach(btn => {
            btn.addEventListener('click', () => {
                mainFab.click(); 
            });
        });
    }
}

// --- AGE CALCULATOR ---
window.calculateAge = () => {
    const dobInput = document.getElementById('calcDob').value;
    const testInput = document.getElementById('calcTestDate').value;
    
    if(!dobInput) { alert("Please enter Date of Birth"); return; }
    
    const dob = new Date(dobInput);
    const test = testInput ? new Date(testInput) : new Date(); 
    
    let years = test.getFullYear() - dob.getFullYear();
    let months = test.getMonth() - dob.getMonth();
    let days = test.getDate() - dob.getDate();
    
    if (days < 0) {
        months--;
        const prevMonth = new Date(test.getFullYear(), test.getMonth(), 0);
        days += prevMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }
    
    const resultDiv = document.getElementById('ageResult');
    const output = document.getElementById('ageOutput');
    
    if(resultDiv && output) {
        output.innerHTML = `${years}<span class="text-secondary" style="font-size:0.6em">Y</span> ${months}<span class="text-secondary" style="font-size:0.6em">M</span> ${days}<span class="text-secondary" style="font-size:0.6em">D</span>`;
        resultDiv.classList.remove('d-none');
        resultDiv.classList.add('animate__animated', 'animate__fadeIn');
    }
};

// --- 3D MODEL SWITCHER ---
window.switchModel = (modelName, btn) => {
    const viewer = document.getElementById('otp3dViewer');
    const loader = document.getElementById('modelLoader');
    
    if(loader) loader.classList.remove('d-none');
    
    // Default to online skeleton for demo, otherwise local assets
    let newSrc = `assets/${modelName}.glb`;
    if(modelName === 'skeleton') newSrc = "https://modelviewer.dev/shared-assets/models/Skeleton_01.glb";

    viewer.src = newSrc;
    viewer.dismissPoster(); 

    if(btn) {
        const parent = btn.parentElement;
        parent.querySelectorAll('button').forEach(b => b.classList.remove('active', 'bg-white', 'text-black'));
        btn.classList.add('active', 'bg-white', 'text-black');
    }

    viewer.addEventListener('load', () => {
        if(loader) loader.classList.add('d-none');
    }, { once: true });
    
    viewer.addEventListener('error', (e) => {
        if(loader) loader.classList.add('d-none');
        console.log("Model not found:", newSrc);
    }, { once: true });
};

// --- DATA & RENDERING ---
function renderChips() {
    const container = document.getElementById('chipContainer');
    if(!container) return;
    container.innerHTML = ''; 

    const createChip = (text, isActive) => {
        const btn = document.createElement('button');
        btn.className = `filter-chip ${isActive ? 'active' : ''}`;
        btn.textContent = text;
        btn.onclick = () => {
            currentUnitFilter = text;
            renderChips(); 
            prepareFilteredList();
        };
        return btn;
    };

    container.appendChild(createChip('All', currentUnitFilter === 'All'));

    const sourceUnits = currentType === 'paper' ? FQE_UNITS : NOTE_UNITS;
    const sortedUnits = [...new Set(sourceUnits)].sort();

    sortedUnits.forEach(unit => {
        container.appendChild(createChip(unit, currentUnitFilter === unit));
    });
}

async function loadData() {
    try {
        const paps = await getDocs(query(collection(db, "papers")));
        allData = []; 
        paps.forEach(d => allData.push({ id: d.id, ...d.data() }));
        
        renderChips();
        prepareFilteredList();
    } catch (e) { 
        const list = document.getElementById('contentList');
        if(list) list.innerHTML = `<div class="text-center mt-5 text-secondary">Offline / No Data</div>`; 
    }
}

window.prepareFilteredList = function() {
    const searchEl = document.getElementById('searchInput');
    const term = searchEl ? searchEl.value.toLowerCase() : '';
    const container = document.getElementById('contentList');
    if(!container) return;
    
    container.innerHTML = "";
    itemsRendered = 0;

    filteredItems = allData.filter(i => {
        const typeMatch = (i.type || 'paper') === currentType;
        const textMatch = JSON.stringify(i).toLowerCase().includes(term);
        const chipMatch = currentUnitFilter === 'All' || i.unit === currentUnitFilter;
        return typeMatch && textMatch && chipMatch;
    }); 
    
    if(currentType === 'paper') filteredItems.sort((a,b) => b.year - a.year);

    if(filteredItems.length === 0) { renderEmptyState(container); return; }
    
    const loader = document.getElementById('loadingMore');
    if(loader) loader.style.display = 'block';
    renderNextBatch();
};

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center py-5 mt-4 text-center animate__animated animate__fadeIn">
            <div style="width: 80px; height: 80px; background: var(--surface-card); border-radius: 50%; display:flex; align-items:center; justify-content:center; margin-bottom: 20px;">
                <i class="fas fa-filter fa-2x text-secondary"></i>
            </div>
            <h5 class="fw-bold mb-2">No results found</h5>
            <p class="text-secondary small" style="max-width: 250px;">Try selecting "All" or searching for something else.</p>
        </div>`;
    const loader = document.getElementById('loadingMore');
    if(loader) loader.style.display = 'none';
}

function renderNextBatch() {
    const container = document.getElementById('contentList');
    const total = filteredItems.length;
    const end = Math.min(itemsRendered + PAGE_SIZE, total);
    
    if (itemsRendered >= total) {
        document.getElementById('loadingMore').style.display = 'none';
        return;
    }
    for (let i = itemsRendered; i < end; i++) renderCard(filteredItems[i], container, i);
    itemsRendered = end;
    if (itemsRendered >= total) document.getElementById('loadingMore').style.display = 'none';
}

function renderCard(item, container, idx) {
    const safeTopic = escapeHtml(item.type === 'note' ? item.topic : item.unit);
    const safeSub = escapeHtml(item.type === 'note' ? item.author : `${item.session} ${item.year}`);
    const color = getUnitColor(item.unit);
    const verifiedBadge = item.isVerified ? `<i class="fas fa-check-circle verified-badge" title="Verified"></i>` : '';
    
    const isTrending = (item.views || 0) > HOT_THRESHOLD;
    let isNew = false;
    if(item.submittedAt) {
        const diff = Math.abs(new Date() - (item.submittedAt.toDate ? item.submittedAt.toDate() : new Date(item.submittedAt)));
        if(diff < (14 * 86400000)) isNew = true;
    }

    let badgeHtml = '';
    if(isNew) badgeHtml += `<span class="badge-pill badge-new">NEW</span>`;
    if(isTrending) badgeHtml += `<span class="badge-pill badge-hot"><i class="fas fa-fire"></i> HOT</span>`;

    let fileId = null;
    if (item.fileUrl) {
        const parts = item.fileUrl.match(/\/d\/(.+?)\//);
        if (parts) fileId = parts[1];
        else { try { fileId = new URL(item.fileUrl).searchParams.get("id"); } catch(e){} }
    }

    const thumbHtml = fileId 
        ? `<div class="card-thumb-container">
             <img src="https://drive.google.com/thumbnail?id=${fileId}&sz=w600" class="card-thumb-img" loading="lazy" 
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
             <div class="thumb-placeholder" style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:var(--surface);">
                <i class="fas fa-file-pdf fa-2x text-secondary"></i>
             </div>
           </div>`
        : '';

    const div = document.createElement('div');
    div.className = 'app-card animate__animated animate__fadeInUp';
    if(idx < 10) div.style.animationDelay = `${(idx % 10) * 0.05}s`;

    const shareText = `Check out this OT resource: ${safeTopic} - ${safeSub}`;
    const waLink = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + item.fileUrl)}`;

    div.innerHTML = `
        <div onclick="openDetails('${item.id}')">
            ${thumbHtml}
            <div>
                <div class="d-flex justify-content-between mb-2">
                    <span class="meta-tag" style="color:${color}; background:${color}15;">
                        ${item.type === 'note' ? 'NOTE' : 'FQE'}
                    </span>
                    <div>${badgeHtml}</div>
                </div>
                <div class="card-title">${safeTopic}</div>
                <div class="card-sub">${safeSub} ${verifiedBadge}</div>
                <div class="card-stats">
                    <span class="stat-item"><i class="fas fa-eye"></i> ${item.views || 0}</span>
                    <span class="stat-item"><i class="fas fa-download"></i> ${item.downloads || 0}</span>
                </div>
            </div>
        </div>
        <div class="mt-2 d-flex justify-content-end gap-2">
            <button class="btn-whatsapp" onclick="window.open('${waLink}', '_blank')">
                <i class="fab fa-whatsapp"></i>
            </button>
            <button class="btn-secondary-icon" onclick="downloadFile('${item.fileUrl}', '${item.id}')">
                <i class="fas fa-download" style="font-size:0.9rem"></i>
            </button>
            <button class="btn-open" onclick="openDetails('${item.id}')">OPEN</button>
        </div>`;
    container.appendChild(div);
}

// --- GESTURES & NAV ---
function initSwipeGestures() {
    let touchStartX = 0;
    let touchEndX = 0;
    const swipeThreshold = 60; 
    const area = document.getElementById('scrollArea');
    if(!area) return;

    area.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    area.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        if (diff > swipeThreshold && currentType === 'note') window.switchTab('paper');
        if (diff < -swipeThreshold && currentType === 'paper') window.switchTab('note');
    }, {passive: true});
}

function initPullToRefresh() {
    const area = document.getElementById('scrollArea');
    const visual = document.getElementById('ptrVisual');
    if(!visual) return; 

    const icon = visual.querySelector('.ptr-icon');
    const spinner = visual.querySelector('.ptr-spinner');
    let startY = 0, isPulling = false;

    area.addEventListener('touchstart', (e) => {
        if (area.scrollTop === 0) { startY = e.touches[0].clientY; isPulling = true; visual.style.transition = 'none'; }
    }, {passive: true});

    area.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0 && area.scrollTop === 0) {
            const height = Math.min(diff * 0.5, 100); 
            visual.style.height = `${height}px`;
            if (height > 40) visual.classList.add('ptr-pulling'); else visual.classList.remove('ptr-pulling');
            if (e.cancelable) e.preventDefault(); 
        }
    }, {passive: false});

    area.addEventListener('touchend', async () => {
        if (!isPulling) return;
        isPulling = false;
        visual.style.transition = 'height 0.3s ease';

        if (parseInt(visual.style.height) > 40) {
            visual.classList.add('active'); visual.style.height = '60px';
            if(icon) icon.classList.add('d-none');
            if(spinner) spinner.classList.remove('d-none');
            if (navigator.vibrate) navigator.vibrate(50);

            await loadData(); 
            
            setTimeout(() => {
                visual.classList.remove('active'); visual.style.height = '0px';
                setTimeout(() => {
                    if(icon) icon.classList.remove('d-none');
                    if(spinner) spinner.classList.add('d-none');
                    visual.classList.remove('ptr-pulling');
                }, 300);
            }, 800); 
        } else { visual.style.height = '0px'; }
    });
}

function initTheme() {
    const saved = localStorage.getItem('ot_theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && systemDark)) {
        document.body.classList.add('force-dark'); updateThemeIcon(true);
    } else {
        document.body.classList.add('force-light'); updateThemeIcon(false);
    }
}
window.toggleTheme = () => {
    const isDark = document.body.classList.contains('force-dark');
    document.body.classList.remove('force-dark', 'force-light');
    if (isDark) {
        document.body.classList.add('force-light'); localStorage.setItem('ot_theme', 'light'); updateThemeIcon(false);
    } else {
        document.body.classList.add('force-dark'); localStorage.setItem('ot_theme', 'dark'); updateThemeIcon(true);
    }
};
function updateThemeIcon(isDark) {
    const btn = document.getElementById('btnThemeToggle');
    if(btn) btn.innerHTML = isDark ? '<i class="fas fa-sun fa-lg"></i>' : '<i class="fas fa-moon fa-lg"></i>';
}

function setupInfiniteScroll() {
    const options = { root: null, rootMargin: '0px', threshold: 0.1 };
    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) renderNextBatch();
    }, options);
    const loader = document.getElementById('loadingMore');
    if(loader) scrollObserver.observe(loader);
}

window.switchTab = (type) => {
    if(currentType === type) return; 
    currentType = type;
    currentUnitFilter = 'All'; 
    document.querySelectorAll('.footer-link').forEach(l => l.classList.remove('active'));
    const activeId = type === 'paper' ? 'nav-paper' : 'nav-note';
    const activeEl = document.getElementById(activeId);
    if(activeEl) activeEl.classList.add('active');

    renderChips();
    const list = document.getElementById('contentList');
    list.classList.remove('animate__fadeInUp');
    void list.offsetWidth; 
    list.classList.add('animate__fadeIn');
    prepareFilteredList();
    const area = document.getElementById('scrollArea');
    if(area) area.scrollTop = 0;
};

// --- ACTIONS ---
window.openDetails = (id) => {
    const item = allData.find(i => i.id === id);
    if(!item) return;
    document.getElementById('detailTitle').textContent = item.type === 'note' ? item.topic : `${item.year} FQE Paper`;
    document.getElementById('detailUnit').textContent = item.unit;
    document.getElementById('detailUnit').style.color = getUnitColor(item.unit);
    document.getElementById('detailSub').innerHTML = item.type === 'note' ? `By ${item.author} ${item.isVerified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}` : `${item.session} Session`;
    document.getElementById('detailViews').textContent = item.views || 0;
    document.getElementById('detailDownloads').textContent = item.downloads || 0;
    document.getElementById('btnRead').onclick = () => { viewFile(item.fileUrl, item.id, item.type === 'note' ? item.topic : item.unit); };
    document.getElementById('btnDownload').onclick = () => { downloadFile(item.fileUrl, item.id); };
    
    const related = allData.filter(i => i.unit === item.unit && i.id !== item.id).slice(0, 3);
    const list = document.getElementById('relatedList');
    list.innerHTML = "";
    if(related.length === 0) list.innerHTML = `<p class="text-secondary small">No related content found.</p>`;
    else {
        related.forEach(r => {
            const rDiv = document.createElement('div');
            rDiv.className = 'related-card mt-2 p-2 border rounded d-flex justify-content-between align-items-center';
            rDiv.onclick = () => window.openDetails(r.id);
            rDiv.style.background = 'var(--surface)';
            rDiv.innerHTML = `<div><div class="fw-bold" style="font-size:0.8rem; color:var(--text-primary)">${r.type==='note'?r.topic:r.year+' Paper'}</div></div><i class="fas fa-chevron-right text-secondary small"></i>`;
            list.appendChild(rDiv);
        });
    }
    detailsModalInstance.show();
};

window.viewFile = (url, id, title) => {
    if(id) updateDoc(doc(db,"papers",id), {views: increment(1)}).catch(e=>{});
    detailsModalInstance.hide();
    const viewer = document.getElementById('nativeViewer');
    document.getElementById('viewerTitle').textContent = title || "Document";
    document.getElementById('viewerDownloadBtn').onclick = () => downloadFile(url, id);
    if(url.includes('drive.google.com')) {
        const cleanUrl = url.replace('/view', '/preview').replace('/edit', '/preview');
        document.getElementById('docFrame').src = cleanUrl;
    } else { document.getElementById('docFrame').src = url; }
    viewer.classList.add('active');
};

window.closeViewer = () => {
    document.getElementById('nativeViewer').classList.remove('active');
    setTimeout(() => { document.getElementById('docFrame').src = ''; }, 300);
};

window.downloadFile = (url, id) => {
    if(window.confetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#ef4444', '#3b82f6', '#10b981'] });
    if(id) {
        updateDoc(doc(db, "papers", id), { downloads: increment(1) }).catch(console.error);
        const span = document.getElementById('detailDownloads');
        if(span) span.innerText = parseInt(span.innerText) + 1;
    }
    let fileId = '';
    const parts = url.match(/\/d\/(.+?)\//);
    if (parts) fileId = parts[1];
    else { try { const u = new URL(url); fileId = u.searchParams.get("id"); } catch(e){} }

    if(fileId) {
        const overlay = document.getElementById('downloadOverlay');
        const bar = document.getElementById('dlBar');
        const txt = document.getElementById('dlPercent');
        bar.style.width = '0%'; txt.innerText = '0%';
        overlay.classList.remove('d-none');

        let width = 0;
        const interval = setInterval(() => {
            width += Math.random() * 20; 
            if(width >= 100) {
                width = 100; clearInterval(interval);
                txt.innerText = "Complete"; bar.classList.remove('bg-success'); bar.classList.add('bg-white'); 
                setTimeout(() => {
                    overlay.classList.add('d-none');
                    setTimeout(() => { bar.classList.add('bg-success'); bar.classList.remove('bg-white'); }, 300);
                }, 1000);
            }
            bar.style.width = width + '%';
            if(width < 100) txt.innerText = Math.floor(width) + '%';
        }, 150);

        const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        document.getElementById('downloadFrame').src = dlUrl;
    } else { window.open(url, '_blank'); }
};

window.showToast = (msg) => { 
    const t = document.getElementById('toast-container'); 
    t.innerHTML = `<div class="bg-white text-black px-4 py-2 rounded-pill fw-bold shadow animate__animated animate__fadeInDown">${msg}</div>`; 
    setTimeout(() => t.innerHTML = '', 3000); 
};

function initUploadForm() {
    const subType = document.getElementById('subType');
    const subUnit = document.getElementById('subUnit');
    const subSession = document.getElementById('subSession');
    
    const populateUnits = (type) => {
        subUnit.innerHTML = '<option value="" disabled selected>Select Unit...</option>';
        const list = type === 'paper' ? FQE_UNITS : NOTE_UNITS;
        [...new Set(list)].sort().forEach(u => {
            const opt = document.createElement('option'); opt.value = u; opt.textContent = u; subUnit.appendChild(opt);
        });
    };
    const updateSession = (type) => {
        if(type === 'paper') subSession.innerHTML = '<option value="January">Jan</option><option value="June">June</option>';
    };

    if(subType) {
        populateUnits('paper'); updateSession('paper');
        subType.onchange = (e) => { 
            const t = e.target.value; const isNote = t === 'note'; 
            document.getElementById('subNoteFields').classList.toggle('d-none', !isNote); 
            document.getElementById('subPaperFields').classList.toggle('d-none', isNote); 
            populateUnits(t); if(!isNote) updateSession('paper');
        };
    }
    const uploadForm = document.getElementById('studentUploadForm');
    if(uploadForm) {
        uploadForm.onsubmit = async (e) => {
            e.preventDefault();
            try {
                const t = document.getElementById('subType').value;
                const d = { 
                    type: t, unit: document.getElementById('subUnit').value, fileUrl: document.getElementById('subLink').value, 
                    submittedAt: serverTimestamp(), status: 'pending', isVerified: false 
                };
                if(t === 'note') { d.topic = document.getElementById('subTopic').value; d.author = document.getElementById('subAuthor').value; } 
                else { d.year = parseInt(document.getElementById('subYear').value); d.session = document.getElementById('subSession').value; }
                await addDoc(collection(db, "pending_uploads"), d);
                bootstrap.Modal.getInstance(document.getElementById('submitModal')).hide();
                e.target.reset(); showToast("Submitted for review!");
            } catch(err) { showToast("Error submitting."); }
        };
    }
}

const milestoneData = {
    '0-3m': [ { cat: 'Reflexes', text: 'Rooting, Sucking, Moro, Grasp (Palmar/Plantar), ATNR present.' }, { cat: 'Motor', text: 'Lifts head briefly in prone. Tracking objects.' } ],
    '4-6m': [ { cat: 'Reflexes', text: 'ATNR, Moro, Rooting integrate/disappear.' }, { cat: 'Motor', text: 'Rolls prone to supine (4mo). Sits with support.' } ],
    '7-9m': [ { cat: 'Motor', text: 'Sits independently. Commando crawling.' }, { cat: 'Cognitive', text: 'Object permanence develops.' } ],
    '10-12m': [ { cat: 'Motor', text: 'Cruising. First steps. Fine pincer grasp.' }, { cat: 'Social', text: 'Waves bye-bye.' } ]
};
window.filterMilestones = (ageGroup, btnElement) => {
    const container = btnElement.parentElement;
    container.querySelectorAll('button').forEach(b => { b.classList.remove('active', 'bg-white', 'text-black'); });
    btnElement.classList.add('active', 'bg-white', 'text-black');
    const display = document.getElementById('milestoneContent');
    if(!display) return;
    display.innerHTML = milestoneData[ageGroup].map(item => `
        <div class="milestone-item animate__animated animate__fadeIn">
            <div class="milestone-cat">${item.cat}</div><div style="color:var(--text-primary)">${item.text}</div>
        </div>`).join('');
};
document.addEventListener('DOMContentLoaded', () => { const firstBtn = document.querySelector('#milestoneModal button'); if(firstBtn) window.filterMilestones('0-3m', firstBtn); });

// --- SERVICE WORKER REGISTRATION (Robust Path) ---
if ("serviceWorker" in navigator) { 
    window.addEventListener("load", () => { 
        // Using "./sw.js" helps with subdirectories/GitHub Pages
        navigator.serviceWorker.register("./sw.js")
            .then(reg => console.log("Service Worker Registered"))
            .catch(err => console.log("Service Worker Failed", err)); 
    }); 
}