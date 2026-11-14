const roster = window.NTSD_ROSTER;
const byId = new Map(roster.map(group => [group.id, group]));
const categories = {all: '全部', common: '通用', regular: '常规', secret: '秘密', hidden: '隐藏', custom: '自定义'};
const defaultKeys = {up: 'W', left: 'A', down: 'S', right: 'D', attack: 'J', jump: 'K', defend: 'L'};
const actions = {up: '上', left: '左', down: '下', right: '右', attack: '攻击', jump: '跳跃', defend: '防御'};
const specialKeys = {ArrowUp: '↑', ArrowLeft: '←', ArrowDown: '↓', ArrowRight: '→', ' ': '空格', Backspace: '退格', Delete: 'Delete', Enter: 'Enter', Shift: 'Shift', Control: 'Ctrl', Alt: 'Alt', Meta: '⌘'};
const sourceKeys = {A: 'attack', J: 'jump', D: 'defend', '^': 'up', v: 'down'};
const states = {DashL: '冲刺跳跃落地时', Dash: '跑动后起跳', Ae: '空中', Air: '在空中', R: '翻滚／瞬身中', H: '受击时', K: '被击飞时', B: '格挡后', G: '倒地时', catch: '抓住对手后', Cs2: '咒印二状态'};
const storageKey = 'ntsd-2833-bindings';
const $ = selector => document.querySelector(selector);
const search = $('#search');
const dialog = $('#key-dialog');
const picker = $('#fighter-picker');
const manualKey = $('#manual-key');
const searchToken = /(?<![a-z0-9])(?:DashL|Dash|Sage Mode|Air|Cs2|CS2|Ae|\(hold\)|\(Hold\)|catch|[AJDGHKBRv^><+\/()])+(?![a-z0-9])/gi;
const commandTokens = /DashL|Dash|Ae|Air|catch|Sage Mode|Cs2|\(hold\)|\(Hold\)|>\/\^\/v|\.\.\.|[AJDGHKBRv^<>]|./g;
const counts = roster.reduce((total, group) => total + group.moves.length, 0);
const initial = 'uzumaki-naruto';

let keys = {...defaultKeys};
try {
  const stored = JSON.parse(localStorage.getItem(storageKey));
  if (stored) {
    for (const action of Object.keys(actions)) {
      if (typeof stored[action] === 'string' && stored[action].length > 0 && stored[action].length < 20) {
        keys[action] = stored[action];
      }
    }
  }
} catch {}
let selected = byId.has(location.hash.slice(1)) ? location.hash.slice(1) : initial;
let category = 'all';
let query = '';
let listening = '';

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function keyCap(label) {
  return make('kbd', 'key-cap', label);
}

function appendCommand(target, code) {
  for (const token of code.match(commandTokens) || []) {
    if (Object.hasOwn(sourceKeys, token)) {
      target.append(keyCap(keys[sourceKeys[token]]));
    } else if (token === '>') {
      target.append(keyCap(keys.left + ' / ' + keys.right));
    } else if (token === '<') {
      target.append(make('span', 'state', '反方向'));
    } else if (token === '>/^/v') {
      target.append(make('span', 'state', '任意方向'));
    } else if (Object.hasOwn(states, token)) {
      target.append(make('span', 'state', states[token]));
    } else if (token === 'Sage Mode') {
      target.append(make('span', 'state', '仙人模式'));
    } else if (token.toLowerCase() === '(hold)') {
      target.append(make('span', 'state', '长按下一键'));
    } else if (token === '+') {
      target.append(make('span', 'join', '+'));
    } else if (token === '/') {
      target.append(make('span', 'join', '或'));
    } else if (token !== ' ') {
      target.append(make('span', 'join', token));
    }
  }
}

function appendNote(target, text) {
  let last = 0;
  for (const match of text.matchAll(searchToken)) {
    if (!/Dash|Air|Sage Mode|Ae|[AJDGHKBRv^><]/.test(match[0])) continue;
    if (/^[ ()+/]+$/.test(match[0])) continue;
    target.append(text.slice(last, match.index));
    const inline = make('span', 'inline-command');
    appendCommand(inline, match[0]);
    target.append(inline);
    last = match.index + match[0].length;
  }
  target.append(text.slice(last));
}

function effectiveMoves(group) {
  if (!group.inherit) return group.moves;
  const base = byId.get(group.inherit);
  const overridden = new Set([...group.moves.map(move => move.code), ...(group.blocked || [])]);
  return [...group.moves, ...effectiveMoves(base)
    .filter(move => !overridden.has(move.code) && !overridden.has(move.starter) && !/^\?+$/.test(move.code))
    .map(move => ({...move, inherited: move.inherited || base.name}))];
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, '').replace(/[·・]/g, '');
}

function mappedText(code) {
  const span = make('span');
  appendCommand(span, code);
  return span.textContent;
}

function matches(group, move, terms) {
  const names = [group.name, group.en, byId.get(group.parent)?.name, byId.get(group.parent)?.en];
  const haystack = normalize([...names, move.name, move.en, move.code, mappedText(move.code),
    move.parent, move.starter, ...(move.notes || []), ...(move.values || [])].filter(Boolean).join(' '));
  return terms.every(term => haystack.includes(term));
}

