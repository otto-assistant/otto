"use client";

import TopBar from '@/components/ide/TopBar';
import ActivityBar from '@/components/ide/ActivityBar';
import ExplorerSidebar from '@/components/ide/ExplorerSidebar';
import ChatInterface from '@/components/ide/ChatInterface';
import ActionCenter from '@/components/ide/ActionCenter';
import StatusBar from '@/components/ide/StatusBar';

export default function Home() {
  return (
    <div className="ide-container">
      <TopBar />
      <ActivityBar />
      <ExplorerSidebar />
      <ChatInterface />
      <ActionCenter />
      <StatusBar />
    </div>
  );
}
