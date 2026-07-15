function Navbar() {
  return (
    <nav className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
      
      <div className="text-xl font-bold text-purple-400">
        🤖 TechMentor AI
      </div>

      <div className="flex gap-4">
        <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm">
          My Roadmap
        </button>
        <button className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">
          Progress
        </button>
      </div>

    </nav>
  )
}

export default Navbar