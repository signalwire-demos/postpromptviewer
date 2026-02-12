export function renderGlobalData(container, payload) {
  const sections = [];

  // 1. Global Data section
  if (payload.globalData && Object.keys(payload.globalData).length > 0) {
    sections.push({
      title: 'Global Data',
      subtitle: 'Session state at end of call (mutated by SWAIG set_global_data actions)',
      content: JSON.stringify(payload.globalData, null, 2),
    });
  }

  // 2. User Variables section (from SWMLVars.userVariables)
  const userVars = payload.swmlVars?.userVariables;
  if (userVars && Object.keys(userVars).length > 0) {
    sections.push({
      title: 'User Variables',
      subtitle: 'Client-provided context from SDK connection',
      content: JSON.stringify(userVars, null, 2),
    });
  }

  // 3. SWMLVars section (without userVariables, show remaining fields)
  if (payload.swmlVars && Object.keys(payload.swmlVars).length > 0) {
    const { userVariables, ...rest } = payload.swmlVars;
    if (Object.keys(rest).length > 0) {
      sections.push({
        title: 'SWML Variables',
        subtitle: 'Runtime call variables (ai_result, recording, etc.)',
        content: JSON.stringify(rest, null, 2),
      });
    }
  }

  // 4. SWMLCall metadata
  if (payload.swmlCall && Object.keys(payload.swmlCall).length > 0) {
    sections.push({
      title: 'Call Metadata',
      subtitle: 'SWMLCall signaling-layer data',
      content: JSON.stringify(payload.swmlCall, null, 2),
    });
  }

  // 5. Params (if present)
  if (payload.params && Object.keys(payload.params).length > 0) {
    sections.push({
      title: 'Parameters',
      subtitle: 'Application parameters passed to AI session',
      content: JSON.stringify(payload.params, null, 2),
    });
  }

  // 6. Previous Contexts (if present)
  if (payload.previousContexts && payload.previousContexts.length > 0) {
    sections.push({
      title: 'Previous Contexts',
      subtitle: 'Context from prior interactions',
      content: JSON.stringify(payload.previousContexts, null, 2),
    });
  }

  // 7. Prompt Vars (if present)
  if (payload.promptVars && Object.keys(payload.promptVars).length > 0) {
    sections.push({
      title: 'Prompt Variables',
      subtitle: 'Template variables active during session',
      content: JSON.stringify(payload.promptVars, null, 2),
    });
  }

  if (sections.length === 0) {
    container.innerHTML = '<div style="padding:1.5rem;color:var(--text-muted)">No session data available</div>';
    return;
  }

  container.innerHTML = `
    <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem">
      ${sections.map(s => `
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden">
          <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border)">
            <div style="font-size:0.85rem;font-weight:600;color:var(--text-secondary)">${s.title}</div>
            ${s.subtitle ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.15rem">${s.subtitle}</div>` : ''}
          </div>
          <pre style="margin:0;padding:1rem;font-family:var(--font-mono);font-size:0.75rem;color:var(--text-secondary);line-height:1.5;overflow-x:auto;max-height:500px;overflow-y:auto;white-space:pre-wrap;word-break:break-all">${escapeHtml(s.content)}</pre>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
