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
    searchDebounceTimer: null
  };

  const EXTENSION_TYPE_MAP = {
    pdf: 'doc', doc: 'doc', docx: 'doc', txt: 'doc', rtf: 'doc', odt: 'doc', md: 'doc',
    xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet',
    ppt: 'slides', pptx: 'slides', odp: 'slides',
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', bmp: 'image', svg: 'image', webp: 'image', ico: 'image',
    mp4: 'video', avi: 'video', mkv: 'video', mov: 'video', webm: 'video', wmv: 'video', flv: 'video',
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio', wma: 'audio',
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive',
    js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', java: 'code', c: 'code', cpp: 'code', h: 'code',
    html: 'code', css: 'code', json: 'code', xml: 'code', yml: 'code', yaml: 'code', sh: 'code', bash: 'code',
    sql: 'code', php: 'code', rb: 'code', go: 'code', rs: 'code', swift: 'code', kt: 'code'
  };

  const TYPE_META = {
    doc:     { icon: '\u{1F4C4}', label: 'Documento' },
    sheet:   { icon: '\u{1F4CA}', label: 'Hoja de cálculo' },
    slides:  { icon: '\u{1F4FD}', label: 'Presentación' },
    image:   { icon: '\u{1F5BC}', label: 'Imagen' },
    video:   { icon: '\u{1F3AC}', label: 'Video' },
    audio:   { icon: '\u{1F3B5}', label: 'Audio' },
    archive: { icon: '\u{1F4E6}', label: 'Comprimido' },
    code:    { icon: '\u{1F4BB}', label: 'Código' },
    other:   { icon: '\u{1F4C4}', label: 'Archivo' }
  };

  function getFileType(item) {
    if (item.isDir) return 'folder';
    if (!item.ext) return 'other';
    return EXTENSION_TYPE_MAP[item.ext.toLowerCase()] || 'other';
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
    sortKey: document.getElementById('sort-key'),
    sortDir: document.getElementById('sort-dir'),
    search: document.getElementById('search'),
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
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: false
      });
      state.fuseIndexBuiltFor = state.items;
    }
    const results = state.fuse.search(q);
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
    icon.textContent = item.isDir ? '\u{1F4C1}' : (TYPE_META[fileType] ? TYPE_META[fileType].icon : TYPE_META.other.icon);
    icon.title = item.isDir ? 'Carpeta' : (TYPE_META[fileType] ? TYPE_META[fileType].label : TYPE_META.other.label);
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
    await loadCurrent();
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

  async function init() {
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