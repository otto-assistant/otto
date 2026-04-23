export default function ActionCenter() {
  return (
    <div className="action-center">
      <div className="action-tabs">
        <div className="action-tab">Execution Log</div>
        <div className="action-tab active">Artifacts</div>
      </div>
      
      <div className="action-content">
        <div className="execution-log">
          <div>&gt;_ kimaki</div>
          <div style={{ marginLeft: '16px' }}>1. [KIMAKI] Analyze Request</div>
          <div><span style={{ color: '#888' }}>📁</span> opencode</div>
          <div style={{ marginLeft: '16px' }}>1. [OPENCODE-FS] Read file: 'users.go'</div>
          <div style={{ marginLeft: '16px' }}>3. [KIMAKI] Plan Solution</div>
          <div style={{ marginLeft: '16px' }}>4. [KIMAKI] Generate Artifacts</div>
        </div>
        
        <div className="diff-pane">
          <div className="diff-header">
            <span>Artifacts</span>
            <span>users.go : diff</span>
          </div>
          <div className="diff-editor">
            <div className="diff-left">
              <div className="diff-line"><span className="line-num">1</span>&nbsp;import userso</div>
              <div className="diff-line"><span className="line-num">2</span></div>
              <div className="diff-line"><span className="line-num">3</span>func usersflows:users() {'{'}</div>
              <div className="diff-line remove"><span className="line-num">4</span>&nbsp;&nbsp;counter =</div>
              <div className="diff-line"><span className="line-num">5</span>&nbsp;&nbsp;for ic in notse</div>
              <div className="diff-line"><span className="line-num">6</span>&nbsp;&nbsp;&nbsp;&nbsp;if etrch ==</div>
              <div className="diff-line"><span className="line-num">7</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;unit de</div>
              <div className="diff-line remove"><span className="line-num">8</span>&nbsp;&nbsp;{'}'} else {'{'}</div>
              <div className="diff-line"><span className="line-num">9</span>&nbsp;&nbsp;&nbsp;&nbsp;context</div>
              <div className="diff-line"><span className="line-num">10</span>&nbsp;&nbsp;&nbsp;&nbsp;nob = M</div>
              <div className="diff-line"><span className="line-num">11</span>&nbsp;&nbsp;{'}'}</div>
            </div>
            <div className="diff-right" style={{ backgroundColor: '#182218' }}>
              <div className="diff-line"><span className="line-num">1</span>// diwens.go: diff</div>
              <div className="diff-line"><span className="line-num">2</span>func usersflows:users() {'{'}</div>
              <div className="diff-line"><span className="line-num">3</span></div>
              <div className="diff-line add"><span className="line-num">4</span>&nbsp;&nbsp;if in users(l</div>
              <div className="diff-line add"><span className="line-num">5</span>&nbsp;&nbsp;&nbsp;&nbsp;// motters h</div>
              <div className="diff-line add"><span className="line-num">6</span>&nbsp;&nbsp;&nbsp;&nbsp;const users</div>
              <div className="diff-line add"><span className="line-num">7</span>&nbsp;&nbsp;&nbsp;&nbsp;duration ==</div>
              <div className="diff-line"><span className="line-num">8</span></div>
              <div className="diff-line add"><span className="line-num">9</span>&nbsp;&nbsp;&nbsp;&nbsp;if count</div>
              <div className="diff-line add"><span className="line-num">10</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;if not</div>
              <div className="diff-line add"><span className="line-num">11</span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;use</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
