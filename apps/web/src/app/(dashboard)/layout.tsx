'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { isAuthenticated } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.push('/login');
  }, [router]);

  return (
    <div className="flex h-screen bg-[#F6F8FC]">
      <Sidebar />
      <main className="flex-1 ml-[215px] overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
