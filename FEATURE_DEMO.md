# Search & Filter Feature Demo

## Quick Start Guide

### 1. Start the Application

```bash
npm run dev
# Open http://localhost:5176/
```

### 2. Load Sample Data

Upload one of these sample files from the project root:
- `voyager_new_caller.json` - Contains transcript, SWAIG, and global data
- `conversation_*.json` - Various conversation examples
- `swml_example.json` - SWML-specific data

## Feature Walkthrough

### Transcript Tab: Filters

#### Role Filters
Click on role chips to filter messages by speaker:

```
[User] [Assistant] [Tool] [System]
```

**Try this:**
1. Click "User" - see only user messages (green highlight)
2. Click "Assistant" - now see user AND assistant messages
3. Click "User" again - deselect, now only assistant messages

#### Event Filters
Click on event chips to filter by special events:

```
[🔴 Barge-in] [🔀 Merged] [🔧 Tool Calls]
```

**Try this:**
1. Click "🔴 Barge-in" - see only messages with interruptions (red highlight)
2. Click "🔧 Tool Calls" - see messages with tool calls AND barge-ins (purple highlight)
3. Click "Clear all" - reset everything

### Transcript Tab: Search

#### Basic Search
Type in the search box to find text:

```
[Search transcript...] [1 of 5] [↑] [↓]
```

**Try this:**
1. Type "hello" (wait 300ms for debounce)
2. Watch matches highlight in yellow
3. See counter update: "1 of 5"
4. Click ↓ to jump to next match
5. Click ↑ to go back

#### Keyboard Shortcuts
- `Enter` - Next match
- `Shift+Enter` - Previous match
- `Escape` - Clear search

**Try this:**
1. Search for "call"
2. Press Enter repeatedly to jump through matches
3. Press Escape to clear

### SWAIG Inspector: Search

Search through SWAIG function calls:

```
[Search SWAIG commands...] [3 of 12 entries]
```

**Try this:**
1. Go to SWAIG tab
2. Search for "get" or "post"
3. Watch matching entries auto-expand
4. See highlighted command names

### Global Data: Search

Search through session data:

```
[Search global data...] [2 of 7 sections]
```

**Try this:**
1. Go to Global Data tab
2. Search for "call" or "user"
3. Watch matching sections auto-expand
4. See highlighted section titles

## Visual Examples

### Empty State
When no matches found:

```
      🔍
No messages match current filters
Try adjusting your search or filters
   [Clear all filters]
```

### Active Filters
Filters with colored backgrounds when active:

```
[User] ← Green
[Assistant] ← Indigo
[Tool] ← Amber
[System] ← Gray
[🔴 Barge-in] ← Red
[🔀 Merged] ← Blue
[🔧 Tool Calls] ← Purple
```

### Search Highlighting
```
This is a message with highlighted text.
          ^^^^^^^^^^^^^^^^^^^^
```

- Light yellow: All matches
- Dark yellow with outline: Current match

## Common Use Cases

### 1. Find all tool calls
```
Filter: Click [🔧 Tool Calls]
Result: See only messages that called functions
```

### 2. Find all interruptions
```
Filter: Click [🔴 Barge-in]
Result: See only messages where user interrupted
```

### 3. Find specific text in conversation
```
Search: Type "appointment"
Result: Jump through all mentions with ↑↓ buttons
```

### 4. Find user questions only
```
Filter: Click [User]
Search: Type "?"
Result: See all user questions, navigate with Enter
```

### 5. Find specific SWAIG function
```
Tab: SWAIG Inspector
Search: Type function name (e.g., "get_weather")
Result: See matching commands with auto-expand
```

### 6. Find session variable
```
Tab: Global Data
Search: Type variable name (e.g., "phone_number")
Result: See sections containing that variable
```

## Tips & Tricks

### Combining Filters
- Multiple role filters = OR logic (any selected role)
- Multiple filter types = AND logic (must match all)
- Example: [User] + [🔧 Tool Calls] = user messages with tool calls

### Search Tips
- Search is case-insensitive by default
- Searches in message content AND tool calls
- Debounced at 300ms - no need to wait for typing to finish
- Special characters are automatically escaped

### Performance
- Filtering is instant, even with 200+ messages
- Search debouncing prevents lag during typing
- No page refresh needed - all real-time

### Responsive Design
- On mobile, filters stack vertically
- Search box takes full width
- Navigation buttons remain accessible

## Troubleshooting

### Search not working?
1. Check if you're on the right tab
2. Verify text actually exists in messages
3. Try clearing and re-typing

### Filters seem stuck?
1. Click "Clear all" button
2. Refresh the page if needed
3. Re-upload the JSON file

### Nothing showing?
1. Check if filters are too restrictive
2. Look for empty state message
3. Click "Clear all filters" button

## Sample Searches to Try

With `voyager_new_caller.json`:

1. **Search: "call"** - Find all call-related messages
2. **Search: "user"** - Find user references
3. **Filter: Assistant** - See only AI responses
4. **Filter: Tool Calls** - See function executions
5. **SWAIG Search: "post"** - Find POST requests
6. **Global Search: "phone"** - Find phone data

## Next Steps

1. Try all the examples above
2. Review `SEARCH_FILTER_TEST.md` for comprehensive testing
3. Check browser console for any errors
4. Test with your own data files

## Feedback

The implementation follows the plan exactly and includes:
- ✅ All specified filters
- ✅ Full-text search with highlighting
- ✅ Keyboard shortcuts
- ✅ Auto-scroll to matches
- ✅ Empty states
- ✅ Responsive design
- ✅ Performance optimizations

Enjoy exploring your conversation data! 🎉
