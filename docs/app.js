const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ONE_GB = 1024 * 1024 * 1024; // bytes
// Opcional: defina o repo padrão e esconda o formulário
const DEFAULT_OWNER = 'BRUN0R2';
const DEFAULT_REPO = 'fast-dl';
const DEFAULT_BRANCH = 'main';

async function fetchJSON(url, init){
    const res = await fetch(url, init);
    if(!res.ok){
        const text = await res.text().catch(()=>"");
        throw new Error(`Erro ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
}

function formatBytes(bytes){
    if(bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const val = bytes / Math.pow(k, i);
    return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${sizes[i]}`;
}

function icon(kind){
    if(kind === 'dir') return '';
    return '';
}

function getExt(name){
    const idx = name.lastIndexOf('.');
    return idx > -1 ? name.slice(idx) : '';
}

function buildRow(item, depth){
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = `row ${item.type === 'dir' ? 'dir' : 'file'}`;
    if(depth > 0) row.style.paddingLeft = `${10 + depth * 16}px`;

    const name = document.createElement('div');
    name.className = 'name';
    const selectWrap = document.createElement('div');
    selectWrap.className = 'select';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedPaths.has(item.name);
    checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
        if(checkbox.checked) selectedPaths.add(item.name); else selectedPaths.delete(item.name);
        updateSelectionToolbar();
    });
    selectWrap.appendChild(checkbox);
    if(item.type === 'dir'){
        const caret = document.createElement('span');
        caret.className = 'caret' + (item.open ? ' open' : '');
        name.appendChild(caret);
    }
    const ic = document.createElement('span');
    ic.className = 'icon';
    ic.textContent = icon(item.type);
    name.appendChild(ic);

    const displayName = item.name.replace(/^cstrike\//, '');
    if(item.type === 'dir'){
        const span = document.createElement('span');
        span.className = 'file-link';
        span.textContent = displayName;
        name.appendChild(span);
    }else{
        const a = document.createElement('a');
        a.className = 'file-link';
        a.textContent = displayName;
        a.href = item.html_url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        name.appendChild(a);
    }

    const meta = document.createElement('div');
    meta.className = 'meta';
    if(item.type !== 'dir'){
        const sizeChip = document.createElement('span');
        sizeChip.className = 'chip';
        sizeChip.textContent = formatBytes(item.size || 0);
        meta.appendChild(sizeChip);

        const ext = getExt(item.name).toLowerCase();
        if(ext){
            const ex = document.createElement('span');
            const extClean = ext.replace(/^\./, '');
            ex.className = `chip chip-ext ext-${extClean}`;
            ex.textContent = ext;
            meta.appendChild(ex);
        }
    }

    // três pontinhos (menu)
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'dots';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.type = 'button';
    menuBtn.textContent = '⋮';
    dotsWrap.appendChild(menuBtn);
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    const btnRename = document.createElement('button'); btnRename.textContent = 'Renomear';
    const btnDelete = document.createElement('button'); btnDelete.textContent = 'Excluir';
    menu.appendChild(btnRename); menu.appendChild(btnDelete);
    dotsWrap.appendChild(menu);

    let menuOpen = false;
    function closeMenu(){ menu.classList.remove('open'); menuOpen = false; }
    function openMenu(){
        // posiciona próximo ao botão
        const r = menuBtn.getBoundingClientRect();
        menu.style.left = (r.left + window.scrollX) + 'px';
        menu.style.top = (r.bottom + window.scrollY + 6) + 'px';
        menu.classList.add('open');
        menuOpen = true;
    }
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if(menuOpen) closeMenu(); else openMenu();
    });
    document.addEventListener('click', (e) => { if(menuOpen && !menu.contains(e.target) && e.target !== menuBtn) closeMenu(); });

    btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation(); closeMenu();
        // Seleciona somente este item e chama exclusão múltipla
        selectedPaths.clear();
        selectedPaths.add(item.name);
        updateSelectionToolbar();
        const btn = document.getElementById('btn-delete-selected');
        if(btn) btn.click();
    });
    btnRename.addEventListener('click', async (e) => {
        e.stopPropagation(); closeMenu();
        const nameOnly = item.name.replace(/^cstrike\//, '');
        const to = prompt('Novo caminho (relativo a cstrike/):', nameOnly);
        if(!to || to === nameOnly) return;
        try{
            const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
            const owner = hash.get('owner') || DEFAULT_OWNER;
            const repo = hash.get('repo') || DEFAULT_REPO;
            const branch = hash.get('branch') || DEFAULT_BRANCH || 'main';
            const fromRel = item.name;
            const toRel = to.startsWith('cstrike/') ? to : `cstrike/${to}`;
            const sha = await getShaForPath(owner, repo, branch, fromRel);
            if(!sha) throw new Error('Origem não encontrada.');
            const blob = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`);
            await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(toRel)}`, {
                method:'PUT', headers:{
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                }, body: JSON.stringify({ message:`chore: rename ${fromRel} -> ${toRel}`, content: blob.content, branch })
            });
            await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fromRel)}`, {
                method:'DELETE', headers:{
                    'Authorization': `Bearer ${authToken}`,
                    'Accept': 'application/vnd.github+json',
                    'Content-Type': 'application/json'
                }, body: JSON.stringify({ message:`chore: delete ${fromRel}`, sha, branch })
            });
            loadRepo(owner, repo, branch);
        }catch(err){ alert(err.message || err); }
    });

    row.appendChild(name);
    row.appendChild(meta);
    row.appendChild(dotsWrap);
    row.appendChild(selectWrap);
    // dataset para seleção em massa
    li.dataset.path = item.name;
    li.dataset.type = item.type;
    li.appendChild(row);
    return li;
}

async function walkTree(owner, repo, path = '', branch){
    const params = branch ? `?ref=${encodeURIComponent(branch)}` : '';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}${params}`;
    const data = await fetchJSON(url);
    // data: array of {name, type: 'file'|'dir', size, html_url, path}
    return data;
}

