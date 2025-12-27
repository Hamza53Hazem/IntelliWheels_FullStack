export default function Dashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back to IntelliWheels Enhanced.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-2">Total Cars</h3>
          <p className="text-3xl font-bold text-blue-600">1,240</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-2">AI Queries</h3>
          <p className="text-3xl font-bold text-purple-600">85</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-2">Favorites</h3>
          <p className="text-3xl font-bold text-red-600">12</p>
        </div>
      </div>
    </div>
  );
}
