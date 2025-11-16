import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-12 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-blue-600 text-2xl font-bold">T2E</span>
            </div>
            <div>
              <h1 className="text-4xl font-bold">Travel Operations Pro</h1>
              <p className="text-blue-100 text-lg">Powered by AI • Built for Egypt Tours</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Welcome to Your Travel Management System
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            
            {/* AI WhatsApp Parser - KILLER FEATURE */}
            <Link 
              href="/whatsapp-parser"
              className="bg-gradient-to-br from-green-500 to-green-600 p-8 rounded-xl shadow-lg hover:shadow-2xl transition-all transform hover:scale-105 text-white"
            >
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-4xl">🤖</span>
              </div>
              <h3 className="text-2xl font-bold mb-2 text-center">AI WhatsApp Parser</h3>
              <p className="text-green-50 text-center">Paste chat → AI creates itinerary</p>
              <div className="mt-4 text-center">
                <span className="inline-block px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-medium">
                  ⚡ NEW! 98% Faster
                </span>
              </div>
            </Link>

            {/* Manage Itineraries */}
            <Link 
              href="/itineraries"
              className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">📋</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-center">Manage Itineraries</h3>
              <p className="text-gray-600 text-center">View and edit all trips</p>
            </Link>

            {/* View Rates */}
            <Link 
              href="/rates"
              className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">💰</span>
              </div>
              <h3 className="text-xl font-bold mb-2 text-center">View Rates</h3>
              <p className="text-gray-600 text-center">Service pricing database</p>
            </Link>

          </div>

          {/* Stats Section */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-blue-50 p-6 rounded-xl text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">62+</div>
              <div className="text-gray-600">Active Services</div>
            </div>
            <div className="bg-green-50 p-6 rounded-xl text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">7</div>
              <div className="text-gray-600">Service Categories</div>
            </div>
            <div className="bg-purple-50 p-6 rounded-xl text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">AI</div>
              <div className="text-gray-600">Powered</div>
            </div>
          </div>

          {/* Features */}
          <div className="mt-12 bg-white rounded-xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">✨ Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <h4 className="font-semibold text-gray-900">AI-Powered Parsing</h4>
                  <p className="text-sm text-gray-600">Automatically extract details from conversations</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <h4 className="font-semibold text-gray-900">Instant Itineraries</h4>
                  <p className="text-sm text-gray-600">Generate complete trips in seconds</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-2xl">💰</span>
                <div>
                  <h4 className="font-semibold text-gray-900">Smart Pricing</h4>
                  <p className="text-sm text-gray-600">Auto-calculate costs with markup</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-2xl">🌍</span>
                <div>
                  <h4 className="font-semibold text-gray-900">Multi-Language</h4>
                  <p className="text-sm text-gray-600">Support for Spanish, English, French & more</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">© 2025 Travel Operations Pro • Powered by AI</p>
        </div>
      </footer>
    </div>
  )
}