# SignalWire Agent Builder

A visual drag-and-drop interface for building SignalWire AI agents. Design conversation flows, configure prompts, define functions, and export to both SWML JSON and Python SDK code.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (runs on port 5177)
npm run dev

# Build for production
npm run build
```

## Features

### Phase 1: Core Builder (MVP) ✅

- ✅ **Visual Canvas**: Drag-and-drop node-based editor using Cytoscape.js
- ✅ **Step Nodes**: Create conversation states with instructions
- ✅ **Function Nodes**: Define SWAIG tools with parameters
- ✅ **Edge Creation**: Connect steps to define valid transitions
- ✅ **Properties Panel**: Configure nodes with detailed settings
- ✅ **SWML Export**: Generate valid SWML JSON
- ✅ **Python SDK Export**: Generate AgentBase code
- ✅ **SWML Import**: Load existing SWML files
- ✅ **Context Support**: Multiple conversation modes
- ✅ **POM Editor**: Prompt Object Model structure

## Architecture

```
ui/
├── src/
│   ├── main.js                 # App entry point
│   ├── lib/
│   │   ├── state.js            # Global state management (pub/sub)
│   │   ├── export.js           # SWML & Python SDK export
│   │   └── import.js           # SWML import
│   ├── components/
│   │   ├── toolbar.js          # Top toolbar with actions
│   │   ├── sidebar.js          # Node palette
│   │   ├── canvas.js           # Cytoscape canvas
│   │   └── properties-panel.js # Node configuration
│   └── styles/
│       ├── theme.css           # Design system (dark theme)
│       └── builder.css         # Builder-specific styles
├── index.html                  # App shell
├── vite.config.js              # Vite configuration (port 5177)
└── package.json
```

## Usage Guide

### Creating Your First Agent

1. **Add Steps**: Drag "Basic Step" from sidebar to canvas
2. **Configure Step**: Click step to open properties panel
   - Set step name and criteria
   - Add POM instructions (sections with bullets)
   - Select available functions
   - Define valid next steps

3. **Add Functions**: Drag "Custom Function" to canvas
   - Configure function name and purpose
   - Add parameters with types
   - Set webhook URL

4. **Connect Steps**: Drag from one step to another to create valid transitions

5. **Export**:
   - **SWML JSON**: Click Actions → Export SWML JSON
   - **Python SDK**: Click Actions → Export Python SDK

### Importing Existing Agents

- Click Actions → Import SWML JSON
- Select your `.json` file
- Agent will be visualized on canvas

## Node Types

### Step Nodes 🔷
Conversation states with:
- Instructions (POM structure)
- Step completion criteria
- Available functions
- Valid next steps
- Context switching rules

### Function Nodes ⚙️
SWAIG tools with:
- Name and purpose
- Parameters (typed)
- Webhook URL
- Metadata arguments

### Context Containers 📦
Group related steps into conversation modes:
- Isolated contexts (separate persona)
- Context prompts
- Enter fillers

## Keyboard Shortcuts

- **Delete**: Remove selected node
- **Ctrl/Cmd + Z**: Undo (coming soon)
- **Ctrl/Cmd + S**: Save to file (coming soon)

## Roadmap

### Phase 2: Advanced Features
- [ ] Multi-context visualization
- [ ] gather_info template
- [ ] Skills library integration
- [ ] Full SWML schema coverage
- [ ] Comprehensive validation

### Phase 3: Bonus Features
- [ ] **AI-Assisted Building**: Natural language → agent generation
- [ ] **Conversation Simulator**: Test flows before deployment
- [ ] **Analytics Integration**: Show step usage from post_conversation data
- [ ] **Version History**: Git-like branching
- [ ] **Prompt Library**: Reusable POM templates

## Tech Stack

- **Vite**: Build tool and dev server
- **Cytoscape.js**: Graph visualization and node editor
- **Vanilla JS**: No framework dependencies (matching parent project)
- **Dark Theme**: Consistent with postpromptviewer design

## Development

### Project Structure

The builder uses a pub/sub state management pattern:
```javascript
import { getState, update, subscribe } from './lib/state.js';

// Update state
update({ agent: { name: 'New Name' } });

// Subscribe to changes
subscribe((state) => {
  console.log('State updated:', state);
});
```

### Adding New Node Types

1. Add palette item to `sidebar.js`
2. Handle drop event in `canvas.js`
3. Add properties UI in `properties-panel.js`
4. Update export logic in `export.js`

## License

MIT

## Links

- [SignalWire Agents SDK](https://github.com/signalwire/signalwire-agents)
- [SWML Documentation](https://developer.signalwire.com/sdks/agents-sdk)
- [Parent Project](../README.md)
