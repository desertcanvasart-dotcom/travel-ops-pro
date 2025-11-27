'use client'


export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

// ============================================
// INTERFACES
// ============================================

interface Restaurant {
  id: string
  name: string
  restaurant_type?: string
  cuisine_type?: string
  city: string
  address?: string
  contact_person?: string
  phone?: string
  email?: string
  whatsapp?: string
  capacity?: number
  meal_types?: string[]
  dietary_options?: string[]
  notes?: string
  is_active: boolean
  created_at: string
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function RestaurantsContent() {
  const searchParams = useSearchParams()
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingRestaurant, setEditingRestaurant] = useState<Restaurant | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    restaurant_type: 'local',
    cuisine_type: '',
    city: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    whatsapp: '',
    capacity: 0,
    meal_types: [] as string[],
    dietary_options: [] as string[],
    notes: '',
    is_active: true
  })

  // Fetch restaurants
  const fetchRestaurants = async () => {
    try {
      const response = await fetch('/api/resources/restaurants')
      const data = await response.json()
      if (data.success) {
        setRestaurants(data.data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching restaurants:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRestaurants()
    
    const editId = searchParams.get('edit')
    if (editId) {
      const restaurant = restaurants.find(r => r.id === editId)
      if (restaurant) {
        handleEdit(restaurant)
      }
    }
  }, [searchParams])

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value
    }))
  }

  // Handle checkbox for active status
  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      is_active: e.target.checked
    }))
  }

  // Handle meal types
  const toggleMealType = (mealType: string) => {
    setFormData(prev => ({
      ...prev,
      meal_types: prev.meal_types.includes(mealType)
        ? prev.meal_types.filter(m => m !== mealType)
        : [...prev.meal_types, mealType]
    }))
  }

  // Handle dietary options
  const toggleDietaryOption = (option: string) => {
    setFormData(prev => ({
      ...prev,
      dietary_options: prev.dietary_options.includes(option)
        ? prev.dietary_options.filter(o => o !== option)
        : [...prev.dietary_options, option]
    }))
  }

  // Open modal for new restaurant
  const handleAddNew = () => {
    setEditingRestaurant(null)
    setFormData({
      name: '',
      restaurant_type: 'local',
      cuisine_type: '',
      city: '',
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      whatsapp: '',
      capacity: 0,
      meal_types: [],
      dietary_options: [],
      notes: '',
      is_active: true
    })
    setShowModal(true)
  }

  // Open modal for editing
  const handleEdit = (restaurant: Restaurant) => {
    setEditingRestaurant(restaurant)
    setFormData({
      name: restaurant.name,
      restaurant_type: restaurant.restaurant_type || 'local',
      cuisine_type: restaurant.cuisine_type || '',
      city: restaurant.city,
      address: restaurant.address || '',
      contact_person: restaurant.contact_person || '',
      phone: restaurant.phone || '',
      email: restaurant.email || '',
      whatsapp: restaurant.whatsapp || '',
      capacity: restaurant.capacity || 0,
      meal_types: restaurant.meal_types || [],
      dietary_options: restaurant.dietary_options || [],
      notes: restaurant.notes || '',
      is_active: restaurant.is_active
    })
    setShowModal(true)
  }

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const url = editingRestaurant 
        ? `/api/resources/restaurants/${editingRestaurant.id}`
        : '/api/resources/restaurants'
      
      const method = editingRestaurant ? 'PUT' : 'POST'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(editingRestaurant ? 'Restaurant updated!' : 'Restaurant created!')
        setShowModal(false)
        fetchRestaurants()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error saving restaurant:', error)
      alert('Failed to save restaurant')
    }
  }

  // Delete restaurant
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    
    try {
      const response = await fetch(`/api/resources/restaurants/${id}`, {
        method: 'DELETE'
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Restaurant deleted!')
        fetchRestaurants()
      } else {
        alert('Error: ' + data.error)
      }
    } catch (error) {
      console.error('Error deleting restaurant:', error)
      alert('Failed to delete restaurant')
    }
  }
  
  // Filter restaurants
  const filteredRestaurants = restaurants.filter(restaurant => {
    const matchesSearch = searchTerm === '' || 
      restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.cuisine_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.contact_person?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCity = selectedCity === 'all' || restaurant.city === selectedCity
    const matchesActive = showInactive || restaurant.is_active
    
    return matchesSearch && matchesCity && matchesActive
  })

  // Get unique cities
  const cities = Array.from(new Set(restaurants.map(r => r.city))).sort()

  // Calculate stats
  const activeRestaurants = restaurants.filter(r => r.is_active).length
  const inactiveRestaurants = restaurants.filter(r => !r.is_active).length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">Loading restaurants...</p>
        </div>
      </div>
    )
  }

  const mealTypesList = ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Buffet', 'À la carte']
  const dietaryOptionsList = ['Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-Free', 'Dairy-Free']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="container mx-auto px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Restaurant Contacts</h1>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNew}
                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <span>+</span>
                Add Restaurant
              </button>
              <Link 
                href="/resources"
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Resources
              </Link>
              <Link 
                href="/" 
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="container mx-auto px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🍽️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </div>
            <p className="text-xs text-gray-600">Total Restaurants</p>
            <p className="text-2xl font-bold text-gray-900">{restaurants.length}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">✓</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </div>
            <p className="text-xs text-gray-600">Active</p>
            <p className="text-2xl font-bold text-gray-900">{activeRestaurants}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">✗</span>
              <div className="w-1.5 h-1.5 rounded-full bg-red-600" />
            </div>
            <p className="text-xs text-gray-600">Inactive</p>
            <p className="text-2xl font-bold text-gray-900">{inactiveRestaurants}</p>
          </div>

          <div className="bg-white p-3 rounded-lg shadow-md border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-400 text-xl">🏙️</span>
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            </div>
            <p className="text-xs text-gray-600">Cities</p>
            <p className="text-2xl font-bold text-gray-900">{cities.length}</p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3 mb-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name, city, cuisine, or contact person..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              />
            </div>
            <div className="md:w-48">
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
              >
                <option value="all">All Cities</option>
                {cities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-colors ${
                showInactive 
                  ? 'bg-white border border-red-300 text-red-700' 
                  : 'bg-white border border-green-300 text-green-700'
              }`}
            >
              {showInactive ? 'Active Only' : 'Show Inactive'}
            </button>
          </div>
          
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              Showing <span className="font-bold text-gray-900">{filteredRestaurants.length}</span> of {restaurants.length} restaurants
            </p>
          </div>
        </div>

        {/* Restaurants Table */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Restaurant</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Type</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Cuisine</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">City</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRestaurants.map((restaurant, index) => (
                <tr key={restaurant.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors`}>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{restaurant.name}</p>
                      {restaurant.address && <p className="text-xs text-gray-500">{restaurant.address}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">
                      {restaurant.restaurant_type || 'Restaurant'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-700">
                    {restaurant.cuisine_type || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {restaurant.city}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      {restaurant.contact_person && <p className="font-medium text-gray-700">{restaurant.contact_person}</p>}
                      {restaurant.phone && <p className="text-gray-600">📞 {restaurant.phone}</p>}
                      {restaurant.whatsapp && <p className="text-green-600">💬 {restaurant.whatsapp}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      restaurant.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {restaurant.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(restaurant)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(restaurant.id, restaurant.name)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRestaurants.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl text-gray-400">🍽️</span>
                      <p className="text-sm font-medium">No restaurants found</p>
                      <button
                        onClick={handleAddNew}
                        className="mt-2 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                      >
                        Add Your First Restaurant
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {editingRestaurant ? 'Edit Restaurant' : 'Add New Restaurant'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              {/* Basic Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Restaurant Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Nile View Restaurant"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Restaurant Type *
                    </label>
                    <select
                      name="restaurant_type"
                      value={formData.restaurant_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                    >
                      <option value="local">🍽️ Local Restaurant</option>
                      <option value="fine_dining">✨ Fine Dining</option>
                      <option value="casual">🍕 Casual Dining</option>
                      <option value="buffet">🍱 Buffet</option>
                      <option value="cafe">☕ Café</option>
                      <option value="fast_food">🍔 Fast Food</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Cuisine Type
                    </label>
                    <input
                      type="text"
                      name="cuisine_type"
                      value={formData.cuisine_type}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Egyptian, Italian, International"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., Cairo"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Address
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="Full address"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      name="contact_person"
                      value={formData.contact_person}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="Name"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="+20 123 456 789"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="contact@restaurant.com"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      WhatsApp
                    </label>
                    <input
                      type="tel"
                      name="whatsapp"
                      value={formData.whatsapp}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="+20 123 456 789"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Capacity (seats)
                    </label>
                    <input
                      type="number"
                      name="capacity"
                      value={formData.capacity}
                      onChange={handleChange}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                      placeholder="e.g., 50"
                    />
                  </div>
                </div>
              </div>

              {/* Meal Types */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Meal Types Offered</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {mealTypesList.map(mealType => (
                    <label key={mealType} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.meal_types.includes(mealType)}
                        onChange={() => toggleMealType(mealType)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{mealType}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dietary Options */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900 mb-3">Dietary Options</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {dietaryOptionsList.map(option => (
                    <label key={option} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.dietary_options.includes(option)}
                        onChange={() => toggleDietaryOption(option)}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent shadow-sm"
                  placeholder="Additional information..."
                />
              </div>

              {/* Active Status */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={handleCheckboxChange}
                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active (available for bookings)</span>
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors"
                >
                  {editingRestaurant ? 'Update Restaurant' : 'Create Restaurant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}