function movesMatching(group) {
  const moves = effectiveMoves(group);
  return query ? moves.filter(move => matches(group, move, query.toLowerCase().split(/\s+/).map(normalize))) : moves;
}

function updateKeys() {
  const strip = $('#key-summary');
  strip.replaceChildren();
  for (const [action, label] of Object.entries(actions)) {
    const item = make('span', 'key-item');
    item.append(keyCap(keys[action]), make('span', '', label));
    strip.append(item);
  }
}

function updateKeyFields() {
  const fields = $('#key-fields');
  fields.replaceChildren();
  for (const [action, label] of Object.entries(actions)) {
    const button = make('button', 'key-field');
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('aria-label', `${label}，当前键位 ${keys[action]}`);
    button.append(make('span', '', label), keyCap(keys[action]));
    fields.append(button);
  }
}

function saveKeys() {
  try { localStorage.setItem(storageKey, JSON.stringify(keys)); } catch {}
  updateKeys();
  updateKeyFields();
  render();
}

function setListening(action) {
  listening = action;
  for (const button of document.querySelectorAll('.key-field')) {
    button.classList.toggle('listening', button.dataset.action === action);
    button.setAttribute('aria-pressed', String(button.dataset.action === action));
  }
  $('#manual-key-label').hidden = !action;
  if (action) manualKey.value = '';
  $('#key-message').textContent = action ? `请按下「${actions[action]}」的新键` : '';
}

function selectGroup(id, scroll = false) {
  selected = id;
  search.value = '';
  query = '';
  if (category !== 'all' && byId.get(id).type !== category) category = 'all';
  history.replaceState(null, '', '#' + id);
  render();
  if (scroll) $('#moves-pane').scrollIntoView({block: 'start'});
}

function renderRoster(groups) {
  $('#filters').replaceChildren(...Object.entries(categories).map(([id, name]) => {
    const button = make('button', 'filter', name);
    button.type = 'button';
    button.dataset.category = id;
    button.setAttribute('aria-pressed', String(category === id));
    return button;
  }));
  $('#roster-count').textContent = `${groups.length} 项`;
  $('#roster').replaceChildren(...groups.map(([group, moves]) => {
    const link = make('a', `fighter${group.parent ? ' form' : ''}`);
    link.href = '#' + group.id;
    if (!query && selected === group.id) link.setAttribute('aria-current', 'true');
    link.append(make('span', '', group.name), make('span', 'fighter-count', moves.length));
    return link;
  }));
  picker.replaceChildren(...groups.map(([group, moves]) => {
    const option = make('option', '', `${group.name}（${moves.length}）`);
    option.value = group.id;
    return option;
  }));
  if (query) picker.prepend(new Option('定位搜索结果', '', true, true));
  else picker.value = selected;
  picker.disabled = groups.length === 0;
}

function showMove(move) {
  const card = make('article', 'move');
  const title = make('h3', '', move.name);
  const command = make('div', 'command');
  const mainColumn = make('div', 'move-info');
  const codeSettings = make('details', 'source');
  codeSettings.append(make('summary', '', '原表符号'));
  const original = make('p');
  if (move.code) original.append(make('code', '', move.code));
  if (move.en) original.append(document.createTextNode((move.code ? ' · ' : '') + move.en));
  codeSettings.append(original);
  if (/^\?+$/.test(move.code)) {
    command.append(make('span', 'state', '原表未公开按法'));
  } else if (move.code) {
    appendCommand(command, move.code);
  }
  const badges = make('div', 'badges');
  if (move.kind === 'combo') badges.append(make('span', 'badge', '连段 / 基础操作'));
  if (move.parent) badges.append(make('span', 'badge', '派生 · ' + move.parent));
  if (move.inherited) badges.append(make('span', 'badge', '沿用 · ' + move.inherited));
  if (badges.childElementCount) mainColumn.append(badges);
  mainColumn.append(title);
  if (move.starter) {
    const entry = make('p', 'starter');
    entry.append('起手 ', make('span', 'inline-command'));
    appendCommand(entry.lastChild, move.starter);
    mainColumn.append(entry);
  }
  for (const text of move.notes || []) {
    const note = make('p', 'move-note');
    appendNote(note, text);
    mainColumn.append(note);
  }
  if (move.values) {
    const values = make('dl', 'values');
    for (const [i, term] of ['消耗 / 条件', '伤害'].entries()) {
      if (!move.values[i] || /^\?+$/.test(move.values[i])) continue;
      const item = make('div');
      item.append(make('dt', '', term), make('dd', '', move.values[i]));
      values.append(item);
    }
    if (values.childElementCount) mainColumn.append(values);
  }
  card.append(mainColumn, make('div', 'move-input'));
  card.lastChild.append(command);
  if (move.code || move.en) card.lastChild.append(codeSettings);
  return card;
}

