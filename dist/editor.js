const CACHE_KEY = 'md_editor_cache';
const SETTINGS_KEY = 'md_editor_preview_settings';
const DEFAULT_SETTINGS = {
  theme: 'light',
  fontSize: 16,
  lineHeight: '1.8',
  width: '860px',
  splitRatio: 50,
};

document.addEventListener('DOMContentLoaded', () => {
  const workspace = document.querySelector('.workspace');
  const previewBody = document.getElementById('preview-body');
  const settingsPanel = document.getElementById('settings-panel');
  const splitter = document.getElementById('splitter');
  const themeSelect = document.getElementById('preview-theme');
  const fontSizeInput = document.getElementById('preview-font-size');
  const fontSizeValue = document.getElementById('font-size-value');
  const lineHeightSelect = document.getElementById('preview-line-height');
  const widthSelect = document.getElementById('preview-width');
  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  let currentSettings = { ...DEFAULT_SETTINGS };
  let isSyncingFromEditor = false;
  let isSyncingFromPreview = false;
  let contentSaveTimer = null;
  let settingsSaveTimer = null;
  let renderTimer = null;
  let suppressAutoSave = false;
  const mde = new EasyMDE({
    element: document.getElementById('mde-editor'),
    spellChecker: false,
    autofocus: true,
    placeholder: '在此输入 Markdown 内容...',
    toolbar: [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", "table", "code", "|",
      "guide"
    ],
    shortcuts: {
      drawTable: "Cmd-Alt-T",
      toggleHeadingBigger: "Cmd-H",
      toggleHeadingSmaller: "Cmd-Shift-H",
    }
  });
  const editorScroller = mde.codemirror.getScrollerElement();

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function debounce(timerName, callback, delay) {
    if (timerName === 'contentSave') {
      window.clearTimeout(contentSaveTimer);
      contentSaveTimer = window.setTimeout(callback, delay);
      return;
    }

    if (timerName === 'settingsSave') {
      window.clearTimeout(settingsSaveTimer);
      settingsSaveTimer = window.setTimeout(callback, delay);
      return;
    }

    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(callback, delay);
  }

  function getScrollRatio(element) {
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) {
      return 0;
    }

    return element.scrollTop / maxScroll;
  }

  function setScrollRatio(element, ratio) {
    const maxScroll = element.scrollHeight - element.clientHeight;
    element.scrollTop = maxScroll <= 0 ? 0 : maxScroll * ratio;
  }

  function renderPreview() {
    const previousRatio = getScrollRatio(previewBody);
    const content = mde.value();
    const html = mde.options.previewRender(content);
    previewBody.innerHTML = `<div class="preview-body-inner">${html}</div>`;
    setScrollRatio(previewBody, previousRatio);
  }

  function applySettings(settings) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    currentSettings = merged;
    document.body.classList.remove('theme-light', 'theme-dark', 'theme-sepia');
    document.body.classList.add(`theme-${merged.theme}`);
    document.body.style.setProperty('--preview-font-size', `${merged.fontSize}px`);
    document.body.style.setProperty('--preview-line-height', merged.lineHeight);
    document.body.style.setProperty('--preview-max-width', merged.width);
    document.body.style.setProperty('--editor-pane-size', `${merged.splitRatio}%`);

    themeSelect.value = merged.theme;
    fontSizeInput.value = String(merged.fontSize);
    fontSizeValue.textContent = `${merged.fontSize}px`;
    lineHeightSelect.value = merged.lineHeight;
    widthSelect.value = merged.width;
  }

  function persistSettings() {
    chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
  }

  function saveSettings(partialSettings = {}) {
    const settings = {
      ...currentSettings,
      theme: themeSelect.value,
      fontSize: Number(fontSizeInput.value),
      lineHeight: lineHeightSelect.value,
      width: widthSelect.value,
      ...partialSettings,
    };

    applySettings(settings);
    debounce('settingsSave', persistSettings, 120);
  }

  function syncPreviewToEditor() {
    if (isSyncingFromPreview) {
      return;
    }

    isSyncingFromEditor = true;
    window.requestAnimationFrame(() => {
      setScrollRatio(previewBody, getScrollRatio(editorScroller));
      isSyncingFromEditor = false;
    });
  }

  function syncEditorToPreview() {
    if (isSyncingFromEditor) {
      return;
    }

    isSyncingFromPreview = true;
    window.requestAnimationFrame(() => {
      const scrollInfo = mde.codemirror.getScrollInfo();
      const maxScroll = scrollInfo.height - scrollInfo.clientHeight;
      const targetTop = maxScroll <= 0 ? 0 : maxScroll * getScrollRatio(previewBody);
      mde.codemirror.scrollTo(null, targetTop);
      isSyncingFromPreview = false;
    });
  }

  function handleSplitterPointerDown(event) {
    if (window.innerWidth <= 960) {
      return;
    }

    event.preventDefault();
    document.body.classList.add('is-resizing');

    function handlePointerMove(moveEvent) {
      const bounds = workspace.getBoundingClientRect();
      const nextRatio = clamp(((moveEvent.clientX - bounds.left) / bounds.width) * 100, 25, 75);
      saveSettings({ splitRatio: Math.round(nextRatio) });
      mde.codemirror.refresh();
    }

    function handlePointerUp() {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  chrome.storage.local.get([CACHE_KEY, SETTINGS_KEY], (result) => {
    applySettings(result[SETTINGS_KEY] || DEFAULT_SETTINGS);

    if (result[CACHE_KEY]) {
      mde.value(result[CACHE_KEY]);
    }

    renderPreview();
  });

  mde.codemirror.on('change', () => {
    const content = mde.value();
    if (suppressAutoSave) {
      suppressAutoSave = false;
      return;
    }

    debounce('contentSave', () => {
      chrome.storage.local.set({ [CACHE_KEY]: content });
    }, 180);
    debounce('render', () => {
      renderPreview();
      syncPreviewToEditor();
    }, 120);
  });

  btnToggleSettings.addEventListener('click', () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  themeSelect.addEventListener('change', saveSettings);
  fontSizeInput.addEventListener('input', saveSettings);
  lineHeightSelect.addEventListener('change', saveSettings);
  widthSelect.addEventListener('change', saveSettings);
  splitter.addEventListener('pointerdown', handleSplitterPointerDown);
  editorScroller.addEventListener('scroll', syncPreviewToEditor, { passive: true });
  previewBody.addEventListener('scroll', syncEditorToPreview, { passive: true });
  window.addEventListener('resize', () => {
    mde.codemirror.refresh();
  });

  const btnImport = document.getElementById('btn-import');
  const fileInput = document.getElementById('file-input');
  btnImport.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      mde.value(content);
      chrome.storage.local.set({ [CACHE_KEY]: content });
      renderPreview();
      syncPreviewToEditor();
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  const btnExport = document.getElementById('btn-export');
  btnExport.addEventListener('click', () => {
    const content = mde.value();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  const btnCopy = document.getElementById('btn-copy');
  btnCopy.addEventListener('click', () => {
    const content = mde.value();
    navigator.clipboard.writeText(content).then(() => {
      alert('内容已复制到剪贴板！');
    }).catch((error) => {
      console.error('Failed to copy:', error);
      alert('复制失败，请重试。');
    });
  });

  const btnClear = document.getElementById('btn-clear');
  btnClear.addEventListener('click', () => {
    if (confirm('确定要清空缓存并重置编辑器吗？')) {
      suppressAutoSave = true;
      mde.value('');
      chrome.storage.local.remove([CACHE_KEY, SETTINGS_KEY]);
      applySettings(DEFAULT_SETTINGS);
      renderPreview();
      mde.codemirror.scrollTo(null, 0);
      previewBody.scrollTop = 0;
    }
  });
});
