function DashboardCard({ icon, title, value, note }) {
  return (
    <div className="card">
      <h2>{icon} {title}</h2>
      <strong>{value}</strong>
      <p>{note}</p>
    </div>
  )
}

export default DashboardCard