function showGroup(group, moves) {
  const section = make('section', 'fighter-sheet');
  section.id = 'result-' + group.id;
  const header = make('header', 'sheet-header');
  const titleArea = make('div');
  titleArea.append(make('span', 'sheet-category', categories[group.type]), make('h2', '', group.name));
  if (group.type !== 'common') titleArea.append(make('p', 'fighter-en', group.en));
  header.append(titleArea, make('span', 'sheet-count', `${moves.length} 条`));
  section.append(header);
  const forms = roster.filter(form => form.parent === (group.parent || group.id));
  if (!query && (group.parent || forms.length)) {
    const list = make('nav', 'forms');
    list.setAttribute('aria-label', '该角色的形态');
    for (const form of [byId.get(group.parent || group.id), ...forms]) {
      const link = make('a', '', form.name);
      link.href = '#' + form.id;
      if (form.id === group.id) link.setAttribute('aria-current', 'true');
      list.append(link);
    }
    section.append(list);
  }
  if (group.style) section.append(make('p', 'style-info', group.style));
  for (const text of group.notes) {
    const note = make('p', 'style-info');
    appendNote(note, text);
    section.append(note);
  }
  section.append(...moves.map(showMove));
  return section;
}

function render() {
  const listed = roster.filter(group => category === 'all' || category === group.type)
    .map(group => [group, movesMatching(group)])
    .filter(([, moves]) => !query || moves.length);
  renderRoster(listed);
  const content = $('#content');
  if (query) {
    const total = listed.reduce((sum, [, moves]) => sum + moves.length, 0);
    const heading = make('p', 'results-label', total ? `找到 ${total} 条招式` : '未找到匹配的招式。试试角色名、版本原指令，或选择「全部」。');
    heading.setAttribute('role', 'status');
    content.replaceChildren(heading, ...listed.map(([group, moves]) => showGroup(group, moves)));
  } else {
    const group = byId.get(selected);
    content.replaceChildren(showGroup(group, effectiveMoves(group)));
  }
}

search.addEventListener('input', () => {
  query = search.value.trim();
  render();
});
$('#filters').addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  category = button.dataset.category;
  if (category !== 'all' && byId.get(selected).type !== category) {
    selected = roster.find(group => group.type === category).id;
    history.replaceState(null, '', '#' + selected);
  }
  render();
});
$('#roster').addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (query) $('#result-' + link.hash.slice(1)).scrollIntoView({block: 'start'});
  else selectGroup(link.hash.slice(1), true);
});
$('#content').addEventListener('click', event => {
  const link = event.target.closest('.forms a');
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  selectGroup(link.hash.slice(1));
});
picker.addEventListener('change', () => {
  if (!picker.value) return;
  if (query) $('#result-' + picker.value).scrollIntoView({block: 'start'});
  else selectGroup(picker.value, true);
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (byId.has(id)) selectGroup(id);
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !dialog.open && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    search.focus();
  }
});

$('#edit-keys').addEventListener('click', () => {
  updateKeyFields();
  setListening('');
  dialog.showModal();
});
$('#close-keys').addEventListener('click', () => dialog.close());
$('#done-keys').addEventListener('click', () => dialog.close());
$('#reset-keys').addEventListener('click', () => {
  setListening('');
  keys = {...defaultKeys};
  saveKeys();
  $('#key-message').textContent = '已恢复默认键位。';
});
$('#key-fields').addEventListener('click', event => {
  const field = event.target.closest('.key-field');
  if (field) setListening(field.dataset.action);
});
dialog.addEventListener('close', () => setListening(''));
dialog.addEventListener('keydown', event => {
  if (!listening) return;
  if (event.key === 'Tab' || event.target === manualKey) return;
  event.preventDefault();
  if (event.repeat || ['Unidentified', 'Process', 'Dead'].includes(event.key)) return;
  if (event.key === 'Escape') {
    setListening('');
    return;
  }
  const fromCode = /^(Key|Digit|Numpad)([A-Z0-9])$/.exec(event.code);
  const label = fromCode?.[1] === 'Numpad' ? '小键盘 ' + fromCode[2]
    : fromCode?.[2] || specialKeys[event.key] || event.key.toUpperCase();
  applyKey(label);
});

function applyKey(label) {
  const action = listening;
  if (!action || !label || label.length >= 20) return;
  const conflict = Object.keys(keys).find(key => key !== action && keys[key] === label);
  const previous = keys[action];
  if (conflict) keys[conflict] = previous;
  keys[action] = label;
  setListening('');
  saveKeys();
  $(`.key-field[data-action="${action}"]`).focus();
  $('#key-message').textContent = conflict ? `已交换「${actions[action]}」与「${actions[conflict]}」的键位。`
    : `「${actions[action]}」已设为 ${label}。`;
}

manualKey.append(new Option('选择键位', ''), ...[
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...Object.values(specialKeys),
  ...Array.from({length: 10}, (_, i) => '小键盘 ' + i),
  ',', '.', '/', '[', ']', ';', 'F1', 'F2', 'F3', 'F4',
].map(label => new Option(label, label)));
manualKey.addEventListener('change', () => applyKey(manualKey.value));

$('#site-title').setAttribute('title', `${roster.length - 1} 个角色与形态，${counts} 条出招记录`);
updateKeys();
render();
