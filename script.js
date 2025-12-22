// === 0. 音效系统 ===
const AUDIO = {
    snap: new Audio("https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3"),
    win: new Audio("https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3")
};
AUDIO.snap.volume = 0.5;
AUDIO.win.volume = 0.6;

// === 1. 基础配置 ===
const DIFFICULTIES = {
    'easy':     { min: 6,  max: 12 },
    'medium':   { min: 12, max: 20 },
    'advanced': { min: 20, max: 28 }
};

const CONFIG = {
    snapDistance: 30,
    boardMargin: 120,
    batchSize: 30
};

// === 2. 状态管理 ===
let state = {
    pieces: [], groups: [],
    rows: 0, cols: 0,
    currentDifficulty: 'medium',
    imgSrc: '', 
    pieceW: 0, pieceH: 0,
    pageIndex: 0,
    isLoading: false
};

// === 3. 图库系统 ===
const gallery = document.getElementById('gallery');
const sentinel = document.getElementById('sentinel');

const POOLS = {
    favorites: [
        'chinese girl portrait', 'beautiful asian woman', 'korean fashion model', 'japanese beauty',
        'blonde woman portrait', 'western beauty', 'european model', 'american girl',
        'cyberpunk city', 'futuristic technology', 'robot ai', 'spaceship',
        'cinematic shot', 'movie scene', 'film aesthetics', 'dramatic lighting',
        'majestic mountains', 'tropical beach', 'deep forest', 'sunset ocean',
        'street photography', 'urban life', 'neon lights', 'travel portrait'
    ],
    discovery: [
        'supercar', 'luxury car', 'cute cat', 'puppy dog', 'delicious food', 'sushi',
        'modern architecture', 'abstract art', 'oil painting', 'extreme sports', 'surfing',
        'wildlife', 'underwater world', 'gaming setup', 'retro game'
    ]
};

function initGallery() {
    state.pageIndex = 0;
    gallery.innerHTML = '';
    loadMoreImages();
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !state.isLoading) {
            loadMoreImages();
        }
    }, { rootMargin: '600px' }); // 预加载距离加大，应对高清图加载慢
    observer.observe(sentinel);
}

function loadMoreImages() {
    if (state.isLoading) return;
    state.isLoading = true;

    const count = CONFIG.batchSize;
    
    for(let i=0; i<count; i++) {
        const div = document.createElement('div');
        div.className = 'card';
        
        // === 核心修改：画质极大提升 ===
        // 基础宽度从 400 提升到 1200，满足 Retina 屏幕需求
        const width = 1200;
        // 高度也要相应比例增加，保持瀑布流错落感
        const height = 800 + Math.floor(Math.random() * 600); 
        
        const seed = Date.now() + i + (state.pageIndex * 100);
        
        const rand = Math.random(); 
        let keyword = '';
        if (rand < 0.6) {
            const pool = POOLS.favorites;
            keyword = pool[Math.floor(Math.random() * pool.length)];
        } else {
            const pool = POOLS.discovery;
            keyword = pool[Math.floor(Math.random() * pool.length)];
        }
        
        const src = `https://loremflickr.com/${width}/${height}/${encodeURIComponent(keyword)}?lock=${seed}`;
        
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        img.loading = "lazy";
        
        img.onload = () => img.classList.add('loaded');
        // 兜底图也用高清的
        img.onerror = () => { img.src = `https://picsum.photos/${width}/${height}?random=${seed}`; };
        
        img.src = src;
        
        // 点击时高清截图
        div.onclick = () => {
            try {
                const canvas = document.createElement('canvas');
                // 使用图片的原始高清尺寸
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // 使用高质量 JPEG 导出
                const base64Data = canvas.toDataURL('image/jpeg', 0.98);
                openModal(base64Data);
            } catch (e) {
                console.warn("截图失败，回退到 URL 模式", e);
                openModal(img.src);
            }
        };
        
        div.appendChild(img);
        gallery.appendChild(div);
    }

    state.pageIndex++;
    // 稍微增加一点防抖时间，给网络喘息机会
    setTimeout(() => { state.isLoading = false; }, 800);
}

