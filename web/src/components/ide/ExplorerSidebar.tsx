import { ChevronDown, ChevronRight, Folder, Box, Wrench, CheckSquare } from 'lucide-react';

export default function ExplorerSidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-header">KIMAKI AGENT EXPLORER</div>
      
      <div className="sidebar-section">
        <div className="sidebar-title">
          <ChevronDown size={14} />
          <Folder size={14} /> Projects
        </div>
        <div className="sidebar-item"><Folder size={14} /> backend-api</div>
        <div className="sidebar-item"><Folder size={14} /> frontend-react</div>
        <div className="sidebar-item"><Folder size={14} /> users.go</div>
      </div>
      
      <div className="sidebar-section">
        <div className="sidebar-title">
          <ChevronDown size={14} />
          <Box size={14} /> Models
        </div>
        <div className="sidebar-item"><Box size={14} /> code-llama-34b</div>
        <div className="sidebar-item"><Box size={14} /> mistral-medium</div>
      </div>
      
      <div className="sidebar-section">
        <div className="sidebar-title">
          <ChevronDown size={14} />
          <Wrench size={14} /> Tools
        </div>
        <div className="sidebar-item"><Wrench size={14} /> opencode-fs</div>
        <div className="sidebar-item"><CheckSquare size={14} /> kimaki-runner</div>
      </div>
      
      <div className="sidebar-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)' }}>
        <div className="sidebar-header" style={{ color: 'var(--text-primary)' }}>ACTIVE SESSIONS</div>
        <div className="sidebar-item active">Session 1: DB Optimization</div>
        <div className="sidebar-item">Session 2: API Refactor</div>
      </div>
    </div>
  );
}
