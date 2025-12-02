'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { 
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  CheckCircle,
  Circle,
  Clock,
  AlertTriangle,
  AlertCircle,
  Calendar,
  User,
  Filter,
  ChevronRight,
  Play,
  Link as LinkIcon,
  FileText,
  Users as UsersIcon,
  Receipt,
  MapPin
} from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  role: string
}

interface Task {
  id: string
  title: string
  description: string
  due_date: string
  priority: string
  status: string
  assigned_to: string
  linked_type: string
  linked_id: string
  notes: string
  created_at: string
  updated_at: string
  completed_at: string
  assigned_member?: TeamMember
}

interface Summary {
  total: number
  todo: number
  in_progress: number
  done: number
  overdue: number
  due_today: number
  high_priority: number
}

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600', dot: 'bg-blue-400' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600', dot: 'bg-orange-400' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600', dot: 'bg-red-500' }
]

const STATUSES = [
  { value: 'todo', label: 'To Do', icon: Circle, color: 'text-gray-500' },
  { value: 'in_progress', label: 'In Progress', icon: Play, color: 'text-blue-500' },
  { value: 'done', label: 'Done', icon: CheckCircle, color: 'text-green-500' }
]

const LINKED_TYPES = [
  { value: 'itinerary', label: 'Itinerary', icon: MapPin, path: '/itineraries' },
  { value: 'client', label: 'Client', icon: UsersIcon, path: '/clients' },
  { value: 'invoice', label: 'Invoice', icon: FileText, path: '/invoices' },
  { value: 'expense', label: 'Expense', icon: Receipt, path: '/expenses' }
]

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [dueDateFilter, setDueDateFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    assigned_to: '',
    linked_type: '',
    linked_id: '',
    notes: ''
  })
  const [saving, setSaving] = useState(false)

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (priorityFilter) params.append('priority', priorityFilter)
      if (assigneeFilter) params.append('assignedTo', assigneeFilter)
      if (dueDateFilter) params.append('dueDate', dueDateFilter)

      const response = await fetch(`/api/tasks?${params}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTasks(result.data)
          setSummary(result.summary)
        }
      }
    } catch (error) {
      console.error('Error fetching tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, priorityFilter, assigneeFilter, dueDateFilter])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team-members?active=true')
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setTeamMembers(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching team members:', error)
    }
  }

  useEffect(() => {
    fetchTasks()
    fetchTeamMembers()
  }, [fetchTasks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingTask 
        ? `/api/tasks/${editingTask.id}`
        : '/api/tasks'
      
      const response = await fetch(url, {
        method: editingTask ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          assigned_to: formData.assigned_to || null,
          linked_type: formData.linked_type || null,
          linked_id: formData.linked_id || null
        })
      })

      if (response.ok) {
        setShowModal(false)
        setEditingTask(null)
        resetForm()
        fetchTasks()
      }
    } catch (error) {
      console.error('Error saving task:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (task: Task, newStatus: string) => {
    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error updating task status:', error)
    }
  }

  const handleEdit = (task: Task) => {
    setEditingTask(task)
    setFormData({
      title: task.title || '',
      description: task.description || '',
      due_date: task.due_date || '',
      priority: task.priority || 'medium',
      assigned_to: task.assigned_to || '',
      linked_type: task.linked_type || '',
      linked_id: task.linked_id || '',
      notes: task.notes || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (task: Task) => {
    if (!confirm(`Delete task "${task.title}"?`)) return

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchTasks()
      }
    } catch (error) {
      console.error('Error deleting task:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      due_date: '',
      priority: 'medium',
      assigned_to: '',
      linked_type: '',
      linked_id: '',
      notes: ''
    })
  }

  const openAddModal = () => {
    setEditingTask(null)
    resetForm()
    setShowModal(true)
  }

  const getPriorityConfig = (priority: string) => {
    return PRIORITIES.find(p => p.value === priority) || PRIORITIES[1]
  }

  const getStatusConfig = (status: string) => {
    return STATUSES.find(s => s.value === status) || STATUSES[0]
  }

  const getLinkedTypeConfig = (type: string) => {
    return LINKED_TYPES.find(t => t.value === type)
  }

  const isOverdue = (task: Task) => {
    if (task.status === 'done' || !task.due_date) return false
    return new Date(task.due_date) < new Date(new Date().toDateString())
  }

  const isDueToday = (task: Task) => {
    if (!task.due_date) return false
    const today = new Date().toISOString().split('T')[0]
    return task.due_date === today
  }

  const clearFilters = () => {
    setStatusFilter('')
    setPriorityFilter('')
    setAssigneeFilter('')
    setDueDateFilter('')
  }

  const hasActiveFilters = statusFilter || priorityFilter || assigneeFilter || dueDateFilter

  const filteredTasks = tasks.filter(task => {
    return task.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           task.description?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  // Group tasks by status for kanban-style view
  const tasksByStatus = {
    todo: filteredTasks.filter(t => t.status === 'todo'),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress'),
    done: filteredTasks.filter(t => t.status === 'done')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            ✅
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
            <p className="text-sm text-gray-500">Manage operational tasks and assignments</p>
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[#647C47] text-white rounded-lg hover:bg-[#4f6238] transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 mb-1">Total</p>
            <p className="text-2xl font-semibold text-gray-900">{summary.total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Circle className="h-3 w-3 text-gray-400" />
              <p className="text-xs text-gray-500">To Do</p>
            </div>
            <p className="text-2xl font-semibold text-gray-600">{summary.todo}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Play className="h-3 w-3 text-blue-500" />
              <p className="text-xs text-gray-500">In Progress</p>
            </div>
            <p className="text-2xl font-semibold text-blue-600">{summary.in_progress}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              <p className="text-xs text-gray-500">Done</p>
            </div>
            <p className="text-2xl font-semibold text-green-600">{summary.done}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-3 w-3 text-red-500" />
              <p className="text-xs text-gray-500">Overdue</p>
            </div>
            <p className="text-2xl font-semibold text-red-600">{summary.overdue}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3 w-3 text-amber-500" />
              <p className="text-xs text-gray-500">Due Today</p>
            </div>
            <p className="text-2xl font-semibold text-amber-600">{summary.due_today}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-3 w-3 text-orange-500" />
              <p className="text-xs text-gray-500">High Priority</p>
            </div>
            <p className="text-2xl font-semibold text-orange-600">{summary.high_priority}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-[#647C47]"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'overdue' ? '' : 'overdue')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'overdue' 
                ? 'bg-red-100 text-red-700 border border-red-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Overdue
          </button>
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'today' ? '' : 'today')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'today' 
                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Due Today
          </button>
          <button
            onClick={() => setDueDateFilter(dueDateFilter === 'week' ? '' : 'week')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              dueDateFilter === 'week' 
                ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            This Week
          </button>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-colors ${
            hasActiveFilters 
              ? 'border-[#647C47] text-[#647C47] bg-[#647C47]/5' 
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-[#647C47]"></span>}
        </button>

        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm text-gray-500 hover:text-gray-700">
            Clear
          </button>
        )}
      </div>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Statuses</option>
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Assigned To</label>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Members</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Due Date</label>
              <select
                value={dueDateFilter}
                onChange={(e) => setDueDateFilter(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
              >
                <option value="">All Dates</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="week">This Week</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Kanban-style Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {STATUSES.map(status => {
          const StatusIcon = status.icon
          const statusTasks = tasksByStatus[status.value as keyof typeof tasksByStatus] || []
          
          return (
            <div key={status.value} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-4 w-4 ${status.color}`} />
                  <h3 className="text-sm font-semibold text-gray-900">{status.label}</h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded-full">
                    {statusTasks.length}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {statusTasks.length === 0 ? (
                  <div className="p-4 bg-white border border-dashed border-gray-200 rounded-lg text-center">
                    <p className="text-xs text-gray-400">No tasks</p>
                  </div>
                ) : (
                  statusTasks.map(task => {
                    const priorityConfig = getPriorityConfig(task.priority)
                    const linkedConfig = getLinkedTypeConfig(task.linked_type)
                    const taskIsOverdue = isOverdue(task)
                    const taskIsDueToday = isDueToday(task)

                    return (
                      <div 
                        key={task.id} 
                        className={`bg-white border rounded-lg p-3 hover:shadow-sm transition-shadow ${
                          taskIsOverdue ? 'border-red-200 bg-red-50/50' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-sm font-medium text-gray-900 flex-1">{task.title}</h4>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(task)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(task)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {task.description && (
                          <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                        )}

                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityConfig.color}`}>
                            {priorityConfig.label}
                          </span>
                          
                          {task.due_date && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${
                              taskIsOverdue 
                                ? 'bg-red-100 text-red-600' 
                                : taskIsDueToday 
                                  ? 'bg-amber-100 text-amber-600'
                                  : 'bg-gray-100 text-gray-600'
                            }`}>
                              <Calendar className="h-3 w-3" />
                              {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {task.assigned_member && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <User className="h-3 w-3" />
                                <span>{task.assigned_member.name}</span>
                              </div>
                            )}
                          </div>

                          {linkedConfig && task.linked_id && (
                            <Link
                              href={`${linkedConfig.path}/${task.linked_id}`}
                              className="flex items-center gap-1 text-xs text-[#647C47] hover:underline"
                            >
                              <LinkIcon className="h-3 w-3" />
                              {linkedConfig.label}
                            </Link>
                          )}
                        </div>

                        {/* Quick Status Change */}
                        {status.value !== 'done' && (
                          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                            {status.value === 'todo' && (
                              <button
                                onClick={() => handleStatusChange(task, 'in_progress')}
                                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <Play className="h-3 w-3" />
                                Start
                              </button>
                            )}
                            <button
                              onClick={() => handleStatusChange(task, 'done')}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Complete
                            </button>
                          </div>
                        )}

                        {status.value === 'done' && (
                          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100">
                            <button
                              onClick={() => handleStatusChange(task, 'todo')}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            >
                              <Circle className="h-3 w-3" />
                              Reopen
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingTask ? 'Edit Task' : 'Add Task'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  placeholder="Task title"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={2}
                  placeholder="Task description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Link To</label>
                  <select
                    value={formData.linked_type}
                    onChange={(e) => setFormData({ ...formData, linked_type: e.target.value, linked_id: '' })}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] bg-white"
                  >
                    <option value="">None</option>
                    {LINKED_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {formData.linked_type && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
                    <input
                      type="text"
                      value={formData.linked_id}
                      onChange={(e) => setFormData({ ...formData, linked_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                      placeholder="Enter ID"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47]"
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[#647C47] rounded-lg hover:bg-[#4f6238] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingTask ? 'Update' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-4">
        <p className="text-xs text-gray-400">© 2024 Autoura Operations System</p>
      </div>
    </div>
  )
}