initGallery();

// === 4. 界面交互逻辑 (不变) ===
const modal = document.getElementById('modal');
const gameArea = document.getElementById('game-area');
const galleryView = document.getElementById('gallery-view');

function openModal(src) { state.imgSrc = src; modal.style.display = 'flex'; }
function closeModal() { modal.style.display = 'none'; }
function goHome() { gameArea.style.display = 'none'; galleryView.style.display = 'block'; }
function startGame(diffLevel) {
    state.currentDifficulty = DIFFICULTIES[diffLevel] ? diffLevel : 'medium';
    closeModal();
    galleryView.style.display = 'none';
    gameArea.style.display = 'block';
    setTimeout(initPuzzle, 100);
}

// === 5. 拼图核心引擎 (不变) ===
function calculateGrid(imgW, imgH, difficultyKey) {
    const range = DIFFICULTIES[difficultyKey];
    const targetPieces = (range.min + range.max) / 2;
    const imgRatio = imgW / imgH;
    let idealRows = Math.sqrt(targetPieces / imgRatio);
    let rows = Math.round(idealRows) || 1;
    let cols = Math.round(rows * imgRatio) || 1;
    let total = rows * cols;
    while(total < range.min) { if(rows < cols) rows++; else cols++; total = rows * cols; }
    while(total > range.max) { if(rows > cols) rows--; else cols--; total = rows * cols; }
    return { rows, cols };
}

function initPuzzle() {
    const board = document.getElementById('play-board');
    board.innerHTML = '';
    board.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    state.pieces = []; state.groups = [];
    document.getElementById('win-msg').style.display = 'none';
    document.getElementById('progress-text').innerText = "0%";

    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    
    img.onload = () => {
        const grid = calculateGrid(img.width, img.height, state.currentDifficulty);
        state.rows = grid.rows; state.cols = grid.cols;

        const vw = window.innerWidth; const vh = window.innerHeight;
        let displayW, displayH;
        if (img.width / img.height > vw / vh) {
            displayW = vw * 0.85; displayH = displayW * (img.height / img.width);
        } else {
            displayH = vh * 0.85; displayW = displayH * (img.width / img.height);
        }

        const boardW = displayW + CONFIG.boardMargin * 2;
        const boardH = displayH + CONFIG.boardMargin * 2;
        board.style.width = Math.ceil(boardW) + 'px';
        board.style.height = Math.ceil(boardH) + 'px';

        const pieceW = displayW / state.cols;
        const pieceH = displayH / state.rows;
        state.pieceW = pieceW; state.pieceH = pieceH;

        for(let r=0; r<state.rows; r++) {
            for(let c=0; c<state.cols; c++) {
                const el = document.createElement('div');
                el.className = 'piece';
                el.style.width = Math.ceil(pieceW) + 'px';
                el.style.height = Math.ceil(pieceH) + 'px';
                el.style.backgroundImage = `url(${state.imgSrc})`;
                el.style.backgroundSize = `${displayW}px ${displayH}px`;
                el.style.backgroundPosition = `-${c * pieceW}px -${r * pieceH}px`;
                
                const safeMargin = 10; 
                const randX = Math.random() * (boardW - pieceW - safeMargin*2) + safeMargin;
                const randY = Math.random() * (boardH - pieceH - safeMargin*2) + safeMargin;
                
                el.style.left = randX + 'px'; el.style.top = randY + 'px';
                board.appendChild(el);

                const pieceObj = { el, id: r*state.cols+c, r, c, x: randX, y: randY, w: pieceW, h: pieceH, group: null };
                const group = [pieceObj]; pieceObj.group = group;
                state.pieces.push(pieceObj); state.groups.push(group);
                setupDraggable(pieceObj);
            }
        }
    };
    
    img.onerror = () => {
        alert("图片加载异常，请重试");
        goHome();
    };
    
    img.src = state.imgSrc; 
}