async function listAllFiles(owner, repo, branch){
    // Use Git Trees API to avoid many requests
    // GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1
    // First resolve default branch sha
    const repoInfo = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
    const defaultBranch = branch || repoInfo.default_branch || 'main';
    const branchInfo = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}`);
    const treeSha = branchInfo.commit && branchInfo.commit.commit && branchInfo.commit.commit.tree && branchInfo.commit.commit.tree.sha;
    const tree = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
    // Restrição: apenas conteúdo abaixo de cstrike/
    const allNodes = (tree.tree || []);
    const files = allNodes.filter(n => n.type === 'blob' && n.path.startsWith('cstrike/'));
    const folders = allNodes.filter(n => n.type === 'tree' && (n.path === 'cstrike' || n.path.startsWith('cstrike/')));
    return { files, folders, defaultBranch, repoInfo };
}

// estado de expansão e seleção
const openDirs = new Set();
const selectedPaths = new Set();

// cache de dados para busca rápida
const repoCache = { files: [], folders: [], owner: '', repo: '', branch: '' };
let searchTimer = null;
function scheduleFilterRebuild(){
    if(searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        if(repoCache.owner && repoCache.repo){
            buildTreeList(repoCache.files, repoCache.folders, repoCache.owner, repoCache.repo, repoCache.branch);
        }
    }, 80);
}

function buildTreeList(files, folders, owner, repo, branch){
    const ul = $('#tree');
    ul.innerHTML = '';
    const q = $('#search').value.trim().toLowerCase();
    const extFilter = $('#ext-filter').value;

    const makeHtmlUrl = (path) => `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${path}`;

    // mapa de filhos por pasta
    const children = new Map();
    const pushChild = (parent, node) => {
        if(!children.has(parent)) children.set(parent, []);
        children.get(parent).push(node);
    };

    for(const d of folders){
        // Evita criar um filho apontando para a própria raiz (cstrike -> cstrike)
        if(d.path === 'cstrike') continue;
        const parent = d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '';
        pushChild(parent || 'cstrike', { type:'dir', name:d.path, path:d.path });
    }
    for(const f of files){
        const parent = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : 'cstrike';
        pushChild(parent, { type:'file', name:f.path, path:f.path, size:f.size || 0, html_url: makeHtmlUrl(f.path) });
    }

    function hasMatchDeep(folderPath, query, visited = new Set()){
        if(visited.has(folderPath)) return false;
        visited.add(folderPath);
        const list = children.get(folderPath) || [];
        for(const child of list){
            const nameOnly = child.name.replace(/^cstrike\//, '');
            const lname = nameOnly.toLowerCase();
            if(child.type === 'dir'){
                if(lname.startsWith(query) || hasMatchDeep(child.name, query, visited)) return true;
            }else{
                if(lname.startsWith(query)) return true;
            }
        }
        return false;
    }

    function renderFolder(folderPath, depth, visited = new Set()){
        if(visited.has(folderPath)) return; // proteção contra ciclos improváveis
        visited.add(folderPath);
        const list = children.get(folderPath) || [];
        list.sort((a,b)=>{
            if(a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        if(folderPath !== 'cstrike'){
            const item = { type: 'dir', name: folderPath, open: openDirs.has(folderPath) };
            const li = buildRow(item, depth);
            const caret = li.querySelector('.caret');
            const row = li.querySelector('.row');
            const toggle = () => {
                if(openDirs.has(folderPath)) openDirs.delete(folderPath); else openDirs.add(folderPath);
                buildTreeList(files, folders, owner, repo, branch);
            };
            if(caret) caret.addEventListener('click', toggle);
            if(row) row.addEventListener('click', toggle);
            ul.appendChild(li);
        }

        if(folderPath === 'cstrike' || openDirs.has(folderPath)){
            for(const child of list){
                if(child.type === 'dir'){
                    const nameOnly = child.name.replace(/^cstrike\//, '');
                    const lname = nameOnly.toLowerCase();
                    const show = !q || lname.startsWith(q) || hasMatchDeep(child.name, q);
                    if(show) renderFolder(child.name, depth + (folderPath === 'cstrike' ? 0 : 1), visited);
                }else{
                    const nameOnly = child.name.replace(/^cstrike\//, '');
                    const lname = nameOnly.toLowerCase();
                    if(q && !lname.startsWith(q)) continue;
                    if(extFilter && !lname.endsWith(extFilter.toLowerCase())) continue;
                    const li = buildRow(child, depth + (folderPath === 'cstrike' ? 0 : 1));
                    ul.appendChild(li);
                }
            }
        }
    }

    // raiz
    if(!openDirs.has('cstrike')) openDirs.add('cstrike');
    const rootItem = { type:'dir', name:'cstrike', open: openDirs.has('cstrike') };
    const rootLi = buildRow(rootItem, 0);
    const rootCaret = rootLi.querySelector('.caret');
    const rootRow = rootLi.querySelector('.row');
    const toggleRoot = () => {
        if(openDirs.has('cstrike')) openDirs.delete('cstrike'); else openDirs.add('cstrike');
        buildTreeList(files, folders, owner, repo, branch);
    };
    if(rootCaret) rootCaret.addEventListener('click', toggleRoot);
    if(rootRow) rootRow.addEventListener('click', toggleRoot);
    ul.appendChild(rootLi);
    renderFolder('cstrike', 0);
    updateSelectionToolbar();
}

function updateSelectionToolbar(){
    const bar = document.getElementById('selection-toolbar');
    if(!bar) return;
    const countEl = document.getElementById('selected-count');
    const count = selectedPaths.size;
    if(countEl) countEl.textContent = String(count);
    bar.style.display = count > 0 ? 'flex' : 'none';
}

function updateMeter(approxBytes){
    const pct = Math.min(100, (approxBytes / ONE_GB) * 100);
    $('#size-bar').style.width = pct.toFixed(2) + '%';
    $('#size-label').textContent = `${formatBytes(approxBytes)} / 1 GB`;
    const remaining = Math.max(0, ONE_GB - approxBytes);
    $('#size-remaining').textContent = formatBytes(remaining);
}

// Autenticação (opcional) para operações de escrita
let authToken = '';
function setAuthToken(token){
    authToken = token || '';
    if(authToken){
        localStorage.setItem('gh_token', authToken);
        $('#auth-status').textContent = 'Conectado';
    }else{
        localStorage.removeItem('gh_token');
        $('#auth-status').textContent = 'Desconectado';
    }
}

async function loadRepo(owner, repo, branch){
    $('#error').hidden = true;
    $('#loading').textContent = 'Carregando arquivos...';
    $('#repo-summary').hidden = true;
    $('#controls').hidden = true;
    $('#file-list-section').hidden = false;

    try{
        const { files, folders, defaultBranch, repoInfo } = await listAllFiles(owner, repo, branch);

        // approximate size: sum of blob sizes returned by tree (size may be missing for big trees; fallback later)
        let sizeSum = 0;
        for(const f of files){
            if(typeof f.size === 'number') sizeSum += f.size;
        }

        // If size seems zero (likely because Git Trees API omits large blob sizes), fallback to repo size metadata (in KB)
        let approxBytes = sizeSum > 0 ? sizeSum : (repoInfo.size || 0) * 1024;

        // update header
        $('#repo-title').textContent = `${owner}/${repo}`;
        $('#repo-desc').textContent = repoInfo.description || '';
        $('#repo-link').href = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch || defaultBranch)}/cstrike`;
        $('#branch-name').textContent = branch || defaultBranch;
        $('#files-count').textContent = files.length.toString();
        $('#folders-count').textContent = folders.length.toString();
        updateMeter(approxBytes);

        $('#repo-summary').hidden = false;
        $('#controls').hidden = false;
        $('#admin-panel').hidden = false;

        // cache
        repoCache.files = files;
        repoCache.folders = folders;
        repoCache.owner = owner;
        repoCache.repo = repo;
        repoCache.branch = branch || defaultBranch;

        buildTreeList(files, folders, owner, repo, repoCache.branch);
        $('#loading').textContent = '';
    }catch(err){
        $('#error').hidden = false;
        $('#error').textContent = String(err.message || err);
        $('#loading').textContent = '';
    }
}

