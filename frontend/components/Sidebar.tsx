import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  Home,
  User,
  Briefcase,
  HelpCircle,
} from 'lucide-react'

const APP_NAME = 'MyApp' // byt ut när du har ett projektnamn

const navItems = [
  { label: 'User Details', href: '/user', icon: User },
  { label: 'Home',         href: '/',     icon: Home },
  { label: 'All jobs',     href: '/jobs', icon: Briefcase },
  { label: 'Support',      href: '/support', icon: HelpCircle },
]

export default function Sidebar() {
  const { pathname } = useRouter()

  return (
    <aside className="flex flex-col h-screen w-48 bg-[#111] text-white border-r border-white/10 flex-shrink-0">
      {/* top branding */}
      <div className="px-4 pt-5 pb-3">
        <span className="text-xs text-white/40 uppercase tracking-widest">
          {APP_NAME} /
        </span>
        {/* logo placeholder */}
        <div className="mt-3 w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500" />
      </div>

      {/* section label */}
      <p className="px-4 pt-4 pb-1 text-[11px] text-white/30 uppercase tracking-widest">
        The Tastemaker
      </p>

      {/* nav links */}
      <nav className="flex flex-col gap-1 px-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* bottom user badge */}
      <div className="mt-auto px-3 pb-5">
        <Link
          href="/user"
          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-purple-600 flex items-center justify-center text-xs font-bold">
            JJ
          </div>
          <div className="leading-tight">
            <p className="text-sm text-white font-medium">Jordan Jeremih</p>
            <p className="text-xs text-white/40">User Profile</p>
          </div>
        </Link>
      </div>
    </aside>
  )
}
