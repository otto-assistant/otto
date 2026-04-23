import { MessageSquare, Paperclip, Send } from 'lucide-react';

export default function ChatInterface() {
  return (
    <div className="chat-pane">
      <div className="chat-header">
        <MessageSquare size={16} /> KIMAKI CHAT
      </div>
      
      <div className="chat-history">
        <div className="message" style={{ alignSelf: 'flex-end', flexDirection: 'row-reverse' }}>
          <div className="message-avatar">👤</div>
          <div className="message-user">
            /solve: Optimize database queries in 'users.go'
          </div>
        </div>
        
        <div className="message">
          <div className="message-avatar">🐙</div>
          <div className="message-agent">
            <p>Analyzing 'users.go'...</p>
            <p>Found inefficient nested loop.</p>
            <p>Proposed change: Use a single JOIN query.</p>
            <p>View changes in <a href="#">Artifacts</a>.</p>
            
            <div className="diff-snippet">
              <div className="snippet-header">
                <span>func usersflows:users()</span>
              </div>
              <div className="snippet-content">
                <div className="diff-line"><span className="line-num"></span>&nbsp;&nbsp;let users = no</div>
                <div className="diff-line"><span className="line-num"></span>&nbsp;&nbsp;for loop in in usersdo; i++) {'{'}</div>
                <div className="diff-line remove"><span className="line-num">-</span>&nbsp;&nbsp;&nbsp;&nbsp;for usersstaramt()</div>
                <div className="diff-line add"><span className="line-num">+</span>&nbsp;&nbsp;&nbsp;&nbsp;Use a single JOIN</div>
                <div className="diff-line add"><span className="line-num">+</span>&nbsp;&nbsp;&nbsp;&nbsp;USE any single JOIN query</div>
                <div className="diff-line"><span className="line-num"></span>&nbsp;&nbsp;{'}'}</div>
              </div>
              <div className="snippet-actions">
                <button className="btn btn-primary">Apply Fix</button>
                <button className="btn btn-danger">Reject</button>
                <button className="btn">Run Tests</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="chat-input-area">
        <div className="chat-input-box">
          <input type="text" placeholder="KIMAKI COMMAND (Opt+Enter to execute)" />
          <div className="chat-input-actions">
            <Paperclip size={18} style={{ cursor: 'pointer' }} />
            <Send size={18} style={{ cursor: 'pointer' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
