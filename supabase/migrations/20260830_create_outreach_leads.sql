-- Genesis OS — Outreach lead tracking (additive).
--
-- Each record belongs to an authenticated Genesis OS account, following the
-- jobs/deliverables RLS pattern. The seed uses every account present at the
-- time this migration is applied so it does not guess an owner UUID. Each
-- account receives its own 10-record, editable tracking list.

create table if not exists public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text not null,
  role text not null,
  source_link text not null,
  channel text not null,
  message_text text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'responded', 'followed_up', 'closed')),
  sent_at timestamptz,
  response_text text not null default '',
  follow_up_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_leads_user_name_unique unique (user_id, name)
);

alter table public.outreach_leads enable row level security;

grant select, insert, update, delete on table public.outreach_leads to authenticated;

drop policy if exists "Users can view their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can insert their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can update their own outreach leads" on public.outreach_leads;
drop policy if exists "Users can delete their own outreach leads" on public.outreach_leads;

create policy "Users can view their own outreach leads"
  on public.outreach_leads
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own outreach leads"
  on public.outreach_leads
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own outreach leads"
  on public.outreach_leads
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own outreach leads"
  on public.outreach_leads
  for delete
  using (auth.uid() = user_id);

-- Approved draft prospects only. All records deliberately begin as pending:
-- this migration sends nothing and does not represent any send event.
with approved_prospects (
  name, company, role, source_link, channel, message_text
) as (
  values
    (
      'Racheal Cook',
      'The CEO Collective',
      'CEO & Founder; business-strategy coach for women entrepreneurs; host of the Promote Yourself to CEO podcast',
      'https://rachealcook.com/about',
      'LinkedIn DM',
      $racheal$Hi Racheal,

I came across your *Promote Yourself to CEO* podcast and the 90 Day CEO Operating System you teach women entrepreneurs, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$racheal$
    ),
    (
      'Jadah Sellner',
      'Jadah Sellner Media',
      'Founder & CEO; business mentor; author; TEDx speaker; host of the Lead with Love podcast',
      'https://jadahsellner.com/about',
      'LinkedIn DM',
      $jadah$Hi Jadah,

I came across your *Lead with Love* podcast and how you help visionaries grow a business they love without burning out, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$jadah$
    ),
    (
      'Natalie MacNeil',
      'Natalie MacNeil / AI Dream Team',
      'Emmy Award-winning media entrepreneur, futurist, mentor and author',
      'https://nataliemacneil.com/about',
      'LinkedIn DM',
      $macneil$Hi Natalie,

I came across your AI Dream Team mastermind and how you help heart-led leaders build from the future, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$macneil$
    ),
    (
      'Mel Abraham',
      'Mel Abraham',
      'CPA, author, financial/business keynote speaker and podcast host',
      'https://melabraham.com/about',
      'LinkedIn DM',
      $mel$Hi Mel,

I came across your *Building Your Money Machine* book and the Fully Expressed system you teach entrepreneurs, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$mel$
    ),
    (
      'Denise Duffield-Thomas',
      'Money Bootcamp',
      'Money Mindset Mentor, coach, author and podcaster',
      'https://www.denisedt.com/',
      'Site contact form',
      $denise$Hi Denise,

I came across your Money Bootcamp program and the Sacred Money Archetypes work you share with entrepreneurs, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$denise$
    ),
    (
      'Selena Soo',
      'Selena Soo',
      'Publicity and marketing strategist for experts, authors and coaches',
      'https://www.selenasoo.com/about',
      'Site contact form',
      $selena$Hi Selena,

I came across how you help experts, authors, and coaches go from hidden gem to admired industry leader, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$selena$
    ),
    (
      'Natalie Sisson',
      'LifePilot',
      'Author, speaker, cofounder of the LifePilot methodology and podcast host',
      'https://nataliesisson.com/',
      'Site contact form',
      $sisson$Hi Natalie,

I came across your LifePilot methodology and the freedom-plan work you share with entrepreneurs, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$sisson$
    ),
    (
      'Jenny Shih',
      'Jenny Shih',
      'Business coach for experienced business owners',
      'https://jennyshih.com/about',
      'Site contact form',
      $jenny$Hi Jenny,

I came across your "Success On Your Terms" work with experienced business owners navigating change, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$jenny$
    ),
    (
      'Jasmine Star',
      'Jasmine Star',
      'CEO, motivational speaker, marketing consultant, course creator and podcast host',
      'https://jasminestar.com/about',
      'Instagram/LinkedIn DM',
      $jasmine$Hi Jasmine,

I came across how you built your brand from a free blog into a 7-figure content business — photographer to course creator to CEO — and it stuck with me. Clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$jasmine$
    ),
    (
      'Amy Porterfield',
      'Amy Porterfield LLC',
      'Online business expert and strategist, author, podcast host and course creator',
      'https://www.amyporterfield.com/about',
      'LinkedIn DM',
      $amy$Hi Amy,

I came across your *Online Marketing Made Easy* podcast and how you help entrepreneurs build online businesses, and it stuck with me — clear, useful, the kind of thing more people should see.

I run a done-for-you content service: a month of LinkedIn/Instagram/Facebook posts in your voice — 4 posts/week, with themes, hashtags, and a publish calendar. You approve every post before it goes anywhere; nothing is auto-published. One-time pack, $149, delivered in about 10–14 days. I promise finished content you can use — not follower growth or leads, which isn't honest to promise.

Zero risk: if you don't like the first week of posts, you owe nothing.

If it's not a fit, just say so — no hard feelings and no follow-up pressure. Want me to send a sample week so you can see the style first?

— [sender name], Genesis OS$amy$
    )
)
insert into public.outreach_leads (
  user_id, name, company, role, source_link, channel, message_text, status
)
select
  users.id, prospects.name, prospects.company, prospects.role,
  prospects.source_link, prospects.channel, prospects.message_text, 'pending'
from auth.users as users
cross join approved_prospects as prospects
on conflict (user_id, name) do nothing;
