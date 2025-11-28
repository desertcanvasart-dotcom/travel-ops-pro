import Link from 'next/link'
import { 
  Layers, 
  Zap, 
  Calendar, 
  Users, 
  MessageSquare, 
  DollarSign, 
  FileText, 
  Database,
  Brain,
  CheckCircle,
  Globe,
  Building,
  ArrowRight,
  Check,
  Menu
} from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#F7F7F4]">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#263A29] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
                  <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <span className="text-[#263A29] text-lg font-semibold">Autoura</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-gray-600 hover:text-[#263A29] transition-colors">Features</a>
              <a href="#agencies" className="text-sm text-gray-600 hover:text-[#263A29] transition-colors">For Agencies</a>
              <a href="#pricing" className="text-sm text-gray-600 hover:text-[#263A29] transition-colors">Pricing</a>
              <a href="#resources" className="text-sm text-gray-600 hover:text-[#263A29] transition-colors">Resources</a>
              <a href="#support" className="text-sm text-gray-600 hover:text-[#263A29] transition-colors">Support</a>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link 
                href="/login" 
                className="h-10 px-4 flex items-center text-sm font-medium text-[#263A29] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Sign in
              </Link>
              <Link 
                href="/signup" 
                className="h-10 px-4 flex items-center text-sm font-medium text-white bg-[#263A29] rounded-lg hover:bg-[#1D2B20] transition-colors"
              >
                Sign up free
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden text-[#263A29]">
              <Menu size={24} />
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Copy */}
          <div className="space-y-6">
            <span className="inline-block px-3 py-1.5 text-xs font-medium text-[#263A29] bg-[#D9E0CF] rounded-full">
              Operations OS for Travel Professionals
            </span>
            
            <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-900 leading-tight">
              Autoura – Run Your Entire Travel Operation from One Smart System
            </h1>
            
            <p className="text-base lg:text-lg text-gray-600 leading-relaxed">
              Turn scattered spreadsheets, chats and notes into one organised workspace for inquiries, pricing, itineraries, operations, and payments.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link 
                href="/signup" 
                className="h-12 px-6 flex items-center gap-2 text-sm font-medium text-white bg-[#263A29] rounded-lg hover:bg-[#1D2B20] transition-colors shadow-sm"
              >
                Sign up free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link 
                href="/login" 
                className="h-12 px-6 flex items-center text-sm font-medium text-[#263A29] bg-white border-2 border-[#263A29] rounded-lg hover:bg-gray-50 transition-colors"
              >
                Sign in
              </Link>
            </div>

            <p className="text-sm text-gray-500">
              No credit card needed · Built for travel agencies and DMCs
            </p>
          </div>

          {/* Right Column - App Preview */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#E9E3D2]/50 to-transparent rounded-3xl transform -rotate-3"></div>
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
              {/* Mock App UI */}
              <div className="flex">
                {/* Sidebar */}
                <div className="w-48 bg-[#263A29] text-white p-4 space-y-3" style={{ minHeight: '320px' }}>
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-6 h-6 rounded bg-white/20"></div>
                    <span className="text-sm font-semibold">Autoura</span>
                  </div>
                  <div className="space-y-1">
                    <div className="px-3 py-2 rounded bg-white/10 text-xs">Dashboard</div>
                    <div className="px-3 py-2 rounded text-xs text-white/70">Inquiries</div>
                    <div className="px-3 py-2 rounded text-xs text-white/70">Itineraries</div>
                    <div className="px-3 py-2 rounded text-xs text-white/70">Tours</div>
                    <div className="px-3 py-2 rounded text-xs text-white/70">Clients</div>
                  </div>
                </div>
                
                {/* Main Content Area */}
                <div className="flex-1 p-6 bg-[#F7F7F4]">
                  <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-[#D9E0CF]"></div>
                      <div>
                        <div className="h-3 w-24 bg-[#E9E3D2] rounded mb-1.5"></div>
                        <div className="h-2 w-16 bg-[#E9E3D2] rounded"></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 w-full bg-[#E9E3D2] rounded"></div>
                      <div className="h-2 w-4/5 bg-[#E9E3D2] rounded"></div>
                      <div className="h-2 w-3/5 bg-[#E9E3D2] rounded"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audience Strip */}
      <section className="bg-[#E9E3D2] py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-[#263A29] mb-8">Built for modern travel professionals</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { icon: Building, label: 'Travel agencies' },
              { icon: Globe, label: 'DMCs & specialists' },
              { icon: Users, label: 'Tour guides & operators' },
              { icon: Layers, label: 'Transport & transfer companies' }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-white mx-auto mb-2 flex items-center justify-center shadow-sm">
                  <item.icon className="w-5 h-5 text-[#263A29]" />
                </div>
                <p className="text-xs text-[#263A29]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Key Benefits */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">Why Autoura</h2>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            One system that brings together CRM, itineraries, finances, teams, and automation—designed specifically for travel businesses.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Layers,
              title: 'One place for everything',
              features: ['Leads, clients, suppliers, tours, documents', 'No more switching between tools', 'Everything connected and searchable']
            },
            {
              icon: Brain,
              title: 'Automation that understands travel',
              features: ['Auto-itineraries from WhatsApp messages', 'Auto-pricing based on your margins', 'Smart follow-up emails and reminders']
            },
            {
              icon: Calendar,
              title: 'Clarity across all tours',
              features: ['Calendar of all active tours', 'Staff assignments and availability', 'Real-time info for each day']
            }
          ].map((benefit, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
              <div className="w-11 h-11 rounded-xl bg-[#D9E0CF] flex items-center justify-center mb-4">
                <benefit.icon className="w-5 h-5 text-[#263A29]" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">{benefit.title}</h3>
              <ul className="space-y-2">
                {benefit.features.map((feature, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-[#263A29] mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Highlight 1 - Itineraries */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="order-2 lg:order-1">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                    <div key={i} className="text-center text-xs text-gray-500 py-1">{d}</div>
                  ))}
                  {Array.from({ length: 31 }, (_, i) => (
                    <div key={i} className={`text-center text-xs py-2 rounded ${i === 14 ? 'bg-[#263A29] text-white' : i >= 12 && i <= 18 ? 'bg-[#D9E0CF] text-[#263A29]' : 'text-gray-600'}`}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2 space-y-4">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">Create beautiful, consistent itineraries in minutes</h2>
            <p className="text-base text-gray-600">
              Stop rebuilding the same trips from scratch. Use our drag-and-drop builder with Egypt-specific templates to create professional itineraries that clients love.
            </p>
            <ul className="space-y-3">
              {['Drag & drop days, activities, and services', 'Built-in Egypt templates', 'Travel-ready PDFs with your branding'].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#263A29]" />
                  <span className="text-sm text-gray-700">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Feature Highlight 2 - Operations */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">Keep every tour, guide and driver perfectly in sync</h2>
              <p className="text-base text-gray-600">
                Never miss a pickup or double-book a guide again. See all your operations in one place, assign staff, and track every detail in real-time.
              </p>
              <ul className="space-y-3">
                {['Task checklists for every day of every tour', 'WhatsApp handover between guides and drivers', 'City-by-city operations overview'].map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#263A29]" />
                    <span className="text-sm text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="bg-[#F7F7F4] rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="w-8 h-8 rounded-full bg-[#D9E0CF] mb-2"></div>
                      <div className="h-2 w-full bg-gray-100 rounded mb-1"></div>
                      <div className="h-2 w-2/3 bg-gray-100 rounded"></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">Everything you need to run your travel operation</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Users, title: 'Client CRM & lead pipeline', desc: 'Track every inquiry from first contact to final payment. Never lose a lead in WhatsApp again.' },
            { icon: MessageSquare, title: 'WhatsApp & email migration', desc: 'Forward messages and they become organised records, automatically linked to the right tour or client.' },
            { icon: DollarSign, title: 'Smart pricing engine', desc: 'Set your margins once, then get instant quotes based on group size, season, and services.' },
            { icon: FileText, title: 'Shared itineraries & PDFs', desc: 'Easily create a live link or branded PDF. They see the same layout as it shows within Autoura.' },
            { icon: Database, title: 'Supplier & staff database', desc: 'Maintain your network of hotels, guides, drivers, and partners in one searchable place.' },
            { icon: Brain, title: 'Knowledge base & SOP templates', desc: 'Document your processes, train newcomers, and share best practices for your team.' }
          ].map((feature, i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="w-10 h-10 rounded-lg bg-[#F7F7F4] flex items-center justify-center mb-3 border border-gray-100">
                <feature.icon className="w-5 h-5 text-[#263A29]" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">{feature.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="space-y-1 mb-4">
                <div className="text-4xl font-bold text-[#263A29]">247+</div>
                <p className="text-sm text-gray-600">Bookings managed through Autoura</p>
              </div>
              <div className="space-y-1">
                <div className="text-4xl font-bold text-[#263A29]">12</div>
                <p className="text-sm text-gray-600">Active tours in one dashboard</p>
              </div>
              <p className="text-sm text-gray-500 mt-4">From first inquiry to final payment in one system</p>
            </div>
            <div className="bg-[#F7F7F4] rounded-2xl p-6 border border-gray-100">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-[#D9E0CF] flex-shrink-0"></div>
                <div>
                  <p className="text-sm text-gray-700 mb-3 italic">
                    "Autoura replaced five tools and allowed our team to handle complex multi-city itineraries without missing a single detail. Game changer for our DMC."
                  </p>
                  <p className="text-sm font-semibold text-gray-900">Sarah Ahmed</p>
                  <p className="text-xs text-gray-500">Operations Director, Nile Explorers DMC</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">Start free. Scale when you're ready.</h2>
          <p className="text-base text-gray-600">No credit card required to get started</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Starter */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
            <span className="inline-block px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full mb-3">
              Just for small teams
            </span>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Starter</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-gray-900">Free</span>
            </div>
            <ul className="space-y-2 mb-6">
              {['Lead tracking & basic CRM', 'Basic itinerary builder', 'Up to 5 active tours', '1 user'].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-[#263A29] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">{item}</span>
                </li>
              ))}
            </ul>
            <Link 
              href="/signup" 
              className="w-full h-10 flex items-center justify-center text-sm font-medium text-[#263A29] bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Get started free
            </Link>
          </div>

          {/* Pro / Agency */}
          <div className="bg-[#263A29] rounded-2xl p-6 text-white">
            <span className="inline-block px-2 py-1 text-xs font-medium text-[#263A29] bg-white rounded-full mb-3">
              For growing operations
            </span>
            <h3 className="text-lg font-semibold text-white mb-1">Pro / Agency</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-white">Custom</span>
            </div>
            <ul className="space-y-2 mb-6">
              {['Unlimited tours & clients', 'Multi-user collaboration', 'Financial tracking & reporting', 'Automation & AI features', 'Knowledge base & SOPs', 'Priority support'].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-[#D9E0CF] flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-[#E9E3D2]">{item}</span>
                </li>
              ))}
            </ul>
            <Link 
              href="/signup" 
              className="w-full h-10 flex items-center justify-center text-sm font-medium text-[#263A29] bg-white rounded-lg hover:bg-[#E9E3D2] transition-colors"
            >
              Talk to us
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Custom enterprise setups available for large DMCs and multi-brand groups
        </p>
      </section>

      {/* Final CTA */}
      <section className="bg-[#263A29] py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">Ready to get your travel operation under control?</h2>
          <p className="text-base text-[#E9E3D2] mb-8 max-w-xl mx-auto">
            Bring all your tours, clients, and teams into one organised system in the next 7 days.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link 
              href="/signup" 
              className="h-12 px-6 flex items-center text-sm font-medium text-[#263A29] bg-white rounded-lg hover:bg-[#E9E3D2] transition-colors"
            >
              Sign up free
            </Link>
            <Link 
              href="/login" 
              className="h-12 px-6 flex items-center text-sm font-medium text-white border-2 border-white rounded-lg hover:bg-white/10 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1D2B20] text-white py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-5 gap-8 mb-8">
            {/* Logo & Description */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
                    <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-base font-semibold">Autoura</span>
              </div>
              <p className="text-sm text-[#E9E3D2] leading-relaxed">
                The operations system built for travel professionals who want to focus on creating amazing experiences, not managing spreadsheets.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Product</h4>
              <ul className="space-y-2">
                {['Features', 'Pricing', 'Integrations', 'Changelog'].map((item, i) => (
                  <li key={i}><a href="#" className="text-sm text-[#E9E3D2] hover:text-white transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Resources</h4>
              <ul className="space-y-2">
                {['Documentation', 'Help Center', 'Blog', 'Templates'].map((item, i) => (
                  <li key={i}><a href="#" className="text-sm text-[#E9E3D2] hover:text-white transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Company</h4>
              <ul className="space-y-2">
                {['About', 'Contact', 'Privacy', 'Terms'].map((item, i) => (
                  <li key={i}><a href="#" className="text-sm text-[#E9E3D2] hover:text-white transition-colors">{item}</a></li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-[#E9E3D2]">
              © 2025 Autoura. Made in Egypt for the world of travel.
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-sm text-[#E9E3D2] hover:text-white transition-colors">English</a>
              <a href="#" className="text-sm text-[#E9E3D2] hover:text-white transition-colors">العربية</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}