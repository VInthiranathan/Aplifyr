import Head from 'next/head'
import Sidebar from './Sidebar'
import TopNav from './TopNav'
import BottomNav from './BottomNav'
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <title>Aplifyr</title>
        <link rel="icon" href="/Aplifyr_Ikon.png" />
      </Head>
      {/* Mobile top bar — hidden on md+ */}
      <TopNav />
      <div className="flex h-screen overflow-hidden bg-gray-50 text-slate-900 dark:bg-[#0d0d0d] dark:text-white">
        {/* Sidebar: hidden on mobile, icon-rail on md, full on lg */}
        <div className="hidden md:flex flex-shrink-0">
          <Sidebar />
        </div>
        {/* pt-14 / pb-16 offset for fixed TopNav / BottomNav on mobile */}
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0d0d0d] pt-14 md:pt-0 pb-16 md:pb-0">
          {children}
        </main>
      </div>
      {/* Mobile bottom nav — hidden on md+ */}
      <BottomNav />
    </>
  )
}
