(function () {
  'use strict';

  const state = {
    driveRoot: null,
    currentDir: null,
    history: [],
    items: [],
    filtered: [],
    selected: null,
    sortKey: 'name',
    sortDir: 'asc',
    search: '',
    groupBy: false,
    collapsedGroups: new Set(),
    fuse: null,
    fuseIndexBuiltFor: null,
    searchDebounceTimer: null,
    viewMode: 'list',          // 'list' (default, tabla) | 'cards' (vista cards validada en themes-preview)
    diskInfo: null             // {path, used, free, total} para la hero card
  };

  const EXTENSION_TYPE_MAP = {
    // Sensitive — sistemas, código, configs (rojo)
    json: 'sensitive', yml: 'sensitive', yaml: 'sensitive', toml: 'sensitive',
    ini: 'sensitive', conf: 'sensitive', config: 'sensitive', env: 'sensitive',
    db: 'sensitive', sqlite: 'sensitive', sqlite3: 'sensitive', mdb: 'sensitive',
    lock: 'sensitive', log: 'sensitive', bak: 'sensitive', tmp: 'sensitive', swp: 'sensitive',
    js: 'sensitive', jsx: 'sensitive', ts: 'sensitive', tsx: 'sensitive',
    py: 'sensitive', java: 'sensitive', c: 'sensitive', cpp: 'sensitive', h: 'sensitive',
    html: 'sensitive', css: 'sensitive', xml: 'sensitive', sql: 'sensitive',
    php: 'sensitive', rb: 'sensitive', go: 'sensitive', rs: 'sensitive',
    swift: 'sensitive', kt: 'sensitive', sh: 'sensitive', bash: 'sensitive',
    // Binary — ejecutables/scripts/paquetes (naranja)
    exe: 'binary', dll: 'binary', so: 'binary', bin: 'binary',
    bat: 'binary', cmd: 'binary', ps1: 'binary', msi: 'binary',
    zip: 'binary', rar: 'binary', '7z': 'binary',
    tar: 'binary', gz: 'binary', bz2: 'binary', xz: 'binary',
    // Office — Word, Excel, PowerPoint (marrón)
    docx: 'office', xlsx: 'office', pptx: 'office',
    doc: 'office', xls: 'office', ppt: 'office',
    odt: 'office', ods: 'office', odp: 'office', csv: 'office', rtf: 'office',
    // Docs — PDFs, txt, markdown (amarillo)
    pdf: 'docs', md: 'docs', txt: 'docs',
    // Media — imágenes, video, audio (celeste)
    png: 'media', jpg: 'media', jpeg: 'media', gif: 'media', bmp: 'media',
    svg: 'media', webp: 'media', ico: 'media',
    mp4: 'media', avi: 'media', mkv: 'media', mov: 'media', webm: 'media',
    wmv: 'media', flv: 'media',
    mp3: 'media', wav: 'media', ogg: 'media', flac: 'media',
    m4a: 'media', aac: 'media', wma: 'media'
  };

  const TYPE_META = {
    sensitive: { icon: '⚙', label: 'Sistema' },
    binary:    { icon: '⚡', label: 'Ejecutable' },
    office:    { icon: '📊', label: 'Office' },
    docs:      { icon: '📄', label: 'Documento' },
    media:     { icon: '🎬', label: 'Media' },
    default:   { icon: '📄', label: 'Archivo' }
  };

  // Map extensión → "icon color" semántico (Figma-style: cada tipo su color).
  // El data-color se setea como atributo; el CSS aplica `var(--color-icon-X)`.
  // Para carpetas siempre devolvemos "folder".
  const FILE_COLOR_MAP = {
    // folder se maneja aparte (carpetas siempre son folder)
    // document
    pdf: 'document', doc: 'document', docx: 'document', txt: 'document', rtf: 'document',
    md: 'document', odt: 'document',
    // office (Excel/PPT/PowerPoint/CSV — todos marrones en el preview)
    xls: 'office', xlsx: 'office', csv: 'office', ods: 'office',
    ppt: 'office', pptx: 'office', odp: 'office',
    // code
    js: 'code', jsx: 'code', ts: 'code', tsx: 'code',
    py: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code',
    html: 'code', css: 'code', json: 'code', xml: 'code', yml: 'code', yaml: 'code',
    sql: 'code', php: 'code', rb: 'code', go: 'code', rs: 'code',
    sh: 'code', bash: 'code',
    // media (todos cyan en el preview)
    png: 'media', jpg: 'media', jpeg: 'media', gif: 'media', bmp: 'media',
    svg: 'media', webp: 'media', ico: 'media',
    mp4: 'media', avi: 'media', mkv: 'media', mov: 'media', webm: 'media',
    wmv: 'media', flv: 'media',
    mp3: 'media', wav: 'media', ogg: 'media', flac: 'media',
    m4a: 'media', aac: 'media', wma: 'media',
    // archive
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
    gz: 'archive', bz2: 'archive', xz: 'archive',
    // exe / binarios
    exe: 'exe', dll: 'exe', msi: 'exe'
  };

  function getFileColor(item) {
    if (item.isDir) return 'folder';
    if (!item.ext) return 'default';
    return FILE_COLOR_MAP[item.ext.toLowerCase()] || 'default';
  }

  function getFileType(item) {
    if (item.isDir) return 'folder';
    if (!item.ext) return 'default';
    return EXTENSION_TYPE_MAP[item.ext.toLowerCase()] || 'default';
  }

  function groupBy(items, keyFn) {
    const groups = new Map();
    for (const item of items) {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === '(carpetas)') return -1;
      if (b === '(carpetas)') return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    const result = [];
    for (const key of sortedKeys) {
      result.push({ key, items: groups.get(key) });
    }
    return result;
  }

  function getGroupKey(item) {
    if (item.isDir) return '(carpetas)';
    return (item.ext || 'sin extensión').toLowerCase();
  }

  const els = {
    breadcrumb: document.getElementById('breadcrumb'),
    back: document.getElementById('btn-back'),
    newFolder: document.getElementById('btn-new-folder'),
    groupBy: document.getElementById('btn-group-by'),
    listar: document.getElementById('btn-listar'),
    sortKey: document.getElementById('sort-key'),
    sortDir: document.getElementById('sort-dir'),
    search: document.getElementById('search'),
    themeToggle: document.getElementById('btn-theme-toggle'),
    searchOverlay: document.getElementById('search-overlay'),
    searchOverlayInput: document.getElementById('search-overlay__input'),
    fileList: document.getElementById('file-list'),
    emptyState: document.getElementById('empty-state'),
    errorState: document.getElementById('error-state'),
    welcome: document.getElementById('welcome'),
    statusCount: document.getElementById('status-count'),
    statusPath: document.getElementById('status-path'),
    contextMenu: document.getElementById('context-menu')
  };

  function toast(message, kind) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'toast toast--visible' + (kind ? ' toast--' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.classList.remove('toast--visible'); }, 2000);
  }

  function setError(msg) {
    if (msg) {
      els.errorState.textContent = msg;
      els.errorState.classList.remove('hidden');
    } else {
      els.errorState.classList.add('hidden');
    }
  }

  function formatSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'hoy';
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) return 'hace ' + diffDays + ' días';
    if (diffDays < 30) return 'hace ' + Math.floor(diffDays / 7) + ' sem';
    if (diffDays < 365) return 'hace ' + Math.floor(diffDays / 30) + ' meses';
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sortItems(items) {
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const key = state.sortKey;
    return items.slice().sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let av = a[key];
      let bv = b[key];
      if (typeof av === 'string' && typeof bv === 'string') {
        return dir * av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    });
  }

  function applyFilter() {
    const q = state.search.trim();
    if (!q) {
      state.filtered = state.items;
      return;
    }
    if (!state.fuse || state.fuseIndexBuiltFor !== state.items) {
      state.fuse = new window.Fuse(state.items, {
        keys: ['name'],
        threshold: 0.0,
        ignoreLocation: true,
        useExtendedSearch: true,
        minMatchCharLength: 1
      });
      state.fuseIndexBuiltFor = state.items;
    }
    const results = state.fuse.search('^' + q);
    state.filtered = results.map(r => r.item);
  }

  function renderBreadcrumb() {
    els.breadcrumb.innerHTML = '';
    if (!state.driveRoot) {
      els.breadcrumb.innerHTML = '<span class="muted">Sin raíz</span>';
      return;
    }
    const rootName = state.driveRoot.split(/[\\/]/).filter(Boolean).pop() || state.driveRoot;
    const rootBtn = document.createElement('button');
    rootBtn.className = 'breadcrumb__item';
    rootBtn.textContent = rootName;
    rootBtn.onclick = () => navigate(state.driveRoot);
    els.breadcrumb.appendChild(rootBtn);

    if (!state.currentDir || state.currentDir === state.driveRoot) {
      rootBtn.classList.add('breadcrumb__current');
      rootBtn.disabled = true;
      return;
    }

    const relative = state.currentDir.slice(state.driveRoot.length).split(/[\\/]/).filter(Boolean);
    let acc = state.driveRoot;
    relative.forEach((segment, i) => {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb__sep';
      sep.textContent = '›';
      els.breadcrumb.appendChild(sep);

      acc = acc + (acc.endsWith('\\') || acc.endsWith('/') ? '' : '\\') + segment;
      if (i === relative.length - 1) {
        const cur = document.createElement('span');
        cur.className = 'breadcrumb__current';
        cur.textContent = segment;
        els.breadcrumb.appendChild(cur);
      } else {
        const btn = document.createElement('button');
        btn.className = 'breadcrumb__item';
        btn.textContent = segment;
        const target = acc;
        btn.onclick = () => navigate(target);
        els.breadcrumb.appendChild(btn);
      }
    });
  }

  function renderFileList() {
    applyFilter();
    const sorted = sortItems(state.filtered);

    els.fileList.innerHTML = '';

    // Vista cards: toggle "Listar". Renderiza hero + grid.
    if (state.viewMode === 'cards') {
      renderCards(sorted);
      // Empty state se sigue manejando en el toggle
      if (sorted.length === 0) {
        els.emptyState.classList.remove('hidden');
      } else {
        els.emptyState.classList.add('hidden');
      }
      els.statusCount.textContent = sorted.length + ' elemento' + (sorted.length === 1 ? '' : 's');
      els.statusPath.textContent = state.currentDir || '';
      return;
    }

    // Vista list (default): el grid actual de file-rows

    const header = document.createElement('div');
    header.className = 'file-header';
    const cols = [
      { key: 'name', label: 'Nombre' },
      { key: 'ext', label: 'Extensión' },
      { key: 'size', label: 'Tamaño' },
      { key: 'mtime', label: 'Modificado' },
      { key: '', label: '' }
    ];
    cols.forEach(col => {
      const cell = document.createElement('div');
      cell.className = 'file-header__cell';
      if (state.sortKey === col.key) {
        cell.classList.add('file-header__cell--active');
        const arrow = document.createElement('span');
        arrow.className = 'file-header__arrow';
        arrow.textContent = state.sortDir === 'asc' ? '↑' : '↓';
        cell.appendChild(document.createTextNode(col.label + ' '));
        cell.appendChild(arrow);
      } else {
        cell.textContent = col.label;
      }
      if (col.key) {
        cell.onclick = () => {
          if (state.sortKey === col.key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = col.key;
            state.sortDir = 'asc';
          }
          els.sortKey.value = state.sortKey;
          els.sortDir.textContent = state.sortDir === 'asc' ? '↓' : '↑';
          renderFileList();
        };
      }
      header.appendChild(cell);
    });
    els.fileList.appendChild(header);

    if (sorted.length === 0) {
      els.emptyState.classList.remove('hidden');
    } else {
      els.emptyState.classList.add('hidden');
    }

    if (state.groupBy) {
      renderGrouped(sorted);
    } else {
      renderFlat(sorted);
    }

    els.statusCount.textContent = sorted.length + ' elemento' + (sorted.length === 1 ? '' : 's');
    els.statusPath.textContent = state.currentDir || '';
  }

  function renderFlat(sorted) {
    sorted.forEach(item => appendRow(item));
  }

  // Vista CARDS: hero (con barra de disco) + "Más usados" (top 4) + "Recientes" (lista).
  // Diseñada para ser CONTENIDA (max-width 1024px) — no se expande al ancho de la app.
  // Solo se muestra en la raíz (Mi unidad). El botón Listar fuerza la navegación
  // si está activada desde una subcarpeta.
  function renderCards(sorted) {
    // 1. Hero card (solo en la raíz)
    if (state.currentDir === state.driveRoot) {
      const hero = document.createElement('article');
      hero.className = 'hero-card';

      const icon = document.createElement('div');
      icon.className = 'hero-card__icon';
      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" y1="16" x2="6.01" y2="16"/><line x1="10" y1="16" x2="10.01" y2="16"/></svg>';
      hero.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'hero-card__title-block';
      const nameEl = document.createElement('div');
      nameEl.className = 'hero-card__name';
      nameEl.textContent = state.driveRoot.split(/[\\/]/).filter(Boolean).pop() || 'Mi unidad';
      const pathEl = document.createElement('div');
      pathEl.className = 'hero-card__path';
      pathEl.textContent = state.driveRoot;
      title.appendChild(nameEl);
      title.appendChild(pathEl);
      hero.appendChild(title);

      const barWrap = document.createElement('div');
      barWrap.className = 'hero-card__bar-wrap';
      const barMeta = document.createElement('div');
      barMeta.className = 'hero-card__bar-meta';
      const barLabel = document.createElement('div');
      barLabel.className = 'hero-card__bar-label';
      barLabel.textContent = 'Disco usado';
      const barValue = document.createElement('div');
      barValue.className = 'hero-card__bar-value';
      if (state.diskInfo && state.diskInfo.total > 0) {
        const usedGB = Math.round(state.diskInfo.used / 1e9);
        const totalGB = Math.round(state.diskInfo.total / 1e9);
        const pct = Math.round((state.diskInfo.used / state.diskInfo.total) * 100);
        barValue.textContent = usedGB + ' GB / ' + totalGB + ' GB · ' + pct + '%';
      } else {
        barValue.textContent = '— / —';
      }
      barMeta.appendChild(barLabel);
      barMeta.appendChild(barValue);
      const bar = document.createElement('div');
      bar.className = 'hero-card__bar';
      const fill = document.createElement('div');
      fill.className = 'hero-card__bar-fill';
      if (state.diskInfo && state.diskInfo.total > 0) {
        const pct = Math.round((state.diskInfo.used / state.diskInfo.total) * 100);
        fill.style.width = pct + '%';
      } else {
        fill.style.width = '0%';
      }
      bar.appendChild(fill);
      barWrap.appendChild(barMeta);
      barWrap.appendChild(bar);
      hero.appendChild(barWrap);

      const open = document.createElement('button');
      open.className = 'btn-icon';
      open.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l10-10"/><path d="M17 7H7"/><path d="M17 7v10"/></svg>';
      open.title = 'Ver detalles de Mi unidad';
      hero.appendChild(open);

      els.fileList.appendChild(hero);
    }

    // 2. Sección "Más usados" — grid pequeño (top 4) con cards contenidas
    // Solo en la raíz. En subcarpetas no se renderiza (cards-solo-en-raíz).
    if (state.currentDir === state.driveRoot) {
      const sectionM = document.createElement('section');
      sectionM.className = 'cards-section';
      const headingM = document.createElement('h3');
      headingM.className = 'cards-section__heading';
      headingM.innerHTML = '★ <span>Más usados</span>';
      sectionM.appendChild(headingM);

      const grid = document.createElement('div');
      grid.className = 'cards-grid';
      const topFiles = sorted.filter(it => !it.isDir).slice(0, 4);
      topFiles.forEach(item => {
        const fileColor = getFileColor(item);
        const fileType = getFileType(item);
        const card = document.createElement('article');
        card.className = 'mini-card';
        card.dataset.color = fileColor;

        const icon = document.createElement('div');
        icon.className = 'mini-card__icon';
        icon.dataset.color = fileColor;
        icon.innerHTML = cardIconSvg(fileColor);
        card.appendChild(icon);

        const name = document.createElement('div');
        name.className = 'mini-card__name';
        name.textContent = item.name;
        name.title = item.name;
        card.appendChild(name);

        card.addEventListener('click', () => {
          if (item.isDir) navigate(item.path);
          else window.driveman.fs.openFile(item.path).catch(err => toast(err.message, 'error'));
        });

        grid.appendChild(card);
      });
      sectionM.appendChild(grid);
      els.fileList.appendChild(sectionM);
    }

    // 3. Sección "Recientes" — lista contenida con los últimos 8 archivos
    if (state.currentDir === state.driveRoot) {
      const sectionR = document.createElement('section');
      sectionR.className = 'cards-section';
      const headingR = document.createElement('h3');
      headingR.className = 'cards-section__heading';
      headingR.innerHTML = '🕘 <span>Recientes</span>';
      sectionR.appendChild(headingR);

      const recentList = document.createElement('div');
      recentList.className = 'recent-list';
      const recentItems = sorted.filter(it => !it.isDir).slice(0, 8);
      recentItems.forEach(item => {
        const fileColor = getFileColor(item);
        const fileType = getFileType(item);
        const row = document.createElement('div');
        row.className = 'recent-row';
        row.dataset.color = fileColor;

        const icon = document.createElement('div');
        icon.className = 'recent-row__icon';
        icon.dataset.color = fileColor;
        icon.innerHTML = cardIconSvg(fileColor);
        row.appendChild(icon);

        const name = document.createElement('div');
        name.className = 'recent-row__name';
        name.textContent = item.name;
        name.title = item.name;
        row.appendChild(name);

        const meta = document.createElement('div');
        meta.className = 'recent-row__meta';
        meta.textContent = formatDate(item.mtime);
        row.appendChild(meta);

        const open = document.createElement('button');
        open.className = 'btn-icon';
        open.title = 'Abrir';
        open.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l10-10"/><path d="M17 7H7"/><path d="M17 7v10"/></svg>';
        open.onclick = (e) => {
          e.stopPropagation();
          if (item.isDir) navigate(item.path);
          else window.driveman.fs.openFile(item.path).catch(err => toast(err.message, 'error'));
        };
        row.appendChild(open);

        row.addEventListener('click', () => {
          if (item.isDir) navigate(item.path);
          else window.driveman.fs.openFile(item.path).catch(err => toast(err.message, 'error'));
        });

        recentList.appendChild(row);
      });
      sectionR.appendChild(recentList);
      els.fileList.appendChild(sectionR);
    }
  }

  // Retorna el SVG según el file color (Figma-style icons).
  function cardIconSvg(fileColor) {
    const COMMON_SVG_HEAD = 'xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    const PATHS = {
      folder:    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
      document:  '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
      office:    '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="12" y1="13" x2="12" y2="21"/>',
      code:      '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 13-1.5 1.5 1.5 1.5"/><path d="m14 13 1.5 1.5-1.5 1.5"/>',
      media:     '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 11 5 3-5 3v-6Z"/>',
      audio:     '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><circle cx="12" cy="14" r="2"/>',
      archive:   '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="8" rx="1"/>',
      exe:       '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><polygon points="9,11 15,12 9,13"/>',
      video:     '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m10 11 5 3-5 3v-6Z"/>',
      default:   '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>'
    };
    const PATH = PATHS[fileColor] || PATHS.default;
    return '<svg ' + COMMON_SVG_HEAD + '>' + PATH + '</svg>';
  }

  function renderGrouped(sorted) {
    const groups = groupBy(sorted, getGroupKey);
    for (const group of groups) {
      const isCollapsed = state.collapsedGroups.has(group.key);
      const groupHeader = document.createElement('div');
      groupHeader.className = 'group-header' + (isCollapsed ? ' group-header--collapsed' : '');
      groupHeader.dataset.group = group.key;
      const arrow = document.createElement('span');
      arrow.className = 'group-header__arrow';
      arrow.textContent = isCollapsed ? '▸' : '▾';
      const label = document.createElement('span');
      label.className = 'group-header__label';
      label.textContent = group.key + ' (' + group.items.length + ')';
      groupHeader.appendChild(arrow);
      groupHeader.appendChild(label);
      groupHeader.onclick = () => {
        if (state.collapsedGroups.has(group.key)) {
          state.collapsedGroups.delete(group.key);
        } else {
          state.collapsedGroups.add(group.key);
        }
        renderFileList();
      };
      els.fileList.appendChild(groupHeader);

      if (!isCollapsed) {
        for (const item of group.items) {
          appendRow(item, group.key);
        }
      }
    }
  }

  function appendRow(item) {
    const row = document.createElement('div');
    const fileType = getFileType(item);
    row.className = 'file-row file-row--' + fileType + (item.isDir ? ' file-row--folder' : '');
    row.draggable = true;
    row.dataset.path = item.path;
    row.dataset.type = fileType;

    const nameCell = document.createElement('div');
    nameCell.className = 'file-row__name';
    const icon = document.createElement('span');
    icon.className = 'file-row__icon';
    icon.textContent = item.isDir ? '\u{1F4C1}' : (TYPE_META[fileType] ? TYPE_META[fileType].icon : TYPE_META.default.icon);
    icon.title = item.isDir ? 'Carpeta' : (TYPE_META[fileType] ? TYPE_META[fileType].label : TYPE_META.default.label);
    const nameText = document.createElement('span');
    nameText.className = 'file-row__name-text';
    nameText.textContent = item.name;
    nameCell.appendChild(icon);
    nameCell.appendChild(nameText);
    row.appendChild(nameCell);

    const extCell = document.createElement('div');
    extCell.className = 'file-row__ext';
    extCell.textContent = item.isDir ? 'Carpeta' : (item.ext || '—');
    row.appendChild(extCell);

    const sizeCell = document.createElement('div');
    sizeCell.className = 'file-row__size';
    sizeCell.textContent = item.isDir ? '' : formatSize(item.size);
    row.appendChild(sizeCell);

    const mtimeCell = document.createElement('div');
    mtimeCell.className = 'file-row__mtime';
    mtimeCell.title = new Date(item.mtime).toLocaleString();
    mtimeCell.textContent = formatDate(item.mtime);
    row.appendChild(mtimeCell);

    const actionsCell = document.createElement('div');
    actionsCell.className = 'file-row__actions';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'icon-btn';
    copyBtn.title = 'Copiar ruta';
    copyBtn.textContent = '⎘';
    copyBtn.onclick = (e) => { e.stopPropagation(); copyPath(item); };
    actionsCell.appendChild(copyBtn);
    const trashBtn = document.createElement('button');
    trashBtn.className = 'icon-btn icon-btn--danger';
    trashBtn.title = 'Mover a papelera';
    trashBtn.textContent = '×';
    trashBtn.onclick = (e) => { e.stopPropagation(); deleteItem(item); };
    actionsCell.appendChild(trashBtn);
    row.appendChild(actionsCell);

    row.addEventListener('click', (e) => {
      if (e.target.closest('.icon-btn')) return;
      state.selected = item;
      document.querySelectorAll('.file-row--selected').forEach(el => el.classList.remove('file-row--selected'));
      row.classList.add('file-row--selected');
    });
    row.addEventListener('dblclick', () => {
      if (item.isDir) navigate(item.path);
      else window.driveman.fs.openFile(item.path).catch(err => toast(err.message, 'error'));
    });
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.selected = item;
      document.querySelectorAll('.file-row--selected').forEach(el => el.classList.remove('file-row--selected'));
      row.classList.add('file-row--selected');
      showContextMenu(e.clientX, e.clientY, item);
    });
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', item.path);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('file-row--dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('file-row--dragging'));
    row.addEventListener('dragover', (e) => {
      if (!item.isDir) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('file-row--drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('file-row--drag-over'));
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      row.classList.remove('file-row--drag-over');
      const src = e.dataTransfer.getData('text/plain');
      if (!src || !item.isDir || src === item.path) return;
      const srcName = src.split(/[\\/]/).pop();
      const dst = joinPath(item.path, srcName);
      try {
        await window.driveman.fs.move(src, dst);
        toast('Movido: ' + srcName, 'success');
        await loadCurrent();
      } catch (err) {
        toast('Error al mover: ' + err.message, 'error');
        await loadCurrent();
      }
    });

    els.fileList.appendChild(row);
  }

  function joinPath(a, b) {
    if (!a) return b;
    const sep = a.includes('\\') ? '\\' : '/';
    return a.endsWith(sep) ? a + b : a + sep + b;
  }

  async function navigate(dirPath) {
    if (!dirPath) return;
    if (state.currentDir) state.history.push(state.currentDir);
    state.currentDir = dirPath;
    // Limpiar el filtro al cambiar de directorio: cada carpeta empieza "limpia"
    // y el usuario no se encuentra con resultados vacíos por un filtro heredado.
    state.search = '';
    if (els.search) els.search.value = '';
    if (els.searchOverlayInput) els.searchOverlayInput.value = '';
    // Limpiar diskInfo al navegar fuera de la raíz
    state.diskInfo = null;
    await loadCurrent();
    await loadDiskInfoIfRoot();
  }

  async function loadDiskInfoIfRoot() {
    if (!state.driveRoot || state.currentDir !== state.driveRoot) return;
    if (!window.driveman.fs.diskInfo) return;
    try {
      state.diskInfo = await window.driveman.fs.diskInfo(state.currentDir);
      if (state.viewMode === 'cards') renderFileList();
    } catch (err) {
      // Silenciar: el hero card mostrará "— / —"
      log('warn', 'main', 'diskInfo failed', { err: err.message });
    }
  }

  async function goBack() {
    if (state.history.length === 0) return;
    state.currentDir = state.history.pop();
    await loadCurrent();
  }

  async function goUp() {
    if (!state.currentDir || state.currentDir === state.driveRoot) return;
    const parent = state.currentDir.split(/[\\/]/).slice(0, -1).join('\\');
    await navigate(parent);
  }

  async function loadCurrent() {
    setError(null);
    if (!state.currentDir) {
      els.fileList.innerHTML = '';
      els.emptyState.classList.add('hidden');
      return;
    }
    try {
      state.items = await window.driveman.fs.listDir(state.currentDir);
      state.fuse = null;
      state.fuseIndexBuiltFor = null;
      renderBreadcrumb();
      renderFileList();
      window.driveman.fs.watch(state.currentDir).catch(() => {});
    } catch (err) {
      state.items = [];
      state.fuse = null;
      state.fuseIndexBuiltFor = null;
      renderBreadcrumb();
      renderFileList();
      setError(err.message);
    }
  }

  function handleGlobalKeydown(e) {
    const target = e.target;
    const isTyping = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    );

    if (e.key === 'Escape') {
      if (!els.searchOverlay.classList.contains('hidden')) {
        closeSearchOverlay();
        e.preventDefault();
        return;
      }
      if (els.search.value) {
        els.search.value = '';
        state.search = '';
        renderFileList();
        e.preventDefault();
        return;
      }
      if (state.selected) {
        hideContextMenu();
        e.preventDefault();
        return;
      }
      return;
    }

    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
      return;
    }

    if (e.key === 'F2') {
      let target = state.selected;
      if (!target && els.fileList) {
        const selectedRow = els.fileList.querySelector('.file-row--selected');
        if (selectedRow && selectedRow.dataset.path) {
          target = { path: selectedRow.dataset.path, name: selectedRow.querySelector('.file-row__name-text')?.textContent || '' };
        }
      }
      if (target) {
        e.preventDefault();
        startRename(target);
        return;
      }
    }

    if (e.key === 'Delete' || e.key === 'Del') {
      if (state.selected && !isTyping) {
        e.preventDefault();
        deleteItem(state.selected);
        hideContextMenu();
        return;
      }
    }

    if (isTyping) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      createFolder();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      els.search.focus();
      els.search.select();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      openSearchOverlay();
      return;
    }
  }

  function showContextMenu(x, y, item) {
    state.selected = item;
    els.contextMenu.innerHTML = '';

    const actions = [
      { label: item.isDir ? 'Abrir carpeta' : 'Abrir archivo', onClick: () => {
          if (item.isDir) navigate(item.path);
          else window.driveman.fs.openFile(item.path);
        }},
      { label: 'Renombrar', onClick: () => startRename(item) },
      { sep: true },
      { label: 'Copiar ruta', onClick: () => copyPath(item) },
      { label: 'Mover a papelera', danger: true, onClick: () => deleteItem(item) }
    ];

    actions.forEach(a => {
      if (a.sep) {
        const sep = document.createElement('div');
        sep.className = 'context-menu__sep';
        els.contextMenu.appendChild(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'context-menu__item' + (a.danger ? ' context-menu__item--danger' : '');
      btn.textContent = a.label;
      btn.onclick = () => { hideContextMenu(); a.onClick(); };
      els.contextMenu.appendChild(btn);
    });

    els.contextMenu.style.left = x + 'px';
    els.contextMenu.style.top = y + 'px';
    els.contextMenu.classList.remove('hidden');
  }

  function hideContextMenu() {
    els.contextMenu.classList.add('hidden');
    state.selected = null;
  }

  function copyPath(item) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(item.path)
        .then(() => toast('Ruta copiada al portapapeles', 'success'))
        .catch(() => toast('No se pudo copiar la ruta', 'error'));
    } else {
      toast('Clipboard no disponible', 'error');
    }
  }

  async function deleteItem(item) {
    const ok = confirm('¿Mover "' + item.name + '" a la papelera?');
    if (!ok) return;
    try {
      await window.driveman.fs.delete(item.path);
      toast('Movido a papelera: ' + item.name, 'success');
      await loadCurrent();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  function startRename(item) {
    let row = els.fileList.querySelector('.file-row--selected');
    if (!row) {
      const rows = els.fileList.querySelectorAll('.file-row');
      for (const r of rows) {
        if (r.dataset.path === item.path) {
          row = r;
          row.classList.add('file-row--selected');
          break;
        }
      }
    }
    if (!row) return;
    const nameText = row.querySelector('.file-row__name-text');
    if (!nameText) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'file-row__name-input';
    input.value = item.name;
    nameText.replaceWith(input);
    input.focus();
    input.select();

    const finish = async (commit) => {
      const newName = input.value.trim();
      input.remove();
      nameText.textContent = item.name;
      if (!commit || newName === '' || newName === item.name) {
        nameText.parentNode.insertBefore(nameText, nameText.parentNode.firstChild.nextSibling);
        const cell = row.querySelector('.file-row__name');
        cell.appendChild(nameText);
        return;
      }
      const newPath = joinPath(item.path.split(/[\\/]/).slice(0, -1).join('\\'), newName);
      try {
        await window.driveman.fs.rename(item.path, newPath);
        toast('Renombrado', 'success');
        await loadCurrent();
      } catch (err) {
        toast('Error al renombrar: ' + err.message, 'error');
        cell.appendChild(nameText);
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function cssEscape(s) {
    return s.replace(/(["\\])/g, '\\$1');
  }

  async function createFolder() {
    if (!state.currentDir) return;
    const name = await openNewFolderModal();
    if (!name) return;
    const folderPath = joinPath(state.currentDir, name);
    try {
      await window.driveman.fs.createFolder(folderPath);
      toast('Carpeta creada: ' + name, 'success');
      await loadCurrent();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    }
  }

  function openNewFolderModal() {
    return new Promise((resolve) => {
      const dialog = document.getElementById('modal-new-folder');
      const input = document.getElementById('modal-new-folder__input');
      const cancelBtn = document.getElementById('modal-new-folder__cancel');
      const errorEl = document.getElementById('modal-new-folder__error');

      input.value = '';
      errorEl.classList.add('hidden');
      errorEl.textContent = '';

      const close = (value) => {
        cancelBtn.removeEventListener('click', onCancel);
        dialog.removeEventListener('close', onClose);
        input.removeEventListener('keydown', onKeydown);
        if (dialog.open) dialog.close();
        resolve(value);
      };

      const onCancel = () => close(null);
      const onClose = () => {
        if (dialog.returnValue === 'cancel') close(null);
      };
      const onKeydown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
      };

      cancelBtn.addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose);
      input.addEventListener('keydown', onKeydown);

      dialog.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (!name) {
          errorEl.textContent = 'El nombre no puede estar vacío';
          errorEl.classList.remove('hidden');
          input.focus();
          return;
        }
        if (/[\\/:*?"<>|]/.test(name)) {
          errorEl.textContent = 'El nombre contiene caracteres no válidos';
          errorEl.classList.remove('hidden');
          input.focus();
          return;
        }
        close(name);
      }, { once: false });

      dialog.showModal();
      input.focus();
    });
  }

  function bindEvents() {
    els.back.onclick = goBack;
    els.newFolder.onclick = createFolder;
    els.groupBy.onclick = () => {
      state.groupBy = !state.groupBy;
      state.collapsedGroups = new Set();
      els.groupBy.setAttribute('aria-pressed', String(state.groupBy));
      els.groupBy.classList.toggle('btn--active', state.groupBy);
      renderFileList();
    };
    // Toggle "Listar": alterna entre vista tabla (list) y vista cards.
    // Regla del usuario: las cards SOLO se muestran en la raíz (Mi unidad).
    // Si está en una subcarpeta y activa Listar, navega a la raíz primero.
    if (els.listar) {
      els.listar.onclick = async () => {
        if (state.currentDir !== state.driveRoot) {
          // Forzar navegación a la raíz antes de activar cards.
          state.viewMode = 'cards';
          els.listar.setAttribute('aria-pressed', 'true');
          els.listar.classList.add('btn--active');
          await navigate(state.driveRoot);
          return;
        }
        // Toggle normal en la raíz
        state.viewMode = state.viewMode === 'cards' ? 'list' : 'cards';
        els.listar.setAttribute('aria-pressed', String(state.viewMode === 'cards'));
        els.listar.classList.toggle('btn--active', state.viewMode === 'cards');
        renderFileList();
      };
    }
    els.sortKey.onchange = () => {
      state.sortKey = els.sortKey.value;
      renderFileList();
    };
    els.sortDir.onclick = () => {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      els.sortDir.textContent = state.sortDir === 'asc' ? '↓' : '↑';
      renderFileList();
    };
    els.search.oninput = () => {
      state.search = els.search.value;
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = setTimeout(renderFileList, 120);
    };
    els.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // El usuario quiere ver el filtro que aplicó. NO vaciar el input.
        // El filtro se limpia con Escape (abajo) o al navegar a otra carpeta.
        els.search.blur();
        if (state.search) toast('Filtro aplicado: ' + state.search, 'success');
      }
    });
    els.themeToggle.onclick = () => {
      // Toggle entre dark (default) y cream (override). Dark no necesita clase.
      const isCream = document.documentElement.classList.toggle('theme-cream');
      try { localStorage.setItem('driveman.theme', isCream ? 'cream' : 'dark'); } catch {}
      els.themeToggle.textContent = isCream ? '☼' : '☾';
      els.themeToggle.title = isCream ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro';
    };
    els.searchOverlayInput.addEventListener('input', () => {
      state.search = els.searchOverlayInput.value;
      clearTimeout(state.searchDebounceTimer);
      state.searchDebounceTimer = setTimeout(renderFileList, 120);
    });
    els.searchOverlayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = state.search;
        // FIX: Enter debe APLICAR el filtro, no limpiarlo.
        // Antes llamaba a closeSearchOverlay() que ahora limpia state + re-renderiza,
        // deshaciendo el filtro inmediatamente. Sincronizar el toolbar con
        // state.search para que el usuario vea el filtro aplicado, y cerrar
        // el overlay solo visualmente.
        if (els.search) els.search.value = q;
        els.searchOverlay.classList.add('hidden');
        els.searchOverlayInput.value = '';
        els.searchOverlayInput.blur();
        if (q) toast('Filtro aplicado: ' + q, 'success');
      }
    });
    document.addEventListener('click', (e) => {
      if (!els.contextMenu.contains(e.target)) hideContextMenu();
    });
    document.addEventListener('keydown', handleGlobalKeydown);
    if (window.driveman.fs && window.driveman.fs.onChanged) {
      window.driveman.fs.onChanged(async () => {
        if (state.currentDir) {
          try {
            state.items = await window.driveman.fs.listDir(state.currentDir);
            renderFileList();
          } catch {}
        }
      });
    }
  }

  function openSearchOverlay() {
    els.searchOverlay.classList.remove('hidden');
    els.searchOverlayInput.value = state.search;
    setTimeout(() => {
      els.searchOverlayInput.focus();
      els.searchOverlayInput.select();
    }, 30);
  }

  function closeSearchOverlay() {
    els.searchOverlay.classList.add('hidden');
    els.searchOverlayInput.value = '';
    els.searchOverlayInput.blur();
    // FIX: limpiar el filtro también del state y del input del toolbar.
    // Antes el filtro quedaba "invisible" (els.search.value vacío pero
    // state.search con valor), bloqueando la vista del directorio al
    // navegar a otra carpeta.
    state.search = '';
    if (els.search) els.search.value = '';
    renderFileList();
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('driveman.theme'); } catch {}
    // Dark es el default (Figma). Cream es el override.
    // Compat: 'light' guardado se sigue respetando como cream.
    const isCream = saved === 'cream' || saved === 'light';
    if (isCream) {
      document.documentElement.classList.add('theme-cream');
      els.themeToggle.textContent = '☼';
      els.themeToggle.title = 'Cambiar a tema oscuro';
    } else {
      document.documentElement.classList.remove('theme-cream');
      els.themeToggle.textContent = '☾';
      els.themeToggle.title = 'Cambiar a tema claro';
    }
  }

  async function init() {
    initTheme();
    bindEvents();
    try {
      state.driveRoot = await window.driveman.app.getDriveRoot();
    } catch {
      state.driveRoot = null;
    }
    if (!state.driveRoot) {
      els.welcome.classList.remove('hidden');
      const dl = document.getElementById('download-link');
      if (dl) dl.onclick = (e) => {
        e.preventDefault();
        window.driveman.openExternal('https://www.google.com/drive/download');
      };
      return;
    }
    state.currentDir = state.driveRoot;
    await loadCurrent();
  }

  init();
})();