const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ONE_GB = 1024 * 1024 * 1024; // bytes

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
    if(kind === 'dir') return '📁';
    return '📄';
}

function getExt(name){
    const idx = name.lastIndexOf('.');
    return idx > -1 ? name.slice(idx) : '';
}

function buildRow(item, depth){
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'row';
    if(depth > 0) row.style.paddingLeft = `${10 + depth * 16}px`;

    const name = document.createElement('div');
    name.className = 'name';
    const a = document.createElement('a');
    a.className = 'file-link';
    a.textContent = item.name;
    a.href = item.html_url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
    const ic = document.createElement('span');
    ic.className = 'icon';
    ic.textContent = icon(item.type);
    name.appendChild(ic);
    name.appendChild(a);

    const meta = document.createElement('div');
    meta.className = 'meta';
    if(item.type !== 'dir'){
        const size = document.createElement('span');
        size.className = 'chip';
        size.textContent = formatBytes(item.size || 0);
        meta.appendChild(size);
    }
    const ext = getExt(item.name);
    if(ext){
        const ex = document.createElement('span');
        ex.className = 'chip';
        ex.textContent = ext;
        meta.appendChild(ex);
    }

    row.appendChild(name);
    row.appendChild(meta);
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
    const files = (tree.tree || []).filter(n => n.type === 'blob');
    const folders = (tree.tree || []).filter(n => n.type === 'tree');
    return { files, folders, defaultBranch, repoInfo };
}

function buildTreeList(files, folders, owner, repo, branch){
    const ul = $('#tree');
    ul.innerHTML = '';
    const showFolders = $('#show-folders').checked;
    const flat = $('#flat-view').checked;
    const q = $('#search').value.trim().toLowerCase();
    const extFilter = $('#ext-filter').value;

    const makeHtmlUrl = (path) => `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${path}`;

    let entries = [];
    if(flat){
        entries = files.map(f => ({
            name: f.path,
            type: 'file',
            size: f.size || 0,
            html_url: makeHtmlUrl(f.path)
        }));
    }else{
        // hierarchical: we will still render flattened with indentation via name splits
        entries = [];
        for(const f of files){
            entries.push({
                name: f.path,
                type: 'file',
                size: f.size || 0,
                html_url: makeHtmlUrl(f.path)
            });
        }
        if(showFolders){
            for(const d of folders){
                entries.push({ name: d.path + '/', type: 'dir', size: 0, html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${d.path}` });
            }
        }
        // sort: folders first then files, then alpha
        entries.sort((a,b)=>{
            if(a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    // filtering
    entries = entries.filter(e => {
        if(q && !e.name.toLowerCase().includes(q)) return false;
        if(extFilter && e.type !== 'dir' && !e.name.toLowerCase().endsWith(extFilter.toLowerCase())) return false;
        return true;
    });

    for(const e of entries){
        const depth = Math.max(0, e.name.split('/').length - 1);
        ul.appendChild(buildRow(e, depth));
    }
}

function updateMeter(approxBytes){
    const pct = Math.min(100, (approxBytes / ONE_GB) * 100);
    $('#size-bar').style.width = pct.toFixed(2) + '%';
    $('#size-label').textContent = `${formatBytes(approxBytes)} / 1 GB`;
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
        $('#repo-link').href = `https://github.com/${owner}/${repo}`;
        $('#branch-name').textContent = branch || defaultBranch;
        $('#files-count').textContent = files.length.toString();
        $('#folders-count').textContent = folders.length.toString();
        updateMeter(approxBytes);

        $('#repo-summary').hidden = false;
        $('#controls').hidden = false;

        buildTreeList(files, folders, owner, repo, branch || defaultBranch);
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

    $('#repo-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const owner = $('#owner').value.trim();
        const repo = $('#repo').value.trim();
        const branch = $('#branch').value.trim();
        if(!owner || !repo) return;
        saveToHash(owner, repo, branch);
        loadRepo(owner, repo, branch);
    });

    $('#search').addEventListener('input', () => {
        const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
        const owner = hash.get('owner');
        const repo = hash.get('repo');
        const branch = hash.get('branch') || '';
        if(owner && repo){
            listAllFiles(owner, repo, branch).then(({files, folders, defaultBranch}) => {
                buildTreeList(files, folders, owner, repo, branch || defaultBranch);
            }).catch(()=>{});
        }
    });

    $('#ext-filter').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));
    $('#show-folders').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));
    $('#flat-view').addEventListener('change', () => $('#search').dispatchEvent(new Event('input')));
});


