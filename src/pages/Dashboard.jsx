import DashboardCard from "../components/DashboardCard"
import { dashboardCards } from "../data/dashboardData"

function Dashboard() {
  return (
    <>
      <h1>Welcome, Anderson.</h1>
      <p>Your AI business command center is alive and growing.</p>

      <div className="grid">
        {dashboardCards.map((card) => (
          <DashboardCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            value={card.value}
            note={card.note}
          />
        ))}
      </div>
    </>
  )
}

export default Dashboard