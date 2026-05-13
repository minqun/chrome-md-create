const CACHE_KEY = 'md_editor_cache';

document.addEventListener('DOMContentLoaded', () => {
  const mde = new EasyMDE({
    element: document.getElementById('mde-editor'),
    spellChecker: false,
    autofocus: true,
    placeholder: '在此输入 Markdown 内容...',
    toolbar: [
      "bold", "italic", "heading", "|",
      "quote", "unordered-list", "ordered-list", "|",
      "link", "image", "table", "code", "|",
      "preview", "side-by-side", "fullscreen", "|",
      "guide"
    ],
    shortcuts: {
      drawTable: "Cmd-Alt-T",
      toggleHeadingBigger: "Cmd-H",
      toggleHeadingSmaller: "Cmd-Shift-H",
    }
  });

  // Load from cache
  chrome.storage.local.get([CACHE_KEY], (result) => {
    if (result[CACHE_KEY]) {
      mde.value(result[CACHE_KEY]);
    }
  });

  // Auto-save to cache
  mde.codemirror.on('change', () => {
    const content = mde.value();
    chrome.storage.local.set({ [CACHE_KEY]: content });
  });

  // Import
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
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    fileInput.value = '';
  });

  // Export
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

  // Copy
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

  // Clear Cache
  const btnClear = document.getElementById('btn-clear');
  btnClear.addEventListener('click', () => {
    if (confirm('确定要清空缓存并重置编辑器吗？')) {
      mde.value('');
      chrome.storage.local.remove([CACHE_KEY]);
    }
  });
});
