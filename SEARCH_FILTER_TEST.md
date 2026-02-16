# Search & Filter Testing Guide

## Manual Testing Checklist

### 1. Transcript Filters

#### Role Filters
- [ ] Click "User" filter chip - should toggle active state (green background)
- [ ] Click "Assistant" filter chip - should toggle active state (indigo background)
- [ ] Click "Tool" filter chip - should toggle active state (amber background)
- [ ] Click "System" filter chip - should toggle active state (gray background)
- [ ] Select multiple role filters - should show messages matching ANY selected role (OR logic)
- [ ] Verify active filter chips have colored backgrounds and white text
- [ ] Verify inactive filter chips have gray backgrounds

#### Special Event Filters
- [ ] Click "🔴 Barge-in" filter - should toggle active state (red background)
- [ ] Verify only messages with barge_count > 0 are shown when active
- [ ] Click "🔀 Merged" filter - should toggle active state (blue background)
- [ ] Verify only messages with merge_count > 0 or merged=true are shown when active
- [ ] Click "🔧 Tool Calls" filter - should toggle active state (purple background)
- [ ] Verify only messages with tool_calls array are shown when active

#### Combined Filters
- [ ] Enable multiple filters at once (e.g., User + Barge-in)
- [ ] Verify AND logic across different filter types
- [ ] Verify OR logic within role filters
- [ ] Click "Clear all" button when filters are active
- [ ] Verify all filters are cleared and all messages shown

#### Empty State
- [ ] Apply filters that match no messages
- [ ] Verify empty state appears with 🔍 icon
- [ ] Verify message: "No messages match current filters"
- [ ] Verify suggestion: "Try adjusting your search or filters"

### 2. Transcript Search

