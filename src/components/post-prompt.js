export function renderPostPrompt(container, payload) {
  const pp = payload.postPromptData;
  if (!pp || (!pp.raw && !pp.substituted && (!pp.parsed || pp.parsed.length === 0))) {
    container.innerHTML = '<div class="p-6"><p class="text-sm opacity-50">No post-prompt data available</p></div>';
    return;
  }

  const tabs = [];
  if (pp.raw) tabs.push({ id: 'raw', label: 'Raw' });
  if (pp.substituted) tabs.push({ id: 'substituted', label: 'Substituted' });
  if (pp.parsed && pp.parsed.length > 0) tabs.push({ id: 'parsed', label: 'Parsed' });

  if (tabs.length === 0) {
    container.innerHTML = '<div class="p-6"><p class="text-sm opacity-50">No post-prompt data available</p></div>';
    return;
  }

  const tabsHtml = tabs.map((t, i) =>
    `<a role="tab" class="tab ${i === 0 ? 'tab-active' : ''}" data-tab="${t.id}">${t.label}</a>`
  ).join('');

  const getContent = (tabId) => {
    if (tabId === 'parsed') {
      return JSON.stringify(pp.parsed, null, 2);
    }
    return pp[tabId] || '';
  };

  container.innerHTML = `
    <div class="p-6 max-w-5xl mx-auto">
      <div role="tablist" class="tabs tabs-box mb-4">${tabsHtml}</div>
      <div class="mockup-code bg-base-300">
        <pre class="px-6 overflow-x-auto"><code id="pp-content">${escapeHtml(getContent(tabs[0].id))}</code></pre>
      </div>
    </div>
  `;

  container.querySelectorAll('[role="tab"]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[role="tab"]').forEach(b => b.classList.remove('tab-active'));
      btn.classList.add('tab-active');
      document.getElementById('pp-content').textContent = getContent(btn.dataset.tab);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
