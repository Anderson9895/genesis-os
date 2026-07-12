function TopBar({ user, onLogout }) {
  const displayName = user?.user_metadata?.full_name || user?.email || 'Genesis User'
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || ''
  const initials = displayName
    .split(' ')
    .map((part) => part[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="topbar">
      <h2>Genesis OS</h2>

      <div className="topbar-right">
        <div className="topbar-user">
          {avatarUrl ? (
            <img className="avatar" src={avatarUrl} alt={displayName} />
          ) : (
            <div className="avatar avatar-fallback">{initials}</div>
          )}
          <div>
            <div className="topbar-user-name">{displayName}</div>
            <div className="topbar-user-role">{user?.email || 'Signed in'}</div>
          </div>
        </div>
        <button type="button" className="secondary-action" onClick={onLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

export default TopBar;