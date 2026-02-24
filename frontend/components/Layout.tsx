import Head from 'next/head'
import Sidebar from './Sidebar'
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <title>Aplifyr</title>
        <link rel="icon" href="/Aplifyr_Ikon.png" />
      </Head>
      <div className="flex min-h-screen bg-gray-50 text-slate-900 dark:bg-[#0d0d0d] dark:text-white">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0d0d0d]">
          {children}
        </main>
      </div>
    </>
  )
}
