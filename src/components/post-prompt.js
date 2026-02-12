export function renderPostPrompt(container, payload) {
  const pp = payload.postPromptData;
  if (!pp || (!pp.raw && !pp.substituted && (!pp.parsed || pp.parsed.length === 0))) {
    container.innerHTML = '<div class="post-prompt"><p style="color:var(--text-muted)">No post-prompt data available</p></div>';
    return;
  }

  const tabs = [];
  if (pp.raw) tabs.push({ id: 'raw', label: 'Raw' });
  if (pp.substituted) tabs.push({ id: 'substituted', label: 'Substituted' });
  if (pp.parsed && pp.parsed.length > 0) tabs.push({ id: 'parsed', label: 'Parsed' });

  if (tabs.length === 0) {
    container.innerHTML = '<div class="post-prompt"><p style="color:var(--text-muted)">No post-prompt data available</p></div>';
    return;
  }

  const tabsHtml = tabs.map((t, i) =>
    `<button class="post-prompt__tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`
  ).join('');

  const getContent = (tabId) => {
    if (tabId === 'parsed') {
      return JSON.stringify(pp.parsed, null, 2);
    }
    return pp[tabId] || '';
  };

  container.innerHTML = `
    <div class="post-prompt">
      <div class="post-prompt__tabs">${tabsHtml}</div>
      <div class="post-prompt__content" id="pp-content">${escapeHtml(getContent(tabs[0].id))}</div>
    </div>
  `;

  container.querySelectorAll('.post-prompt__tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.post-prompt__tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('pp-content').textContent = getContent(btn.dataset.tab);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
