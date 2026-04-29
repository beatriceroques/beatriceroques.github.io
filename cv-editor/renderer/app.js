// ============================================================
// State + persistence
// ============================================================

let state = null;
let photoDataUrl = null;
let saveTimer = null;
const previewFrame = document.getElementById('preview-frame');
const editor = document.getElementById('editor');
const saveStatus = document.getElementById('save-status');

function setStatus(text, kind) {
  saveStatus.textContent = text || '';
  saveStatus.style.color = kind === 'error' ? '#ffb3b3' : '';
}

async function init() {
  state = await window.cvApi.getAll();
  await refreshPhoto();
  renderEditor();
  renderPreview();
}

async function refreshPhoto() {
  photoDataUrl = state.cv.photo_path
    ? await window.cvApi.photoDataUrl(state.cv.photo_path)
    : null;
}

function scheduleSave() {
  renderPreview();
  clearTimeout(saveTimer);
  setStatus('Modifications…');
  saveTimer = setTimeout(async () => {
    try {
      // Persist only — do NOT replace local state with the returned object,
      // otherwise input closures would point to stale references.
      await window.cvApi.save(state);
      setStatus('Enregistré ✓');
      setTimeout(() => setStatus(''), 1500);
    } catch (err) {
      setStatus('Erreur : ' + err.message, 'error');
    }
  }, 400);
}

// ============================================================
// Helpers
// ============================================================

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function')
      node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// Convert plain text (with \n and \n\n) into HTML, escaping it.
// "\n\n" → paragraph break (caller decides), "\n" → <br/>
function textToHtmlLines(text) {
  return escapeHtml(text).replace(/\n/g, '<br/>');
}

function moveItem(arr, idx, delta) {
  const j = idx + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
}

// ============================================================
// Editor UI
// ============================================================

function renderEditor() {
  editor.innerHTML = '';
  editor.appendChild(sectionHeader());
  editor.appendChild(sectionPhoto());
  editor.appendChild(sectionProfile());
  editor.appendChild(sectionContact());
  editor.appendChild(sectionSkills());
  editor.appendChild(sectionLanguages());
  editor.appendChild(sectionExperiences());
  editor.appendChild(sectionEducations());
  editor.appendChild(sectionInterests());
}

function field(label, input) {
  return el('div', { class: 'field' }, [el('label', {}, label), input]);
}

function textInput(value, onChange, placeholder = '') {
  const i = el('input', { type: 'text', placeholder, value: value ?? '' });
  i.addEventListener('input', () => onChange(i.value));
  return i;
}

function numberInput(value, onChange, min = 0, max = 100) {
  const i = el('input', {
    type: 'number',
    min,
    max,
    value: value ?? 0,
  });
  i.addEventListener('input', () => onChange(parseInt(i.value, 10) || 0));
  return i;
}

function textarea(value, onChange, rows = 3) {
  const t = el('textarea', { rows });
  t.value = value ?? '';
  t.addEventListener('input', () => onChange(t.value));
  return t;
}

function listItem(idx, listLength, onUp, onDown, onDelete, children) {
  return el('div', { class: 'list-item' }, [
    el('div', { class: 'list-item-header' }, [
      el(
        'button',
        {
          type: 'button',
          title: 'Monter',
          onclick: onUp,
          ...(idx === 0 ? { disabled: 'true' } : {}),
        },
        '↑'
      ),
      el(
        'button',
        {
          type: 'button',
          title: 'Descendre',
          onclick: onDown,
          ...(idx === listLength - 1 ? { disabled: 'true' } : {}),
        },
        '↓'
      ),
      el(
        'button',
        { type: 'button', class: 'danger', title: 'Supprimer', onclick: onDelete },
        '✕'
      ),
    ]),
    ...[].concat(children),
  ]);
}

function addButton(label, onClick) {
  return el(
    'button',
    { type: 'button', class: 'add-btn', onclick: onClick },
    label
  );
}

function sectionHeader() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'En-tête'));
  wrap.appendChild(
    field(
      'Nom',
      textInput(state.cv.name, (v) => {
        state.cv.name = v;
        scheduleSave();
      })
    )
  );
  wrap.appendChild(
    field(
      'Sous-titres (une ligne = un sous-titre supplémentaire)',
      textarea(
        state.cv.title,
        (v) => {
          state.cv.title = v;
          scheduleSave();
        },
        2
      )
    )
  );
  return wrap;
}

