TopBar.jsx
function TopBar() {
  const today = new Date()

  return (
    <header className="topbar">
      <div>
        <h2>Genesis OS Alpha 1</h2>
      </div>

      <div>
        {today.toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </header>
  )
}

export default TopBar
