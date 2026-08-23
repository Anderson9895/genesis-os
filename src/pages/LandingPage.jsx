const crew = [
  ['⌂', 'Operations', 'Plans the day, tracks the work, and keeps every moving part aligned.'],
  ['↗', 'Sales', 'Finds opportunities, follows up, and helps turn conversations into revenue.'],
  ['◉', 'Marketing', 'Creates campaigns, sharpens your message, and grows your reach.'],
  ['◌', 'Customer Care', 'Responds quickly, solves problems, and keeps customers coming back.'],
  ['$', 'Finance', 'Tracks the numbers, prepares reports, and watches the bottom line.'],
  ['⚖', 'Legal Research', 'Organizes research, flags risks, and prepares questions for licensed counsel.'],
]

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
}

function LandingPage() {
  return (
    <main>
      <header className="nav-shell">
        <a className="brand" href="#top"><BrandMark /><span>GENESIS <b>OS</b></span></a>
        <nav>
          <a href="#workforce">AI Employees</a>
          <a href="#how">How It Works</a>
          <a href="#why">Why Genesis</a>
        </nav>
        <div className="nav-actions">
          <a className="login" href="/login">Sign In</a>
          <a className="button small" href="/build-my-team">Build My AI Team</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow"><span /> Built for people who build things</p>
          <h1>Old-School Grit.<br /><em>New-World Intelligence.</em></h1>
          <p className="hero-copy">Build an AI workforce that works as hard as you do—one dependable team, managed from one command center.</p>
          <div className="hero-actions">
            <a className="button" href="/build-my-team">Build My AI Team <b>→</b></a>
            <a className="text-button" href="#how"><span>▶</span> See How It Works</a>
          </div>
          <div className="trust-line">
            <span className="avatars"><i>O</i><i>S</i><i>M</i><i>+</i></span>
            <p><strong>Your crew is ready.</strong><br />Specialized AI employees, working together.</p>
          </div>
        </div>

        <aside className="command">
          <div className="command-top">
            <div><BrandMark /><span>COMMAND CENTER</span></div>
            <span><i className="live-dot" /> LIVE</span>
          </div>
          <div className="command-grid">
            <article className="metric"><small>AI EMPLOYEES ONLINE</small><strong>6</strong><span>All systems operational</span></article>
            <article className="metric"><small>TASKS COMPLETED</small><strong>247</strong><span>↑ 18% this month</span></article>
          </div>
          <div className="today">
            <div><small>TODAY'S PLAN</small><span>Sunday, August 23</span></div>
            {[
              ['6:00', 'Operations briefing', 'Systems check & priorities'],
              ['9:30', 'Sales outreach', '12 accounts in queue'],
              ['12:00', 'Marketing campaign', 'Launch day'],
              ['3:00', 'Customer follow-up', '8 open conversations'],
            ].map((item) => <p key={item[1]}><b>{item[0]}</b><span>{item[1]}<small>{item[2]}</small></span><i>✓</i></p>)}
          </div>
          <div className="command-foot"><span><i /> Genesis OS is working</span><b>24/7</b></div>
        </aside>
      </section>

      <section className="workforce" id="workforce">
        <div className="section-heading">
          <p className="eyebrow"><span /> MEET THE CREW</p>
          <h2>One vision. A whole team<br /><em>ready to work.</em></h2>
          <p>Choose the specialists you need. Genesis OS helps them share context, coordinate their work, and move your business forward.</p>
        </div>
        <div className="agent-grid">
          {crew.map((agent, index) => (
            <article className="agent-card" key={agent[1]}>
              <span className={`agent-icon ${index % 2 ? 'blue' : 'copper'}`}>{agent[0]}</span>
              <div><h3>{agent[1]}</h3><p>{agent[2]}</p><a href="/build-my-team">Meet this employee <b>→</b></a></div>
            </article>
          ))}
        </div>
      </section>

      <section className="how" id="how">
        <div className="how-copy">
          <p className="eyebrow"><span /> HOW IT WORKS</p>
          <h2>Put your team to work<br />in three simple steps.</h2>
          <p>No coding. No complicated setup. Tell Genesis OS what you're building, choose your crew, and give them the goal.</p>
        </div>
        <ol>
          {[
            ['01', 'Tell us the mission', 'Describe your business, your challenge, and the outcome you want.'],
            ['02', 'Build your crew', 'Select specialized AI employees or let Genesis OS recommend the right team.'],
            ['03', 'Lead from one place', 'Approve work, set priorities, and see progress from your command center.'],
          ].map((step) => <li key={step[0]}><b>{step[0]}</b><div><h3>{step[1]}</h3><p>{step[2]}</p></div></li>)}
        </ol>
      </section>

      <section className="promise" id="why">
        <BrandMark />
        <p>BUILT FOR THE LONG HAUL</p>
        <h2>Technology changes fast.<br /><em>Dependability never goes out of style.</em></h2>
        <a className="button" href="/build-my-team">Start Building Your Team <b>→</b></a>
      </section>

      <footer id="demo">
        <a className="brand" href="#top"><BrandMark /><span>GENESIS <b>OS</b></span></a>
        <p>Old-school grit. New-world intelligence.</p>
        <span>© 2026 Genesis OS</span>
      </footer>
    </main>
  )
}

export default LandingPage
