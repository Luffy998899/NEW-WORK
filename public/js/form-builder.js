/* Generic JSON -> form editor for the GrowthBox admin panel.
   Renders window.__SECTION_DATA__ into editable fields, tracks changes in a
   live state object, and serialises it back into #payload on submit. */
(function () {
  var state = JSON.parse(JSON.stringify(window.__SECTION_DATA__));
  var root = document.getElementById('formRoot');

  var LONG_KEYS = ['description', 'content', 'intro', 'mission', 'about', 'subheading',
    'metaDescription', 'message', 'footerLine'];

  function prettyLabel(key) {
    if (typeof key === 'number') return 'Item ' + (key + 1);
    return String(key)
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_\-]/g, ' ')
      .replace(/^./, function (c) { return c.toUpperCase(); })
      .trim();
  }

  function getAt(path) {
    return path.reduce(function (o, k) { return o[k]; }, state);
  }
  function setAt(path, val) {
    if (!path.length) { state = val; return; }
    var parent = path.slice(0, -1).reduce(function (o, k) { return o[k]; }, state);
    parent[path[path.length - 1]] = val;
  }

  function isImageKey(key) {
    return /image$/i.test(String(key)) || String(key).toLowerCase() === 'logoimage';
  }

  // Build a blank template from an existing sample (empties strings, keeps shape).
  function blankFrom(sample) {
    if (Array.isArray(sample)) return [];
    if (sample && typeof sample === 'object') {
      var o = {};
      Object.keys(sample).forEach(function (k) { o[k] = blankFrom(sample[k]); });
      return o;
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

  function buildString(value, path, key) {
    var wrap = el('div', 'form-group');
    var label = el('label', null, prettyLabel(key));
    wrap.appendChild(label);

    if (isImageKey(key)) {
      wrap.appendChild(buildImageField(value, path));
      return wrap;
    }

    var isLong = LONG_KEYS.indexOf(String(key)) !== -1 || (typeof value === 'string' && value.length > 80);
    var input = isLong ? el('textarea') : el('input');
    if (!isLong) input.type = 'text';
    input.value = value == null ? '' : value;
    input.addEventListener('input', function () { setAt(path, input.value); });
    wrap.appendChild(input);
    return wrap;
  }

  function buildImageField(value, path) {
    var field = el('div', 'img-field');
    var img = el('img');
    img.src = value || '/images/hero.svg';
    img.onerror = function () { img.style.visibility = 'hidden'; };
    var col = el('div');
    var input = el('input');
    input.type = 'text';
    input.value = value || '';
    input.placeholder = '/images/... or paste URL';
    input.style.marginBottom = '6px';
    input.addEventListener('input', function () { setAt(path, input.value); img.src = input.value; img.style.visibility = 'visible'; });

    var upBtn = el('label', 'btn btn-ghost btn-sm up-btn', 'Upload image');
    var file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.style.display = 'none';
    file.addEventListener('change', function () {
      if (!file.files || !file.files[0]) return;
      var fd = new FormData();
      fd.append('image', file.files[0]);
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

    col.appendChild(input);
    col.appendChild(upBtn);
    field.appendChild(img);
    field.appendChild(col);
    return field;
  }

  function buildArray(arr, path, key) {
    var fs = el('fieldset');
    var legend = el('legend', null, prettyLabel(key));
    fs.appendChild(legend);
    var list = el('div', 'nested');
    fs.appendChild(list);

    arr.forEach(function (item, i) {
      list.appendChild(buildArrayItem(item, path.concat(i), i, arr, path));
    });

    var addBtn = el('button', 'add-btn');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', function () {
      var current = getAt(path);
      var template = current.length ? blankFrom(current[0]) : '';
      current.push(template);
      rerender();
    });
    fs.appendChild(addBtn);
    return fs;
  }

  function buildArrayItem(item, path, index) {
    var box = el('div', 'array-item');
    box.appendChild(el('div', 'item-index', prettyLabel(index)));
    var rm = el('button', 'remove-btn', '✕');
    rm.type = 'button';
    rm.title = 'Remove';
    rm.addEventListener('click', function () {
      var parentPath = path.slice(0, -1);
      var arr = getAt(parentPath);
      arr.splice(path[path.length - 1], 1);
      rerender();
    });
    box.appendChild(rm);

    if (item && typeof item === 'object' && !Array.isArray(item)) {
      Object.keys(item).forEach(function (k) {
        box.appendChild(buildValue(item[k], path.concat(k), k));
      });
    } else if (Array.isArray(item)) {
      box.appendChild(buildArray(item, path, 'items'));
    } else {
      box.appendChild(buildString(item, path, 'value'));
    }
    return box;
  }

  function buildObject(obj, path, key) {
    var container;
    if (path.length === 0) {
      container = el('div');
    } else {
      container = el('fieldset');
      container.appendChild(el('legend', null, prettyLabel(key)));
    }
    Object.keys(obj).forEach(function (k) {
      container.appendChild(buildValue(obj[k], path.concat(k), k));
    });
    return container;
  }

  function buildValue(value, path, key) {
    if (Array.isArray(value)) return buildArray(value, path, key);
    if (value && typeof value === 'object') return buildObject(value, path, key);
    if (typeof value === 'boolean') {
      var wrap = el('div', 'form-group');
      var label = el('label', null, prettyLabel(key));
      var cb = el('input'); cb.type = 'checkbox'; cb.checked = value;
      cb.addEventListener('change', function () { setAt(path, cb.checked); });
      label.style.display = 'flex'; label.style.gap = '8px'; label.style.alignItems = 'center';
      label.prepend(cb);
      wrap.appendChild(label);
      return wrap;
    }
    return buildString(value, path, key);
  }

  function rerender() {
    root.innerHTML = '';
    root.appendChild(buildValue(state, [], 'root'));
  }

  rerender();

  document.getElementById('editForm').addEventListener('submit', function () {
    document.getElementById('payload').value = JSON.stringify(state);
  });
})();
