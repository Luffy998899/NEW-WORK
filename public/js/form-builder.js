/* Generic JSON -> form editor for the GrowthBox admin panel.
 * Renders window.__SECTION_DATA__ into editable fields, tracks changes in a
 * live state object, and serialises it back into #payload on submit.
 *
 * To keep long sections readable, nested groups and list items are shown as
 * COLLAPSIBLE cards (collapsed by default) with a short summary label, so the
 * editor sees a tidy overview and only expands what they want to change.
 */
(function () {
  var state = JSON.parse(JSON.stringify(window.__SECTION_DATA__));
  var root = document.getElementById('formRoot');
  var openSet = {}; // pathKey -> true (which collapsibles are expanded)

  var LONG_KEYS = ['description', 'content', 'intro', 'mission', 'about', 'subheading',
    'metaDescription', 'message', 'footerLine', 'text', 'maintenanceMessage'];
  var SUMMARY_KEYS = ['title', 'label', 'name', 'heading', 'role', 'question', 'value'];

  function prettyLabel(key) {
    if (typeof key === 'number') return 'Item ' + (key + 1);
    return String(key)
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_\-]/g, ' ')
      .replace(/^./, function (c) { return c.toUpperCase(); })
      .trim();
  }
  function getAt(path) { return path.reduce(function (o, k) { return o[k]; }, state); }
  function setAt(path, val) {
    if (!path.length) { state = val; return; }
    var parent = path.slice(0, -1).reduce(function (o, k) { return o[k]; }, state);
    parent[path[path.length - 1]] = val;
  }
  function isImageKey(key) { return /image$/i.test(String(key)) || String(key).toLowerCase() === 'logoimage'; }

  // Short human summary for a collapsed group/list item.
  function summaryOf(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (var i = 0; i < SUMMARY_KEYS.length; i++) {
        var v = value[SUMMARY_KEYS[i]];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      for (var k in value) { if (typeof value[k] === 'string' && value[k].trim()) return value[k].trim(); }
      return '';
    }
    if (typeof value === 'string') return value;
    return '';
  }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

  function blankFrom(sample) {
    if (Array.isArray(sample)) return [];
    if (sample && typeof sample === 'object') {
      var o = {}; Object.keys(sample).forEach(function (k) { o[k] = blankFrom(sample[k]); }); return o;
    }
    if (typeof sample === 'number') return 0;
    if (typeof sample === 'boolean') return false;
    return '';
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function keyOf(path) { return path.join('.') || 'root'; }

  // Build a collapsible card: header (click to toggle) + body.
  function collapsible(pathKey, headerContent, bodyEl, extraClass) {
    var card = el('div', 'collapsible' + (extraClass ? ' ' + extraClass : ''));
    card.setAttribute('data-key', pathKey);
    var head = el('div', 'collapsible-head');
    var caret = el('span', 'caret', '▸');
    head.appendChild(caret);
    if (typeof headerContent === 'string') head.appendChild(el('span', 'collapsible-title', headerContent));
    else head.appendChild(headerContent);
    var body = el('div', 'collapsible-body');
    body.appendChild(bodyEl);
    card.appendChild(head);
    card.appendChild(body);
    if (openSet[pathKey]) card.classList.add('open');
    head.addEventListener('click', function (e) {
      if (e.target.closest('.remove-btn')) return; // don't toggle when removing
      card.classList.toggle('open');
      if (card.classList.contains('open')) openSet[pathKey] = true; else delete openSet[pathKey];
    });
    return card;
  }

  function buildString(value, path, key) {
    var wrap = el('div', 'form-group');
    wrap.appendChild(el('label', null, prettyLabel(key)));
    if (isImageKey(key)) { wrap.appendChild(buildImageField(value, path)); return wrap; }
    var isLong = LONG_KEYS.indexOf(String(key)) !== -1 || (typeof value === 'string' && value.length > 80);
    var input = isLong ? el('textarea') : el('input');
    if (!isLong) input.type = 'text';
    input.value = value == null ? '' : value;
    input.addEventListener('input', function () { setAt(path, input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function buildBoolean(value, path, key) {
    var wrap = el('div', 'form-group toggle-group');
    var label = el('label', 'switch');
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!value;
    cb.addEventListener('change', function () { setAt(path, cb.checked); });
    var slider = el('span', 'slider');
    label.appendChild(cb); label.appendChild(slider);
    var txt = el('span', 'toggle-label', prettyLabel(key));
    var row = el('div', 'toggle-row');
    row.appendChild(label); row.appendChild(txt);
    wrap.appendChild(row);
    return wrap;
  }

  function buildImageField(value, path) {
    var field = el('div', 'img-field');
    var img = el('img'); img.src = value || '/images/hero.svg';
    img.onerror = function () { img.style.visibility = 'hidden'; };
    var col = el('div');
    var input = el('input'); input.type = 'text'; input.value = value || '';
    input.placeholder = '/images/... or paste URL'; input.style.marginBottom = '6px';
    input.addEventListener('input', function () { setAt(path, input.value); img.src = input.value; img.style.visibility = 'visible'; });
    var upBtn = el('label', 'btn btn-ghost btn-sm up-btn', 'Upload image');
    var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      var fd = new FormData(); fd.append('image', file.files[0]);
      upBtn.textContent = 'Uploading…';
      fetch('/admin/upload', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.url) { input.value = data.url; setAt(path, data.url); img.src = data.url; img.style.visibility = 'visible'; }
          upBtn.textContent = 'Upload image';
        })
        .catch(function () { upBtn.textContent = 'Upload failed'; });
    });
    upBtn.appendChild(file);
    col.appendChild(input); col.appendChild(upBtn);
    field.appendChild(img); field.appendChild(col);
    return field;
  }

  function buildArray(arr, path, key) {
    var body = el('div');
    var list = el('div', 'nested');
    arr.forEach(function (item, i) { list.appendChild(buildArrayItem(item, path.concat(i))); });
    body.appendChild(list);
    var addBtn = el('button', 'add-btn'); addBtn.type = 'button'; addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', function () {
      var current = getAt(path);
      current.push(current.length ? blankFrom(current[0]) : '');
      openSet[keyOf(path.concat(current.length - 1))] = true; // open the new one
      openSet[keyOf(path)] = true;
      rerender();
    });
    body.appendChild(addBtn);
    var header = el('span', 'collapsible-title');
    header.appendChild(document.createTextNode(prettyLabel(key)));
    header.appendChild(el('span', 'count-badge', arr.length + (arr.length === 1 ? ' item' : ' items')));
    return collapsible(keyOf(path), header, body, 'grp');
  }

  function buildArrayItem(item, path) {
    var body = el('div');
    var rm = el('button', 'remove-btn', '✕'); rm.type = 'button'; rm.title = 'Remove';
    rm.addEventListener('click', function () {
      var parentPath = path.slice(0, -1);
      getAt(parentPath).splice(path[path.length - 1], 1);
      rerender();
    });
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.keys(item).forEach(function (k) { body.appendChild(buildValue(item[k], path.concat(k), k)); });
    } else if (Array.isArray(item)) {
      body.appendChild(buildArray(item, path, 'items'));
    } else {
      body.appendChild(buildString(item, path, 'value'));
    }
    var idx = path[path.length - 1];
    var title = el('span', 'collapsible-title');
    title.appendChild(el('span', 'item-num', '#' + (idx + 1)));
    title.appendChild(document.createTextNode(' ' + truncate(summaryOf(item) || 'Item', 60)));
    var head = el('span', 'item-head-inner');
    head.appendChild(title);
    head.appendChild(rm);
    return collapsible(keyOf(path), head, body, 'array-item');
  }

  function buildObject(obj, path, key) {
    var body = el('div');
    Object.keys(obj).forEach(function (k) { body.appendChild(buildValue(obj[k], path.concat(k), k)); });
    if (path.length === 0) return body; // top-level: no wrapper
    var header = el('span', 'collapsible-title');
    header.appendChild(document.createTextNode(prettyLabel(key)));
    var s = summaryOf(obj);
    if (s) header.appendChild(el('span', 'grp-summary', truncate(s, 40)));
    return collapsible(keyOf(path), header, body, 'grp');
  }

  function buildValue(value, path, key) {
    if (Array.isArray(value)) return buildArray(value, path, key);
    if (value && typeof value === 'object') return buildObject(value, path, key);
    if (typeof value === 'boolean') return buildBoolean(value, path, key);
    return buildString(value, path, key);
  }

  function rerender() {
    root.innerHTML = '';
    root.appendChild(buildValue(state, [], 'root'));
  }

  // Expand / collapse all controls
  window.__gbExpandAll = function (open) {
    document.querySelectorAll('#formRoot .collapsible').forEach(function (c) {
      var k = c.getAttribute('data-key');
      if (open) { c.classList.add('open'); openSet[k] = true; }
      else { c.classList.remove('open'); delete openSet[k]; }
    });
  };

  rerender();
  document.getElementById('editForm').addEventListener('submit', function () {
    document.getElementById('payload').value = JSON.stringify(state);
  });
})();
