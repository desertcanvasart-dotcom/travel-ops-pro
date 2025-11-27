'use client'

import { useState } from 'react'
import { Inter } from 'next/font/google'
import './globals.css'
import { Sidebar } from './components/Sidebar'
import { AuthProvider } from './contexts/AuthContext'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}>
        <AuthProvider>
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar Navigation */}
            <Sidebar 
              isCollapsed={isCollapsed}
              setIsCollapsed={setIsCollapsed}
            />
            
            {/* Main Content Area */}
            <main className={`
              flex-1 overflow-y-auto transition-all duration-300 ease-in-out
              ${isCollapsed ? 'lg:ml-16' : 'lg:ml-64'}
            `}>
              <div className="min-h-screen">
                {children}
              </div>
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