function sectionPhoto() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Photo'));
  const thumb = el('div', { class: 'photo-thumb' });
  if (photoDataUrl) thumb.style.backgroundImage = `url("${photoDataUrl}")`;

  const meta = el(
    'div',
    { class: 'photo-meta' },
    state.cv.photo_path || '(aucune photo)'
  );

  const pickBtn = el(
    'button',
    {
      type: 'button',
      class: 'ghost',
      onclick: async () => {
        const picked = await window.cvApi.pickPhoto();
        if (!picked) return;
        state.cv.photo_path = picked;
        await refreshPhoto();
        renderEditor();
        scheduleSave();
      },
    },
    'Choisir une photo…'
  );

  wrap.appendChild(
    el('div', { class: 'photo-block' }, [
      thumb,
      el('div', {}, [meta, el('div', { style: { marginTop: '6px' } }, [pickBtn])]),
    ])
  );

  const showCb = el('input', { type: 'checkbox' });
  showCb.checked = !!state.cv.show_photo;
  showCb.addEventListener('change', () => {
    state.cv.show_photo = showCb.checked ? 1 : 0;
    scheduleSave();
  });
  wrap.appendChild(
    el('label', {}, [showCb, document.createTextNode(' Afficher la photo')])
  );

  return wrap;
}

function sectionProfile() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Profil professionnel'));
  wrap.appendChild(
    textarea(
      state.cv.profile,
      (v) => {
        state.cv.profile = v;
        scheduleSave();
      },
      5
    )
  );
  return wrap;
}

