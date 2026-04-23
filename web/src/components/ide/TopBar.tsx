import { UserCircle, HelpCircle } from 'lucide-react';

export default function TopBar() {
  return (
    <div className="topbar">
      <div className="topbar-left"></div>
      <div className="topbar-center">KIMAKI.WEBUI v1.0</div>
      <div className="topbar-right">
        <HelpCircle size={18} className="activity-icon" />
        <UserCircle size={18} className="activity-icon" />
      </div>
    </div>
  );
}
