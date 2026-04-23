import { Files, User, Search, Book } from 'lucide-react';

export default function ActivityBar() {
  return (
    <div className="activitybar">
      <Files size={24} className="activity-icon active" />
      <User size={24} className="activity-icon" />
      <Search size={24} className="activity-icon" />
      <Book size={24} className="activity-icon" />
    </div>
  );
}
