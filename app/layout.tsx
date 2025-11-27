'use client'

import { useState } from 'react'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

// Note: Move metadata to a separate metadata.ts file since we're now using 'use client'
// Or keep it in a server component wrapper

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}>
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar Navigation - Pass state down */}
          <Sidebar 
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
          />
          
          {/* Main Content Area - Adjusts based on sidebar state */}
          <main className={`
            flex-1 overflow-y-auto transition-all duration-300 ease-in-out
            ${isCollapsed ? 'lg:ml-16' : 'lg:ml-64'}
          `}>
            <div className="min-h-screen">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}