/* =====================================================================
   June SA Road Trip — v2 shared client logic
   Action items, photo modal, day-card hero loader, sticky-rail current
   marker. Same /api/actions backend, same Commons API for photos.
   ===================================================================== */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 1. Wikimedia Commons photo lookup (used by hero loaders + photo modal)
  // ---------------------------------------------------------------------
  var COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

  function stripHtml(s) {
    var d = document.createElement('div');
    d.innerHTML = s || '';
    return (d.textContent || '').trim();
  }

  function fetchPhoto(search) {
    var cacheKey = 'photo:v2:' + search;
    try {
      var cached = sessionStorage.getItem(cacheKey);
      if (cached) return Promise.resolve(JSON.parse(cached));
    } catch (_) {}

    var params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: search,
      gsrnamespace: '6',
      gsrlimit: '1',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1100',
      iiextmetadatafilter: 'Artist|LicenseShortName',
      format: 'json',
      origin: '*',
    });

    return fetch(COMMONS_API + '?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var pages = (data.query && data.query.pages) || {};
        var firstKey = Object.keys(pages)[0];
        if (!firstKey) return null;
        var page = pages[firstKey];
        var ii = (page.imageinfo || [])[0];
        if (!ii) return null;
        var meta = ii.extmetadata || {};
        var result = {
          thumb: ii.thumburl || ii.url,
          file: page.title,
          credit: (meta.Artist && stripHtml(meta.Artist.value)) || 'Wikimedia Commons',
          license: (meta.LicenseShortName && stripHtml(meta.LicenseShortName.value)) || '',
          fileUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title),
        };
        try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch (_) {}
        return result;
      })
      .catch(function () { return null; });
  }

  // ---------------------------------------------------------------------
  // 2. Day-card hero loader (hub page)
  //    Any element with [data-hero-search] gets its first <img> populated
  //    from a Commons search.
  // ---------------------------------------------------------------------
  function loadHeroes() {
    document.querySelectorAll('[data-hero-search]').forEach(function (el) {
      var img = el.querySelector('img');
      if (!img) return;
      fetchPhoto(el.dataset.heroSearch).then(function (photo) {
        if (!photo || !photo.thumb) { el.classList.add('failed'); return; }
        img.addEventListener('load', function () { img.classList.add('loaded'); });
        img.src = photo.thumb;
      });
    });
  }

  // ---------------------------------------------------------------------
  // 3. Action items — full carry-over from v1, restyled via CSS only
  // ---------------------------------------------------------------------
  var API = '/api/actions';
  var actionsState = { items: [] };
  var showCompleted = false;
  var draggedId = null;

  var listEl, doneListEl, emptyEl, toggleEl, formEl, inputEl, addBtn;

  function initActions() {
    listEl = document.getElementById('action-list');
    if (!listEl) return; // no widget on this page
    doneListEl = document.getElementById('action-done-list');
    emptyEl = document.getElementById('action-empty');
    toggleEl = document.getElementById('toggle-completed');
    formEl = document.getElementById('add-form');
    inputEl = document.getElementById('add-input');
    addBtn = document.getElementById('add-btn');

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (inputEl.value || '').trim();
      if (!text) return;
      addBtn.disabled = true;
      postAction({ action: 'add', text: text })
        .then(function (next) { applyActions(next); inputEl.value = ''; })
        .catch(function (err) { console.warn('add failed', err); })
        .then(function () { addBtn.disabled = false; inputEl.focus(); });
    });

    toggleEl.addEventListener('click', function () {
      showCompleted = !showCompleted;
      renderActions();
    });

    loadActions();
    setInterval(loadActions, 30000);
  }

  function postAction(body) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function loadActions() {
    fetch(API).then(function (r) { return r.json(); })
      .then(applyActions)
      .catch(function (e) { console.warn('actions load failed', e); });
  }

  function applyActions(next) {
    actionsState = next && Array.isArray(next.items) ? next : { items: [] };
    renderActions();
  }

  function renderActions() {
    if (!listEl) return;
    listEl.innerHTML = '';
    doneListEl.innerHTML = '';
    var active = actionsState.items.filter(function (i) { return !i.done; });
    var done = actionsState.items.filter(function (i) { return i.done; });

    active.forEach(function (item) { listEl.appendChild(buildActionRow(item)); });
    done.forEach(function (item) { doneListEl.appendChild(buildActionRow(item)); });

    emptyEl.style.display = active.length === 0 ? '' : 'none';
    if (done.length === 0) {
      toggleEl.style.display = 'none';
      doneListEl.style.display = 'none';
    } else {
      toggleEl.style.display = '';
      toggleEl.textContent = (showCompleted ? 'Hide' : 'Show') + ' completed (' + done.length + ')';
      doneListEl.style.display = showCompleted ? '' : 'none';
    }
  }

  function buildActionRow(item) {
    var li = document.createElement('li');
    li.draggable = true;
    li.dataset.id = item.id;

    var grip = document.createElement('span');
    grip.className = 'drag-handle';
    grip.title = 'Drag to reorder';
    grip.textContent = '⋮⋮';

    var label = document.createElement('label');
    label.className = 'check-label';

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!item.done;
    cb.addEventListener('change', function () { toggleAction(item.id, cb.checked); });

    var span = document.createElement('span');
    span.className = 'item-text';
    span.textContent = item.text;
    span.addEventListener('dblclick', function (e) { e.preventDefault(); beginEditText(li, item); });

    var ownerText = (item.owner || '').trim();
    var chip = document.createElement('span');
    chip.className = 'owner-chip' + (ownerText ? '' : ' empty');
    chip.textContent = ownerText || '+ owner';
    chip.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      beginEditOwner(li, item, chip);
    });

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'row-btn edit-btn';
    edit.textContent = '✎';
    edit.addEventListener('click', function (e) { e.preventDefault(); beginEditText(li, item); });

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-btn del-btn';
    del.textContent = '×';
    del.addEventListener('click', function (e) { e.preventDefault(); removeAction(item.id, item.text); });

    label.appendChild(cb);
    label.appendChild(span);
    li.appendChild(grip);
    li.appendChild(label);
    li.appendChild(chip);
    li.appendChild(edit);
    li.appendChild(del);

    attachActionDrag(li, item);
    return li;
  }

  function beginEditText(li, item) {
    if (li.querySelector('.item-edit-input')) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'item-edit-input';
    input.value = item.text;
    input.maxLength = 140;

    var committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      var next = (input.value || '').trim();
      if (!next || next === item.text) { renderActions(); return; }
      renameAction(item.id, next);
    }
    function cancel() {
      if (committed) return;
      committed = true;
      renderActions();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);

    li.draggable = false;
    li.innerHTML = '';
    li.appendChild(input);
    input.focus();
    input.select();
  }

  function beginEditOwner(li, item, chip) {
    if (li.querySelector('.owner-edit-input')) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'owner-edit-input';
    input.value = item.owner || '';
    input.placeholder = 'name';
    input.maxLength = 40;

    var committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      var next = (input.value || '').trim();
      if (next === (item.owner || '')) { renderActions(); return; }
      setActionOwner(item.id, next);
    }
    function cancel() {
      if (committed) return;
      committed = true;
      renderActions();
    }
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);

    li.draggable = false;
    li.replaceChild(input, chip);
    input.focus();
    input.select();
  }

  function toggleAction(id, checked) {
    var item = actionsState.items.find(function (i) { return i.id === id; });
    if (item) { item.done = checked; renderActions(); }
    postAction({ action: 'toggle', id: id, checked: checked })
      .then(applyActions)
      .catch(function (e) { console.warn(e); });
  }
  function removeAction(id, text) {
    if (!confirm('Remove "' + text + '"?')) return;
    actionsState.items = actionsState.items.filter(function (i) { return i.id !== id; });
    renderActions();
    postAction({ action: 'remove', id: id })
      .then(applyActions)
      .catch(function (e) { console.warn(e); loadActions(); });
  }
  function renameAction(id, text) {
    var item = actionsState.items.find(function (i) { return i.id === id; });
    if (item) { item.text = text; renderActions(); }
    postAction({ action: 'rename', id: id, text: text })
      .then(applyActions)
      .catch(function (e) { console.warn(e); loadActions(); });
  }
  function setActionOwner(id, owner) {
    var item = actionsState.items.find(function (i) { return i.id === id; });
    if (item) { item.owner = owner; renderActions(); }
    postAction({ action: 'set-owner', id: id, owner: owner })
      .then(applyActions)
      .catch(function (e) { console.warn(e); loadActions(); });
  }

  function attachActionDrag(li, item) {
    // Mouse drag
    li.addEventListener('dragstart', function (e) {
      draggedId = item.id;
      li.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); } catch (_) {}
    });
    li.addEventListener('dragend', function () {
      li.classList.remove('dragging');
      document.querySelectorAll('.checklist li.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
      draggedId = null;
    });
    li.addEventListener('dragover', function (e) {
      if (!draggedId || draggedId === item.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', function () { li.classList.remove('drag-over'); });
    li.addEventListener('drop', function (e) {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (!draggedId || draggedId === item.id) return;
      reorderAction(draggedId, item.id);
    });

    // Touch drag (long-press)
    var pressTimer = null, dragging = false, startX = 0, startY = 0, currentTarget = null;
    li.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      var t = e.target;
      if (t.closest && t.closest('button, input, .owner-chip, .item-edit-input, .owner-edit-input')) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        pressTimer = null; dragging = true;
        li.classList.add('touch-dragging');
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
      }, 400);
    }, { passive: true });
    li.addEventListener('touchmove', function (e) {
      if (!dragging) {
        var dx = Math.abs(e.touches[0].clientX - startX);
        var dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8 && pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        return;
      }
      e.preventDefault();
      var touch = e.touches[0];
      var elUnder = document.elementFromPoint(touch.clientX, touch.clientY);
      var rowUnder = elUnder && elUnder.closest ? elUnder.closest('.checklist li') : null;
      if (rowUnder !== currentTarget) {
        document.querySelectorAll('.checklist li.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
        if (rowUnder && rowUnder !== li) { rowUnder.classList.add('drag-over'); currentTarget = rowUnder; }
        else currentTarget = null;
      }
    }, { passive: false });
    li.addEventListener('touchend', function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (!dragging) return;
      li.classList.remove('touch-dragging');
      document.querySelectorAll('.checklist li.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
      if (currentTarget && currentTarget !== li && currentTarget.dataset && currentTarget.dataset.id) {
        reorderAction(item.id, currentTarget.dataset.id);
      }
      dragging = false; currentTarget = null;
    });
    li.addEventListener('touchcancel', function () {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      dragging = false; currentTarget = null;
      li.classList.remove('touch-dragging');
      document.querySelectorAll('.checklist li.drag-over').forEach(function (el) { el.classList.remove('drag-over'); });
    });
  }

  function reorderAction(srcId, targetId) {
    var srcIdx = -1, targetIdx = -1;
    for (var i = 0; i < actionsState.items.length; i++) {
      if (actionsState.items[i].id === srcId) srcIdx = i;
      if (actionsState.items[i].id === targetId) targetIdx = i;
    }
    if (srcIdx < 0 || targetIdx < 0 || srcIdx === targetIdx) return;
    var moved = actionsState.items.splice(srcIdx, 1)[0];
    var newTarget = actionsState.items.findIndex(function (i) { return i.id === targetId; });
    actionsState.items.splice(newTarget, 0, moved);
    renderActions();
    postAction({ action: 'reorder', ids: actionsState.items.map(function (i) { return i.id; }) })
      .then(applyActions)
      .catch(function (e) { console.warn(e); loadActions(); });
  }

  // ---------------------------------------------------------------------
  // 4. Photo modal (per-day buttons trigger by data-day, data-day-label)
  //    Photo data lives globally as window.PHOTO_DATA = { dayN: [...] }
  // ---------------------------------------------------------------------
  function initPhotoModal() {
    var modal = document.getElementById('photo-modal');
    if (!modal) return;
    var titleEl = document.getElementById('photo-modal-title');
    var scrollEl = document.getElementById('photo-modal-scroll');

    function buildFigure(entry) {
      var fig = document.createElement('figure');
      fig.className = 'photo-figure';
      var wrap = document.createElement('div');
      wrap.className = 'photo-img-wrap';
      var img = document.createElement('img');
      img.alt = entry.caption;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', function () { img.classList.add('loaded'); });
      img.addEventListener('error', function () { wrap.classList.add('failed'); });
      wrap.appendChild(img);

      var cap = document.createElement('figcaption');
      cap.textContent = entry.caption;
      var creditLine = document.createElement('span');
      creditLine.className = 'photo-credit';
      cap.appendChild(creditLine);
      fig.appendChild(wrap);
      fig.appendChild(cap);

      fetchPhoto(entry.search).then(function (photo) {
        if (!photo || !photo.thumb) { wrap.classList.add('failed'); return; }
        img.src = photo.thumb;
        var parts = [];
        if (photo.credit) parts.push('© ' + photo.credit);
        if (photo.license) parts.push(photo.license);
        var label = parts.join(' · ') || 'Wikimedia Commons';
        if (photo.fileUrl) {
          var a = document.createElement('a');
          a.href = photo.fileUrl; a.target = '_blank'; a.rel = 'noopener';
          a.textContent = label;
          creditLine.appendChild(a);
        } else creditLine.textContent = label;
      });
      return fig;
    }

    function openModal(dayKey, dayLabel) {
      var entries = (window.PHOTO_DATA || {})[dayKey] || [];
      if (!entries.length) return;
      titleEl.textContent = dayLabel || 'Photos';
      scrollEl.innerHTML = '';
      entries.forEach(function (entry) { scrollEl.appendChild(buildFigure(entry)); });
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      modal.querySelector('.photo-modal-close').focus();
    }
    function closeModal() {
      modal.hidden = true;
      document.body.style.overflow = '';
      scrollEl.innerHTML = '';
    }

    document.querySelectorAll('.photos-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(btn.dataset.day, btn.dataset.dayLabel);
      });
    });
    modal.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.dataset && Object.prototype.hasOwnProperty.call(t.dataset, 'close')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
  }

  // ---------------------------------------------------------------------
  // 5. Reading-mode toggle — C5 (Kid view ↔ Full view)
  //    Persists to localStorage as 'v2ReadingMode' = 'kid' | 'full'
  //    Hides [data-detail="adult"] blocks in kid mode.
  // ---------------------------------------------------------------------
  function initReadingMode() {
    var btn = document.getElementById('mode-toggle');
    if (!btn) return;
    var isKid = localStorage.getItem('v2ReadingMode') === 'kid';
    applyMode(isKid);
    btn.addEventListener('click', function () {
      isKid = !isKid;
      localStorage.setItem('v2ReadingMode', isKid ? 'kid' : 'full');
      applyMode(isKid);
    });
    function applyMode(kid) {
      document.body.classList.toggle('mode-kid', kid);
      btn.textContent = kid ? '📖 Full view' : '👦 Kid view';
      btn.classList.toggle('mode-kid-active', kid);
      btn.setAttribute('aria-pressed', kid ? 'true' : 'false');
    }
  }

  document.addEventListener('click', async function (event) {
    var launcher = event.target.closest('.game-launcher');
    if (!launcher) return;

    event.preventDefault();
    var modal = await import('/v2/games/lib/game-modal.js');
    modal.openGameModal({
      gameId: launcher.dataset.gameId,
      title: launcher.dataset.gameTitle,
    });
  });

  // ---------------------------------------------------------------------
  // 6. Boot
  // ---------------------------------------------------------------------
  function boot() {
    loadHeroes();
    initActions();
    initPhotoModal();
    initReadingMode();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