function sectionContact() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Coordonnées'));
  state.contact_lines.forEach((row, idx) => {
    wrap.appendChild(
      listItem(
        idx,
        state.contact_lines.length,
        () => {
          moveItem(state.contact_lines, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.contact_lines, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.contact_lines.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          field(
            'Texte (utilisez Entrée pour un saut de ligne)',
            textarea(
              row.text,
              (v) => {
                row.text = v;
                scheduleSave();
              },
              2
            )
          ),
          field(
            'Lien (optionnel — ex. mailto:..., tel:...)',
            textInput(row.href, (v) => {
              row.href = v;
              scheduleSave();
            })
          ),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter une coordonnée', () => {
      state.contact_lines.push({ text: '', href: '' });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

function sectionSkills() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Compétences'));
  state.skills.forEach((row, idx) => {
    wrap.appendChild(
      listItem(
        idx,
        state.skills.length,
        () => {
          moveItem(state.skills, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.skills, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.skills.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          textarea(
            row.text,
            (v) => {
              row.text = v;
              scheduleSave();
            },
            2
          ),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter une compétence', () => {
      state.skills.push({ text: '' });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

function sectionLanguages() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Langues'));
  state.languages.forEach((row, idx) => {
    const nameI = textInput(row.name, (v) => {
      row.name = v;
      scheduleSave();
    });
    const levelI = textInput(row.level_label, (v) => {
      row.level_label = v;
      scheduleSave();
    });
    const pctI = numberInput(
      row.level_pct,
      (v) => {
        row.level_pct = Math.max(0, Math.min(100, v));
        scheduleSave();
      },
      0,
      100
    );
    wrap.appendChild(
      listItem(
        idx,
        state.languages.length,
        () => {
          moveItem(state.languages, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.languages, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.languages.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          el('div', { class: 'row-3' }, [
            field('Langue', nameI),
            field('Niveau', levelI),
            field('% (0-100)', pctI),
          ]),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter une langue', () => {
      state.languages.push({ name: '', level_label: '', level_pct: 50 });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

function sectionExperiences() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Expériences'));
  state.experiences.forEach((row, idx) => {
    wrap.appendChild(
      listItem(
        idx,
        state.experiences.length,
        () => {
          moveItem(state.experiences, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.experiences, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.experiences.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          field(
            'Période',
            textInput(row.date_range, (v) => {
              row.date_range = v;
              scheduleSave();
            })
          ),
          field(
            'Poste (Entrée = nouvelle ligne, ligne vide = nouveau bloc)',
            textarea(
              row.role,
              (v) => {
                row.role = v;
                scheduleSave();
              },
              3
            )
          ),
          field(
            'Organisme',
            textInput(row.org, (v) => {
              row.org = v;
              scheduleSave();
            })
          ),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter une expérience', () => {
      state.experiences.push({ date_range: '', role: '', org: '' });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

function sectionEducations() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, 'Formation'));
  state.educations.forEach((row, idx) => {
    wrap.appendChild(
      listItem(
        idx,
        state.educations.length,
        () => {
          moveItem(state.educations, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.educations, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.educations.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          field(
            'Période',
            textInput(row.date_range, (v) => {
              row.date_range = v;
              scheduleSave();
            })
          ),
          field(
            'Diplôme',
            textarea(
              row.degree,
              (v) => {
                row.degree = v;
                scheduleSave();
              },
              2
            )
          ),
          field(
            'École',
            textInput(row.school, (v) => {
              row.school = v;
              scheduleSave();
            })
          ),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter une formation', () => {
      state.educations.push({ date_range: '', degree: '', school: '' });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

function sectionInterests() {
  const wrap = el('div', { class: 'section' }, el('h2', {}, "Centres d'intérêt"));
  state.interests.forEach((row, idx) => {
    wrap.appendChild(
      listItem(
        idx,
        state.interests.length,
        () => {
          moveItem(state.interests, idx, -1);
          renderEditor();
          scheduleSave();
        },
        () => {
          moveItem(state.interests, idx, 1);
          renderEditor();
          scheduleSave();
        },
        () => {
          state.interests.splice(idx, 1);
          renderEditor();
          scheduleSave();
        },
        [
          textInput(row.text, (v) => {
            row.text = v;
            scheduleSave();
          }),
        ]
      )
    );
  });
  wrap.appendChild(
    addButton('+ Ajouter un centre d’intérêt', () => {
      state.interests.push({ text: '' });
      renderEditor();
      scheduleSave();
    })
  );
  return wrap;
}

// ============================================================
// HTML render (CV output)
// ============================================================

function renderRoleHtml(role) {
  // Split on blank line → multiple <div class="role">; \n inside a block → <br/>
  return role
    .split(/\n{2,}/)
    .map((block) => `<div class="role">${textToHtmlLines(block)}</div>`)
    .join('');
}

function buildContactLine(line) {
  const inner = textToHtmlLines(line.text);
  if (line.href && line.href.trim()) {
    const cls = line.href.startsWith('mailto:')
      ? 'link-mail'
      : line.href.startsWith('tel:')
        ? 'link-tel'
        : 'link-url';
    return `<div class="contact-line"><a class="${cls}" href="${escapeAttr(line.href)}">${inner}</a></div>`;
  }
  return `<div class="contact-line">${inner}</div>`;
}

function buildCvHtml() {
  const photoCss =
    state.cv.show_photo && photoDataUrl ? `url('${photoDataUrl}')` : null;

  const photoBlock = photoCss
    ? `<div class="photo-wrapper"><div class="photo" style="background-image: ${photoCss};"></div></div>`
    : '';

  const contactHtml = state.contact_lines.map(buildContactLine).join('\n          ');

  const skillsHtml = state.skills
    .map((s) => `<li>${textToHtmlLines(s.text)}</li>`)
    .join('\n            ');

  const languagesHtml = state.languages
    .map(
      (l) => `<div class="lang-item">
            <div class="lang-name"><span>${escapeHtml(l.name)}</span><span>${escapeHtml(l.level_label)}</span></div>
            <div class="lang-bar"><div class="fill" style="width: ${Math.max(0, Math.min(100, l.level_pct))}%"></div></div>
          </div>`
    )
    .join('\n          ');

  const experiencesHtml = state.experiences
    .map(
      (x) => `<div class="entry">
            <span class="date">${escapeHtml(x.date_range)}</span>
            ${renderRoleHtml(x.role)}
            <div class="org">${textToHtmlLines(x.org)}</div>
          </div>`
    )
    .join('\n\n          ');

  const educationsHtml = state.educations
    .map(
      (x) => `<div class="entry">
            <span class="date">${escapeHtml(x.date_range)}</span>
            <div class="role">${textToHtmlLines(x.degree)}</div>
            <div class="org">${textToHtmlLines(x.school)}</div>
          </div>`
    )
    .join('\n\n          ');

  const interestsHtml = state.interests
    .map((i) => `<span>${escapeHtml(i.text)}</span>`)
    .join('\n            ');

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>CV - ${escapeHtml(state.cv.name)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      @page { size: A4; margin: 0; }
      html, body {
        font-family: "Helvetica Neue", Arial, sans-serif;
        background: #e5e5e5; color: #333; font-size: 10pt; line-height: 1.45;
      }
      .page {
        width: 210mm; height: 297mm; margin: 20px auto; background: #fff;
        display: grid; grid-template-columns: 75mm 1fr;
        box-shadow: 0 4px 18px rgba(0,0,0,.2); overflow: hidden;
      }
      .sidebar { background: #2a5978; color: #fff; padding: 0 14mm 14mm; }
      .photo-wrapper { display: flex; justify-content: center; padding-top: 15mm; margin-bottom: 7.5mm; }
      .photo {
        width: 38mm; height: 38mm; border-radius: 50%;
        border: 3px solid #fff; background-color: #c9d8d8;
        background-position: center; background-size: cover; background-repeat: no-repeat;
      }
      .sidebar h2 {
        font-size: 11pt; letter-spacing: 1px; text-transform: uppercase;
        border-bottom: 1px solid rgba(255,255,255,.55);
        padding-bottom: 4px; margin-bottom: 8px;
      }
      .sidebar-section { margin-bottom: 9mm; }
      .sidebar-section p, .sidebar-section li { font-size: 8.8pt; line-height: 1.45; }
      .sidebar ul { list-style: none; }
      .sidebar ul li { position: relative; padding-left: 10px; margin-bottom: 15px; }
      .sidebar ul li::before { content: "•"; position: absolute; left: 0; top: -1px; }
      .contact-line {
        display: flex; align-items: flex-start; gap: 8px;
        margin-bottom: 5px; font-size: 8.8pt;
      }
      .lang-item { margin-bottom: 6px; }
      .lang-name { display: flex; justify-content: space-between; font-size: 8.8pt; margin-bottom: 3px; }
      .lang-bar { height: 4px; background: rgba(255,255,255,.3); border-radius: 2px; overflow: hidden; }
      .lang-bar .fill { height: 100%; background: #fff; }
      .main { padding: 0 14mm 14mm; }
      .header { padding: 12mm 0 8mm; }
      .header h1 { color: #2a5978; font-size: 22pt; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
      .header .title { font-size: 11pt; color: #555; letter-spacing: 4px; text-transform: uppercase; margin-top: 2px; }
      .main section { margin-bottom: 8mm; }
      .main h2 {
        color: #2a5978; font-size: 12pt; letter-spacing: 1.5px;
        text-transform: uppercase; margin-bottom: 2mm;
        padding-bottom: 3px; border-bottom: 1px solid #2a5978;
      }
      .profile p { text-align: justify; font-size: 9.5pt; }
      .entry { margin-bottom: 5mm; }
      .entry .role { font-weight: 700; color: #222; font-size: 10pt; }
      .entry .date { float: right; color: #666; font-size: 9pt; font-weight: 600; }
      .entry .org { font-style: italic; color: #555; font-size: 9.3pt; margin-top: 1px; }
      .entry .desc { font-size: 9.2pt; color: #444; margin-top: 2px; }
      .interests { display: flex; flex-wrap: wrap; gap: 8px 18px; }
      .interests span { position: relative; padding-left: 12px; font-size: 9.5pt; }
      .interests span::before { content: "•"; position: absolute; left: 0; color: #2a5978; font-weight: 700; }
      @media print { body { background: #fff; } .page { margin: 0; box-shadow: none; } }
      .link-tel, .link-mail, .link-url { color: #fff; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="page">
      <aside class="sidebar">
        ${photoBlock}
        <div class="sidebar-section">
          <h2>Coordonnées</h2>
          ${contactHtml}
        </div>
        <div class="sidebar-section">
          <h2>Compétences</h2>
          <ul>
            ${skillsHtml}
          </ul>
        </div>
        <div class="sidebar-section">
          <h2>Langues</h2>
          ${languagesHtml}
        </div>
      </aside>
      <main class="main">
        <header class="header">
          <h1>${escapeHtml(state.cv.name)}</h1>
          ${state.cv.title
            .split('\n')
            .filter((l) => l.trim() !== '')
            .map((l) => `<div class="title">${escapeHtml(l)}</div>`)
            .join('\n          ')}
        </header>
        <section class="profile">
          <h2>Profil professionnel</h2>
          <p>${textToHtmlLines(state.cv.profile)}</p>
        </section>
        <section>
          <h2>Expérience</h2>
          ${experiencesHtml}
        </section>
        <section>
          <h2>Formation</h2>
          ${educationsHtml}
        </section>
        <section>
          <h2>Centres d'intérêt</h2>
          <div class="interests">
            ${interestsHtml}
          </div>
        </section>
      </main>
    </div>
  </body>
</html>`;
}

function renderPreview() {
  const html = buildCvHtml();
  previewFrame.srcdoc = html;
}

// ============================================================
// Export buttons
// ============================================================

function flashStatus(message, kind, ms = 2500) {
  setStatus(message, kind);
  setTimeout(() => setStatus(''), ms);
}

function suggestedPdfName() {
  const base = `CV - ${state.cv.name || 'CV'}`;
  return base.replace(/[\\/:*?"<>|]/g, ' ').trim() + '.pdf';
}

async function onExportPdf() {
  try {
    setStatus('Export PDF…');
    const html = buildCvHtml(); // embed photo as data URL
    const target = await window.cvApi.exportPdf(html, suggestedPdfName());
    if (!target) {
      setStatus('');
      return;
    }
    flashStatus('PDF enregistré ✓');
  } catch (err) {
    flashStatus('Erreur PDF : ' + err.message, 'error', 5000);
  }
}

document.getElementById('btn-export-pdf').addEventListener('click', onExportPdf);

// ============================================================
// Boot
// ============================================================

init()
  .then(() => {
    document.getElementById('btn-export-pdf').disabled = false;
  })
  .catch((err) => {
    document.body.innerHTML =
      '<pre style="padding:20px;color:#900">' + escapeHtml(err.stack) + '</pre>';
  });