function restoreFromHash(){
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const owner = hash.get('owner');
    const repo = hash.get('repo');
    const branch = hash.get('branch') || '';
    if(owner && repo){
        $('#owner').value = owner;
        $('#repo').value = repo;
        $('#branch').value = branch;
        loadRepo(owner, repo, branch);
    }
}

function saveToHash(owner, repo, branch){
    const p = new URLSearchParams();
    p.set('owner', owner);
    p.set('repo', repo);
    if(branch) p.set('branch', branch);
    location.hash = '#' + p.toString();
}

document.addEventListener('DOMContentLoaded', () => {
    restoreFromHash();

    // restore token
    const saved = localStorage.getItem('gh_token');
    if(saved){
        $('#token').value = saved;
        setAuthToken(saved);
    }

    // Se quiser fixar o repositório e ocultar o formulário
    if(DEFAULT_OWNER && DEFAULT_REPO){
        $('#owner').value = DEFAULT_OWNER;
        $('#repo').value = DEFAULT_REPO;
        if(DEFAULT_BRANCH) $('#branch').value = DEFAULT_BRANCH;
        $('#repo-form').style.display = 'none';
        loadRepo(DEFAULT_OWNER, DEFAULT_REPO, DEFAULT_BRANCH);
    }

    $('#repo-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const owner = $('#owner').value.trim();
        const repo = $('#repo').value.trim();
        const branch = $('#branch').value.trim();
        if(!owner || !repo) return;
        saveToHash(owner, repo, branch);
        loadRepo(owner, repo, branch);
    });

    $('#search').addEventListener('input', scheduleFilterRebuild);

    $('#ext-filter').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));
    $('#show-folders').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));
    $('#flat-view').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));

    // auth controls
    $('#btn-auth').addEventListener('click', () => setAuthToken($('#token').value.trim()));
    $('#btn-logout').addEventListener('click', () => { $('#token').value = ''; setAuthToken(''); });

    // seleção em massa
    $('#btn-select-visible').addEventListener('click', () => {
        // marca todos os itens atualmente renderizados
        $$('#tree li').forEach(li => {
            const path = li.dataset.path;
            const cb = li.querySelector('input[type="checkbox"]');
            if(path && cb){ cb.checked = true; selectedPaths.add(path); }
        });
        updateSelectionToolbar();
    });
    $('#btn-clear-selection').addEventListener('click', () => {
        selectedPaths.clear();
        $$('#tree input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        updateSelectionToolbar();
    });
    $('#btn-delete-selected').addEventListener('click', async () => {
        try{
            if(selectedPaths.size === 0) return;
            const { owner, repo, branch } = await (async()=>{
                const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
                const owner = hash.get('owner') || DEFAULT_OWNER;
                const repo = hash.get('repo') || DEFAULT_REPO;
                const branch = hash.get('branch') || DEFAULT_BRANCH || 'main';
                return { owner, repo, branch };
            })();
            const confirmMsg = `Excluir ${selectedPaths.size} item(ns)? Esta ação cria commits de remoção.`;
            if(!confirm(confirmMsg)) return;
            // deletar somente arquivos; para pastas, deletamos recursivamente
            const paths = Array.from(selectedPaths);
            for(const path of paths){
                if(!path.startsWith('cstrike/')) continue;
                // se for pasta marcada, delete recursivo dos arquivos dentro
                const li = $(`#tree li[data-path="${CSS.escape(path)}"]`);
                const isDir = li && li.dataset.type === 'dir';
                if(isDir){
                    // apagar todos os arquivos sob a pasta
                    const { files } = repoCache;
                    const under = files.filter(f => f.path.startsWith(path.endsWith('/') ? path : path + '/'));
                    for(const f of under){
                        const sha = await getShaForPath(owner, repo, branch, f.path);
                        if(!sha) continue;
                        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`;
                        const body = { message: `chore: delete ${f.path}`, sha, branch };
                        const res = await fetch(url, { method:'DELETE', headers:{
                            'Authorization': `Bearer ${authToken}`,
                            'Accept': 'application/vnd.github+json',
                            'Content-Type': 'application/json'
                        }, body: JSON.stringify(body)});
                        if(!res.ok){
                            const t = await res.text().catch(()=>"");
                            throw new Error(`Falha ao excluir ${f.path}: ${res.status} ${t}`);
                        }
                    }
                }else{
                    const sha = await getShaForPath(owner, repo, branch, path);
                    if(!sha) continue;
                    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
                    const body = { message: `chore: delete ${path}`, sha, branch };
                    const res = await fetch(url, { method:'DELETE', headers:{
                        'Authorization': `Bearer ${authToken}`,
                        'Accept': 'application/vnd.github+json',
                        'Content-Type': 'application/json'
                    }, body: JSON.stringify(body)});
                    if(!res.ok){
                        const t = await res.text().catch(()=>"");
                        throw new Error(`Falha ao excluir ${path}: ${res.status} ${t}`);
                    }
                }
            }
            selectedPaths.clear();
            updateSelectionToolbar();
            loadRepo(owner, repo, branch);
        }catch(e){ alert(e.message || e); }
    });

    // admin actions
    async function ensureContext(){
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const owner = hash.get('owner');
        const repo = hash.get('repo');
        const branch = hash.get('branch') || '';
        if(!owner || !repo) throw new Error('Defina dono e repositório.');
        return { owner, repo, branch };
    }

    async function githubRequest(method, url, body){
        if(!authToken) throw new Error('Não autenticado. Informe o token.');
        const res = await fetch(url, {
            method,
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if(!res.ok){
            const text = await res.text().catch(()=>"");
            throw new Error(`GitHub API ${res.status}: ${text || res.statusText}`);
        }
        return res.json();
    }

    async function getShaForPath(owner, repo, branch, path){
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) } });
        if(res.status === 404) return null;
        if(!res.ok){
            const text = await res.text().catch(()=>"");
            throw new Error(`Erro ${res.status}: ${text || res.statusText}`);
        }
        const data = await res.json();
        return data.sha || null;
    }

    // Upload/criar arquivo
    $('#btn-upload').addEventListener('click', async () => {
        try{
            const { owner, repo, branch } = await ensureContext();
            const fileInput = $('#upload-file');
            const relPath = $('#upload-path').value.trim();
            if(!fileInput.files || !fileInput.files[0]) throw new Error('Selecione um arquivo.');
            if(!relPath) throw new Error('Informe o caminho dentro de cstrike/.');
            if(!relPath || relPath.includes('..') || relPath.startsWith('/') || relPath.startsWith('cstrike/') === false) throw new Error('O caminho deve começar com cstrike/ e não pode conter ..');

            const file = fileInput.files[0];
            const content = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(content)));

            const existingSha = await getShaForPath(owner, repo, branch || 'main', relPath);
            const body = {
                message: existingSha ? `chore: update ${relPath}` : `feat: add ${relPath}`,
                content: base64,
                branch: branch || undefined,
                sha: existingSha || undefined
            };
            await githubRequest('PUT', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(relPath)}`, body);
            alert('Upload concluído.');
            loadRepo(owner, repo, branch);
        }catch(e){ alert(e.message || e); }
    });

    // Criar pasta (GitHub não tem diretório vazio: criamos .keep)
    $('#btn-mkdir').addEventListener('click', async () => {
        try{
            const { owner, repo, branch } = await ensureContext();
            const p = $('#mkdir-path').value.trim();
            if(!p) throw new Error('Informe o caminho da pasta.');
            const dir = p.replace(/^\/+|\/+$/g, '');
            const rel = dir.startsWith('cstrike/') ? dir : `cstrike/${dir}`;
            if(rel.includes('..')) throw new Error('Caminho inválido.');
            const target = `${rel}/.keep`;
            const body = { message: `feat: mkdir ${rel}`, content: btoa('keep'), branch: branch || undefined };
            await githubRequest('PUT', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(target)}`, body);
            alert('Pasta criada.');
            loadRepo(owner, repo, branch);
        }catch(e){ alert(e.message || e); }
    });

    // Deletar pasta recursivamente
    $('#btn-rmdir').addEventListener('click', async () => {
        try{
            const { owner, repo, branch } = await ensureContext();
            const p = $('#rmdir-path').value.trim();
            if(!p) throw new Error('Informe o caminho da pasta para apagar.');
            const dir = p.replace(/^\/+|\/+$/g, '');
            const rel = dir.startsWith('cstrike/') ? dir : `cstrike/${dir}`;
            if(rel.includes('..')) throw new Error('Caminho inválido.');

            // Listar árvore e deletar blobs
            const { files } = await listAllFiles(owner, repo, branch);
            const toDelete = files.filter(f => f.path.startsWith(rel + '/'));
            for(const f of toDelete){
                const sha = await getShaForPath(owner, repo, branch || 'main', f.path);
                if(!sha) continue;
                await githubRequest('DELETE', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`,
                    { message: `chore: delete ${f.path}`, sha, branch: branch || undefined });
            }

            // Tentar deletar marcador .keep se existir
            const keepSha = await getShaForPath(owner, repo, branch || 'main', `${rel}/.keep`);
            if(keepSha){
                await githubRequest('DELETE', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(rel + '/.keep')}`,
                    { message: `chore: delete ${rel}/.keep`, sha: keepSha, branch: branch || undefined });
            }

            alert('Pasta apagada.');
            loadRepo(owner, repo, branch);
        }catch(e){ alert(e.message || e); }
    });

    // Renomear: copiar para novo e apagar antigo (para arquivos). Para pastas, mover recursivamente
    $('#btn-rename').addEventListener('click', async () => {
        try{
            const { owner, repo, branch } = await ensureContext();
            const from = $('#rename-from').value.trim();
            const to = $('#rename-to').value.trim();
            if(!from || !to) throw new Error('Preencha os dois caminhos.');
            const fromRel = from.startsWith('cstrike/') ? from : `cstrike/${from}`;
            const toRel = to.startsWith('cstrike/') ? to : `cstrike/${to}`;
            if(fromRel.includes('..') || toRel.includes('..')) throw new Error('Caminhos inválidos.');

            // Se for pasta: mover recursivamente
            const isFolder = fromRel.endsWith('/');
            if(isFolder){
                const { files } = await listAllFiles(owner, repo, branch);
                const moves = files.filter(f => f.path.startsWith(fromRel));
                for(const f of moves){
                    const newPath = f.path.replace(fromRel, toRel.replace(/\/$/, '/') );
                    const sha = await getShaForPath(owner, repo, branch || 'main', f.path);
                    if(!sha) continue;
                    // Pegar conteúdo do blob
                    const blob = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`);
                    // Criar no novo local
                    await githubRequest('PUT', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(newPath)}`,
                        { message: `chore: move ${f.path} -> ${newPath}`, content: blob.content, branch: branch || undefined });
                    // Remover antigo
                    await githubRequest('DELETE', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`,
                        { message: `chore: delete ${f.path}`, sha, branch: branch || undefined });
                }
            }else{
                const sha = await getShaForPath(owner, repo, branch || 'main', fromRel);
                if(!sha) throw new Error('Origem não encontrada.');
                const blob = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`);
                await githubRequest('PUT', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(toRel)}`,
                    { message: `chore: move ${fromRel} -> ${toRel}`, content: blob.content, branch: branch || undefined });
                await githubRequest('DELETE', `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fromRel)}`,
                    { message: `chore: delete ${fromRel}`, sha, branch: branch || undefined });
            }

            alert('Renomeação concluída.');
            loadRepo(owner, repo, branch);
        }catch(e){ alert(e.message || e); }
    });
});


