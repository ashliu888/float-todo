const $ = s => document.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
};
const ICON = {
  pause: '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  cancel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M6.5 6.5l11 11"/></svg>',
  del: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>'
};

/* ---------- state ---------- */
const DEF_CATS = ['school', 'research', 'life'];
const DEF_COLORS = { school: '#7aa7f7', research: '#b79cf3', life: '#7fd1a3' };
const PALETTE = ['#7aa7f7', '#b79cf3', '#7fd1a3', '#f5b66b', '#f08f9a', '#6cc7d9', '#c9d46a', '#a0a7b4'];
const TABS = [['todo', 'To-do'], ['pending', 'Pending'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
let S;
try { S = JSON.parse(localStorage.getItem('floattodo.v1')); } catch { S = null; }
if (!S) {
  const today = iso(new Date());
  S = { v: 3, tab: 'todo', collapsed: {}, cats: [...DEF_CATS], colors: { ...DEF_COLORS }, opacity: 74, tasks: [
    mk('Finish problem set 3', 'school', today),
    mk('Read two papers on diffusion models', 'research'),
    mk('Buy groceries', 'life')
  ] };
}
if ((S.v || 1) < 2) {            // migrate: drop the old "content" section, keep its tasks under life
  S.v = 2;
  S.cats = (S.cats || []).filter(c => c !== 'content');
  S.tasks.forEach(t => { if (t.cat === 'content') t.cat = 'life'; });
  for (const c of DEF_CATS) if (!S.cats.includes(c)) S.cats.push(c);
  S.colors = { ...DEF_COLORS, ...(S.colors || {}) };
}
if ((S.v || 1) < 3) { S.v = 3; S.opacity = 74; }
S.colors = S.colors || {};
S.opacity = S.opacity ?? 74;
let editing = null, picking = null, confirmDel = null, addingCat = false, editingTask = null;
function mk(text, cat, due = '', extra = {}) {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, cat, due, status: 'todo', ...extra };
}
const save = () => localStorage.setItem('floattodo.v1', JSON.stringify(S));

/* ---------- dates ---------- */
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseDate(s) {
  s = s.toLowerCase();
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (s === 'today' || s === 'td') return iso(t);
  if (s === 'tomorrow' || s === 'tm') { t.setDate(t.getDate() + 1); return iso(t); }
  let m = s.match(/^\+(\d+)d?$/);
  if (m) { t.setDate(t.getDate() + +m[1]); return iso(t); }
  m = s.match(/^(?:(\d{4})-)?(\d{1,2})[-\/](\d{1,2})$/);
  if (m) return `${m[1] || t.getFullYear()}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}
function dueInfo(t) {
  if (!t.due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = Math.round((new Date(t.due + 'T00:00') - today) / 864e5);
  const time = t.time ? ' ' + t.time : '';
  if (t.status === 'todo' && d < 0) return { text: `${-d}d overdue${time}`, over: true };
  if (d === 0) return { text: 'Today' + time };
  if (d === 1) return { text: 'Tomorrow' + time };
  return { text: t.due.slice(5).replace('-', '/') + time };
}
const hue = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const colorOf = c => S.colors[c] || `hsl(${hue(c)} 65% 68%)`;
const allCats = () => [...new Set([...S.cats, ...S.tasks.map(t => t.cat)])];
const canon = n => allCats().find(c => c.toLowerCase() === n.toLowerCase()) || n;

function renameCat(old, name) {
  editing = null;
  name = name.trim();
  if (!name || name === old) return render();
  const other = allCats().find(c => c !== old && c.toLowerCase() === name.toLowerCase());
  const final = other || name;                       // same name as another category = merge into it
  S.tasks.forEach(t => { if (t.cat === old) t.cat = final; });
  if (S.cats.includes(final)) S.cats = S.cats.filter(c => c !== old);
  else if (S.cats.includes(old)) S.cats = S.cats.map(c => c === old ? final : c);
  else S.cats.push(final);
  if (!S.colors[final] && S.colors[old]) S.colors[final] = S.colors[old];
  if (S.collapsed[old]) S.collapsed[final] = true;
  delete S.colors[old]; delete S.collapsed[old];
  save(); render();
}
function deleteCat(c) {
  S.cats = S.cats.filter(x => x !== c);
  S.tasks = S.tasks.filter(t => t.cat !== c);
  delete S.colors[c]; delete S.collapsed[c];
  confirmDel = null; save(); render();
}
function addCat(name) {
  addingCat = false;
  name = name.trim();
  if (name && !allCats().some(c => c.toLowerCase() === name.toLowerCase())) { S.cats.push(name); save(); }
  render();
}

/* ---------- actions ---------- */
const setStatus = (t, st) => { t.status = st; save(); render(); };
const remove = t => { S.tasks = S.tasks.filter(x => x !== t); save(); render(); };
function move(id, cat, refId, before) {
  const i = S.tasks.findIndex(t => t.id === id);
  if (i < 0 || id === refId) return;
  const [t] = S.tasks.splice(i, 1);
  t.cat = cat;
  const r = S.tasks.findIndex(x => x.id === refId);
  if (r < 0) S.tasks.push(t); else S.tasks.splice(before ? r : r + 1, 0, t);
  save(); render();
}
function addTodo() {
  const inp = $('#new');
  let text = inp.value;
  let cat = $('#cat').value.trim();
  let due = $('#due').value;
  text = text.replace(/(^|\s)#(\S+)/, (_, sp, c) => { cat = c; return sp; });
  text = text.replace(/(^|\s)@(\S+)/, (m, sp, d) => { const p = parseDate(d); if (p) { due = p; return sp; } return m; });
  text = text.trim();
  if (!text) return;
  cat = canon(cat || S.cats[0] || 'life');
  if (!S.cats.includes(cat)) S.cats.push(cat);
  S.tasks.push(mk(text, cat, due));
  S.tab = 'todo';
  inp.value = ''; $('#due').value = '';
  save(); render();
}

/* ---------- render ---------- */
let dragId = null;
const clearMarks = () => document.querySelectorAll('.drop-before,.drop-after,.drop-end').forEach(e => e.classList.remove('drop-before', 'drop-after', 'drop-end'));

function actBtn(icon, title, fn, cls = '') {
  return h('button', { class: 'act ' + cls, title, html: icon, onclick: e => { e.stopPropagation(); fn(); } });
}

function itemEl(t) {
  const cb = h('input', { type: 'checkbox' });
  cb.checked = t.status === 'completed';
  cb.addEventListener('change', () => setStatus(t, cb.checked ? 'completed' : 'todo'));
  const di = dueInfo(t);
  const acts = [];
  if (t.status === 'todo') acts.push(actBtn(ICON.pause, 'Move to Pending', () => setStatus(t, 'pending')),
                                     actBtn(ICON.cancel, 'Cancel', () => setStatus(t, 'cancelled')));
  else if (t.status === 'pending') acts.push(actBtn(ICON.play, 'Back to To-do', () => setStatus(t, 'todo')),
                                     actBtn(ICON.cancel, 'Cancel', () => setStatus(t, 'cancelled')));
  else acts.push(actBtn(ICON.undo, 'Restore', () => setStatus(t, 'todo')));
  if (editingTask !== t.id) acts.unshift(actBtn(ICON.edit, 'Edit', () => { editingTask = t.id; render(); }));
  acts.push(actBtn(ICON.del, 'Delete', () => remove(t), 'del'));

  const row = h('div', { class: `item ${t.status === 'completed' ? 'done' : ''} ${t.status === 'cancelled' ? 'cancelled' : ''}`, draggable: editingTask === t.id ? 'false' : 'true' });

  let body;
  if (editingTask === t.id) {
    const txt = h('input', { class: 'tedit', value: t.text });
    const due = h('input', { type: 'date', class: 'tdue', value: t.due || '' });
    const commit = () => {
      const v = txt.value.trim();
      if (v) t.text = v;
      t.due = due.value || '';
      editingTask = null; save(); render();
    };
    txt.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') { editingTask = null; render(); }
    });
    due.addEventListener('keydown', e => { if (!e.isComposing && e.key === 'Enter') commit(); });
    [txt, due].forEach(el => el.addEventListener('blur', () => { setTimeout(() => { if (editingTask === t.id && !row.contains(document.activeElement)) commit(); }, 0); }));
    body = h('div', { class: 'body editing' }, txt, h('div', { class: 'edit-row' }, due, t.time ? h('span', { class: 'meta' }, t.time) : null));
    setTimeout(() => { txt.focus(); txt.select(); });
  } else {
    body = h('div', { class: 'body', ondblclick: () => { editingTask = t.id; render(); } },
      h('div', { class: 'text' }, t.text), di ? h('div', { class: 'meta' + (di.over ? ' over' : '') }, di.text) : null);
  }

  row.append(cb, body, h('div', { class: 'acts' }, acts));

  row.addEventListener('dragstart', e => { dragId = t.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); });
  row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); clearMarks(); });
  row.addEventListener('dragover', e => {
    if (!dragId) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    clearMarks();
    row.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  row.addEventListener('drop', e => {
    if (!dragId) return;
    e.preventDefault(); e.stopPropagation();
    const r = row.getBoundingClientRect();
    move(dragId, t.cat, t.id, e.clientY < r.top + r.height / 2);
  });
  return row;
}

function render() {
  $('#today').textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  $('#ballCount').textContent = S.tasks.filter(t => t.status === 'todo').length;

  const tabs = $('#tabs'); tabs.replaceChildren();
  for (const [key, label] of TABS) {
    const n = S.tasks.filter(t => t.status === key).length;
    tabs.append(h('button', { class: S.tab === key ? 'on' : '', onclick: () => { S.tab = key; save(); render(); } }, label, h('i', {}, n || '')));
  }

  const cats = allCats();
  $('#catlist').replaceChildren(...cats.map(c => h('option', { value: c })));

  const list = $('#list'); list.replaceChildren();
  const tasks = S.tasks.filter(t => t.status === S.tab);
  let shown = 0;
  for (const c of cats) {
    const items = tasks.filter(t => t.cat === c);
    if (!items.length && S.tab !== 'todo') continue;
    shown++;
    const total = S.tasks.filter(t => t.cat === c).length;
    const g = h('div', { class: 'group' + (S.collapsed[c] ? ' closed' : ''), style: `--c:${colorOf(c)}` });

    let nameEl;
    if (editing === c) {
      nameEl = h('input', { class: 'gedit', value: c, onclick: e => e.stopPropagation() });
      nameEl.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'Enter') renameCat(c, nameEl.value);
        if (e.key === 'Escape') { editing = null; render(); }
      });
      nameEl.addEventListener('blur', () => { if (editing === c) renameCat(c, nameEl.value); });
      setTimeout(() => { nameEl.focus(); nameEl.select(); });
    } else {
      nameEl = h('span', { class: 'gname', title: 'Double-click to rename', ondblclick: e => { e.stopPropagation(); editing = c; render(); } }, c);
    }

    const delBtn = confirmDel === c
      ? h('button', { class: 'act confirm', onclick: e => { e.stopPropagation(); deleteCat(c); } }, total ? `Delete ${total}?` : 'Delete?')
      : actBtn(ICON.del, 'Delete category', () => {
          if (!total) return deleteCat(c);
          confirmDel = c; render();
          setTimeout(() => { if (confirmDel === c) { confirmDel = null; render(); } }, 3000);
        }, 'del');

    g.append(h('div', { class: 'group-head', onclick: () => { if (editing === c) return; S.collapsed[c] = !S.collapsed[c]; save(); render(); } },
      h('span', { html: ICON.chev }),
      h('span', { class: 'dot', title: 'Change color', onclick: e => { e.stopPropagation(); picking = picking === c ? null : c; render(); } }),
      nameEl, h('span', { class: 'count' }, items.length),
      h('span', { class: 'gacts' }, actBtn(ICON.edit, 'Rename', () => { editing = c; render(); }), delBtn)));

    if (picking === c) {
      g.append(h('div', { class: 'swatches' }, PALETTE.map(col => {
        const b = h('button', { class: colorOf(c) === col ? 'on' : '', style: `background:${col}`, title: col });
        b.addEventListener('click', e => { e.stopPropagation(); S.colors[c] = col; picking = null; save(); render(); });
        return b;
      })));
    }
    g.append(h('div', { class: 'items' }, items.length ? items.map(itemEl) : h('div', { class: 'none' }, 'Drop a task here')));
    g.addEventListener('dragover', e => { if (!dragId) return; e.preventDefault(); clearMarks(); g.classList.add('drop-end'); });
    g.addEventListener('drop', e => { if (!dragId) return; e.preventDefault(); move(dragId, c, null); });
    list.append(g);
  }
  if (!shown) list.append(h('div', { class: 'empty' }, 'Nothing here'));

  if (addingCat) {
    const inp = h('input', { class: 'newcat', placeholder: 'Category name' });
    inp.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') addCat(inp.value);
      if (e.key === 'Escape') { addingCat = false; render(); }
    });
    inp.addEventListener('blur', () => { if (addingCat) addCat(inp.value); });
    list.append(h('div', { class: 'add-cat' }, inp));
    setTimeout(() => inp.focus());
  } else {
    list.append(h('div', { class: 'add-cat' }, h('button', { onclick: () => { addingCat = true; render(); } }, '+ New category')));
  }
}

/* ---------- hover open / close, pin, drag ---------- */
let open = false, pinned = false, dragging = false, inside = false, timer;
function setOpen(v) {
  if (open === v) return;
  open = v;
  window.api.setExpanded(v);
  document.body.classList.toggle('open', v);
  if (!v) {
    document.activeElement?.blur();
    opacityOpen = false; $('#transp').classList.remove('on'); $('#opacityPop').classList.remove('show');
  }
}
const typing = () => {
  const a = document.activeElement;
  return !!a && ((a.id === 'new' && a.value.trim() !== '') || a.matches('.gedit, .newcat, .tedit, .tdue') || editingTask);
};
function scheduleClose() {
  clearTimeout(timer);
  timer = setTimeout(() => { if (!inside && !pinned && !dragging && !opacityOpen && !typing()) setOpen(false); }, 450);
}
document.documentElement.addEventListener('mouseenter', () => { inside = true; clearTimeout(timer); });
document.documentElement.addEventListener('mouseleave', () => { inside = false; scheduleClose(); });
$('#ball').addEventListener('mouseenter', () => setOpen(true));
document.addEventListener('focusout', scheduleClose);
$('#pin').addEventListener('click', () => { pinned = !pinned; $('#pin').classList.toggle('on', pinned); if (!pinned) scheduleClose(); });

/* ---------- background transparency ---------- */
function applyOpacity() {
  document.documentElement.style.setProperty('--glass-pct', S.opacity + '%');
  $('#opacitySlider').value = S.opacity;
  $('#opacityVal').textContent = S.opacity + '%';
}
let opacityOpen = false;
$('#transp').addEventListener('click', () => {
  opacityOpen = !opacityOpen;
  $('#transp').classList.toggle('on', opacityOpen);
  $('#opacityPop').classList.toggle('show', opacityOpen);
  clearTimeout(timer);
});
$('#opacitySlider').addEventListener('input', e => {
  S.opacity = +e.target.value;
  $('#opacityVal').textContent = S.opacity + '%';
  document.documentElement.style.setProperty('--glass-pct', S.opacity + '%');
});
$('#opacitySlider').addEventListener('change', () => save());
applyOpacity();

for (const el of [$('#ball'), $('#head')]) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return;
    dragging = true; el.setPointerCapture(e.pointerId); window.api.dragStart();
  });
  el.addEventListener('pointermove', () => { if (dragging) window.api.dragMove(); });
  el.addEventListener('pointerup', () => { if (dragging) { dragging = false; window.api.dragEnd(); scheduleClose(); } });
  el.addEventListener('contextmenu', e => { e.preventDefault(); window.api.contextMenu(); });
}

/* ---------- input, calendar sync ---------- */
$('#new').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) addTodo(); });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}
$('#sync').addEventListener('click', async () => {
  const btn = $('#sync'); btn.classList.add('spin');
  const res = await window.api.syncCalendar();
  btn.classList.remove('spin');
  if (res.error) return toast(res.error.length > 60 ? 'Calendar access denied' : res.error);
  let n = 0;
  for (const ev of res.events) {
    if (S.tasks.some(t => t.uid === ev.uid && t.due === ev.date)) continue;
    S.tasks.push(mk(ev.title, 'calendar', ev.date, { uid: ev.uid, time: ev.time }));
    n++;
  }
  if (n && !S.cats.includes('calendar')) S.cats.push('calendar');
  save(); render();
  toast(n ? `Imported ${n} event${n > 1 ? 's' : ''}` : 'Calendar is up to date');
});

render();
