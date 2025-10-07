export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white">
      {/* Header */}
      <header className="bg-[#DC834E] text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                <span className="text-[#DC834E] text-2xl font-bold">T2E</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold">Travel2Egypt</h1>
                <p className="text-orange-100 text-sm">Operations Management System</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-5xl font-bold text-gray-900 mb-6">
            Welcome to TravelOps Pro
          </h2>
          <p className="text-xl text-gray-600 mb-12">
            Your all-in-one system for managing Egypt travel operations - from WhatsApp to invoice.
          </p>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            <a href="/rates" className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
              <div className="w-16 h-16 bg-[#DC834E] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">💰</span>
              </div>
              <h3 className="text-xl font-bold mb-2">View Rates</h3>
              <p className="text-gray-600">See current service pricing</p>
            </a>

            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-[#DC834E] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">📋</span>
              </div>
              <h3 className="text-xl font-bold mb-2">Smart Itineraries</h3>
              <p className="text-gray-600">Automated service breakdown</p>
            </div>

            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-[#DC834E] rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-white text-2xl">💬</span>
              </div>
              <h3 className="text-xl font-bold mb-2">WhatsApp Parser</h3>
              <p className="text-gray-600">AI-powered conversation analysis</p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 inline-block">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <p className="text-green-800 font-semibold">
                Phase 1 Complete! System is running.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            Travel2Egypt Operations System
          </p>
          <p className="text-gray-500 text-sm mt-2">
            36 Central Avenue, From Road 9, Moqattam – Cairo, Egypt 11572
          </p>
          <p className="text-gray-500 text-sm">
            +20 1080916066 | info@travel2egypt.org
          </p>
        </div>
      </footer>
    </div>
  );
}