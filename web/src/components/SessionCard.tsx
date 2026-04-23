import { Folder, Clock, Activity, Hash, Layers } from 'lucide-react';

interface SessionProps {
  title: string;
  subtitle: string;
  status: 'active' | 'pending' | 'idle';
  time: string;
  source: 'opencode' | 'kimaki';
  index: number;
}

export default function SessionCard({ title, subtitle, status, time, source, index }: SessionProps) {
  const statusClass = status === 'active' ? 'status-active' : 'status-pending';
  
  return (
    <div 
      className="glass-panel session-card animate-slide-in"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="session-header">
        <div className="session-title">
          {source === 'opencode' ? <Activity size={18} /> : <Hash size={18} />}
          {title}
        </div>
        <div className={`session-status ${statusClass}`}>
          {status}
        </div>
      </div>
      
      <div className="session-meta">
        <div className="meta-item">
          <Folder size={14} />
          {subtitle}
        </div>
        <div className="meta-item">
          <Clock size={14} />
          {time}
        </div>
      </div>
    </div>
  );
}