#### Basic Search
- [ ] Type text in search box (e.g., "hello")
- [ ] Verify 300ms debounce (rapid typing doesn't trigger multiple searches)
- [ ] Verify matches are highlighted in yellow
- [ ] Verify match counter shows "X of Y" format
- [ ] Verify search works in message content
- [ ] Verify search works in tool call names and arguments

#### Match Highlighting
- [ ] Verify all matches have yellow background (rgba(251, 191, 36, 0.3))
- [ ] Verify current match has darker yellow + outline
- [ ] Verify outline is 2px solid #fbbf24

#### Search Navigation
- [ ] Click next button (↓) to navigate to next match
- [ ] Verify current match updates and scrolls into view
- [ ] Click previous button (↑) to navigate to previous match
- [ ] Verify next button is disabled at last match
- [ ] Verify previous button is disabled at first match
- [ ] Verify smooth scrolling with proper offset (100px from top)

#### Keyboard Shortcuts
- [ ] Press Enter to jump to next match
- [ ] Press Shift+Enter to jump to previous match
- [ ] Press Escape to clear search
- [ ] Verify shortcuts don't interfere when typing in input

#### Clear Search
- [ ] Click ✕ button in search box
- [ ] Verify search is cleared
- [ ] Verify highlights are removed
- [ ] Verify navigation buttons disappear

#### Search + Filters Combined
- [ ] Apply role filter + search query
- [ ] Verify search only applies to filtered messages
- [ ] Click "Clear all" to remove both filters and search

### 3. Log Toggle Persistence
- [ ] Apply filters and search in Processed Log
- [ ] Switch to Raw Log tab
- [ ] Verify filters/search persist and apply to raw log
- [ ] Switch back to Processed Log
- [ ] Verify state is maintained

### 4. SWAIG Inspector Search

#### Basic Search
- [ ] Type text in SWAIG search box
- [ ] Verify 300ms debounce
- [ ] Verify result count shows "X of Y entries"
- [ ] Verify search matches command names
- [ ] Verify search matches in post_data JSON (deep search)
- [ ] Verify search matches in post_response JSON (deep search)

#### Auto-Expand
- [ ] Perform search that matches entries
- [ ] Verify matching entries auto-expand
- [ ] Verify all accordions with matches are open

#### Highlighting
- [ ] Verify command names with matches are highlighted in yellow
- [ ] Verify case-insensitive matching works

#### Empty State
- [ ] Search for text that doesn't exist
- [ ] Verify empty state with 🔍 icon
- [ ] Verify message: "No SWAIG entries match your search"

#### Clear Search
- [ ] Click ✕ to clear search
- [ ] Verify all entries reappear
- [ ] Verify accordions return to collapsed state

### 5. Global Data Search

#### Basic Search
- [ ] Type text in Global Data search box
- [ ] Verify 300ms debounce
- [ ] Verify result count shows "X of Y sections"
- [ ] Verify search matches section titles
- [ ] Verify search matches section subtitles
- [ ] Verify search matches nested object keys
- [ ] Verify search matches nested object values (deep search)

#### Auto-Expand
- [ ] Perform search that matches sections
- [ ] Verify matching sections auto-expand
- [ ] Verify all sections with matches are open

#### Highlighting
- [ ] Verify section titles with matches are highlighted
- [ ] Verify section subtitles with matches are highlighted

#### Empty State
- [ ] Search for text that doesn't exist
- [ ] Verify empty state with 🔍 icon
- [ ] Verify message: "No sections match your search"

### 6. Tab Switching Behavior
- [ ] Search in Transcript tab
- [ ] Switch to SWAIG tab
- [ ] Verify Transcript search is cleared/inactive
- [ ] Search in SWAIG tab
- [ ] Switch to Global Data tab
- [ ] Verify SWAIG search is cleared/inactive
- [ ] Each tab should maintain independent search state

### 7. Performance Testing

#### Large Dataset (200+ messages)
- [ ] Load large conversation file
- [ ] Type in search box
- [ ] Verify no lag or stuttering
- [ ] Verify debouncing prevents excessive re-renders
- [ ] Apply multiple filters
- [ ] Verify filtering is instantaneous

#### Rapid Input
- [ ] Rapidly type and delete in search box
- [ ] Verify debouncing works (only searches after 300ms pause)
- [ ] Verify no memory leaks or errors in console

### 8. Responsive Design

#### Mobile/Narrow Screen (< 768px)
- [ ] Resize browser to mobile width
- [ ] Verify search bar stacks vertically
- [ ] Verify filter chips wrap properly
- [ ] Verify search box takes full width
- [ ] Verify navigation buttons remain accessible

### 9. Accessibility

#### Keyboard Navigation
- [ ] Tab through filter chips
- [ ] Verify focus indicators are visible
- [ ] Press Space/Enter to toggle filters
- [ ] Tab through search box and navigation buttons

#### Screen Reader
- [ ] Verify search input has aria-label="Search transcript"
- [ ] Verify navigation buttons have aria-labels
- [ ] Verify result count is readable

### 10. Error Handling

#### Edge Cases
- [ ] Upload file with no messages
- [ ] Verify graceful handling
- [ ] Upload file with no SWAIG entries
- [ ] Verify "No SWAIG function calls recorded" message
- [ ] Upload file with no global data
- [ ] Verify "No session data available" message

#### Special Characters in Search
- [ ] Search for: `* + ? ^ $ { } ( ) | [ ] \`
- [ ] Verify regex special characters are escaped
- [ ] Verify no JavaScript errors

### 11. State Persistence

#### Upload New File
- [ ] Apply filters and search
- [ ] Upload new JSON file
- [ ] Verify filters/search are reset
- [ ] Verify clean state for new file

## Browser Testing

Test in the following browsers:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

## Console Errors

During all testing:
- [ ] Verify no JavaScript errors in console
- [ ] Verify no warnings in console
- [ ] Verify no infinite loops or excessive re-renders

## Success Criteria

✅ All filters work correctly with proper AND/OR logic
✅ Search highlights matches and allows navigation
✅ Debouncing prevents performance issues
✅ Empty states are clear and actionable
✅ Keyboard shortcuts work as expected
✅ State management prevents infinite loops
✅ Responsive design works on all screen sizes
✅ No console errors or warnings
✅ Performance remains smooth with large datasets