function scatterPieces() { initPuzzle(); }

// === 6. 拖拽与物理吸附系统 (不变) ===
function setupDraggable(pieceObj) {
    const el = pieceObj.el;
    const startDrag = (e) => {
        e.preventDefault(); 
        pieceObj.group.forEach(p => { p.el.style.zIndex = 1000; p.el.classList.add('dragging'); });
        const pageX = e.touches ? e.touches[0].pageX : e.pageX;
        const pageY = e.touches ? e.touches[0].pageY : e.pageY;
        const startPositions = pieceObj.group.map(p => ({ x: p.x, y: p.y }));
        
        const onMove = (mvEvent) => {
            const curPageX = mvEvent.touches ? mvEvent.touches[0].pageX : mvEvent.pageX;
            const curPageY = mvEvent.touches ? mvEvent.touches[0].pageY : mvEvent.pageY;
            const dx = curPageX - pageX; const dy = curPageY - pageY;
            pieceObj.group.forEach((p, i) => {
                p.x = startPositions[i].x + dx; p.y = startPositions[i].y + dy;
                p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
            });
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd);
            pieceObj.group.forEach(p => { p.el.style.zIndex = 10; p.el.classList.remove('dragging'); });
            checkSnapping(pieceObj.group);
        };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onEnd);
    };
    el.addEventListener('mousedown', startDrag); el.addEventListener('touchstart', startDrag, { passive: false });
}

function checkSnapping(activeGroup) {
    let merged = false;
    outerLoop: for (const activeP of activeGroup) {
        for (const targetP of activeGroup) {
            for (const targetP of state.pieces) {
            if (activeP.group === targetP.group) continue;
            const dc = activeP.c - targetP.c; const dr = activeP.r - targetP.r; 
            if (Math.abs(dc) + Math.abs(dr) !== 1) continue;
            const idealDx = dc * state.pieceW; const idealDy = dr * state.pieceH;
            const actualDx = activeP.x - targetP.x; const actualDy = activeP.y - targetP.y;
            const dist = Math.sqrt(Math.pow(actualDx - idealDx, 2) + Math.pow(actualDy - idealDy, 2));
            if (dist < CONFIG.snapDistance) {
                mergeGroups(activeP, targetP, idealDx, idealDy); merged = true; break outerLoop;
            }
        }
    }
}
} // <--- 这里少了一个大括号，导致代码报错，我加上了

// === 7. 合并逻辑 (不变) ===
function mergeGroups(activePiece, targetPiece, diffX, diffY) {
    const snapSound = AUDIO.snap.cloneNode();
    snapSound.volume = 0.5;
    snapSound.play().catch(e => {}); 

    const destX = targetPiece.x + diffX; const destY = targetPiece.y + diffY;
    const correctionX = destX - activePiece.x; const correctionY = destY - activePiece.y;
    const activeGroup = activePiece.group; const targetGroup = targetPiece.group;
    activeGroup.forEach(p => {
        p.x += correctionX; p.y += correctionY;
        p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
        p.el.style.transition = 'none'; p.el.style.boxShadow = '0 0 25px #fff, 0 0 10px var(--accent)';
        setTimeout(() => { p.el.style.boxShadow = ''; p.el.style.transition = ''; }, 400);
    });
    const newGroup = targetGroup.concat(activeGroup); newGroup.forEach(p => p.group = newGroup);
    const maxGroupSize = Math.max(...state.pieces.map(p => p.group.length));
    document.getElementById('progress-text').innerText = `${Math.floor((maxGroupSize/state.pieces.length)*100)}%`;
    
    if (maxGroupSize === state.pieces.length) {
        document.getElementById('win-msg').style.display = 'block';
        document.getElementById('play-board').style.borderColor = '#4cd137';
        AUDIO.win.play().catch(e => {});
    }
}