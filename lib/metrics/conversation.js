import { wordCount } from '../utils.js';

export function computeConversation(data) {
  const messagesByRole = {};
  let totalWords = 0;
  let assistantWordCount = 0;
  let userWordCount = 0;
  let turnCount = 0;
  let lastRole = null;

  for (const msg of data.callLog) {
    const role = msg.role;
    messagesByRole[role] = (messagesByRole[role] || 0) + 1;

    const wc = wordCount(msg.content);
    totalWords += wc;

    if (role === 'assistant') {
      assistantWordCount += wc;
    } else if (role === 'user') {
      userWordCount += wc;
    }

    // Count turns: a turn changes whenever the role switches between user and assistant
    if ((role === 'user' || role === 'assistant') && role !== lastRole) {
      turnCount++;
      lastRole = role;
    }
  }

  return {
    turnCount,
    messagesByRole,
    totalWords,
    assistantWordCount,
    userWordCount,
  };
}
