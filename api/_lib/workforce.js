// Genesis OS AI Workforce — shared employee roster + helpers (P2-2).
//
// Additive module for the /api/jobs functions. It holds the list of specialized
// employees a customer may assign a job to, plus a lightweight keyword-based
// auto-assignment used by POST /api/jobs when the customer doesn't pick one.
// The actual AI production loop (running an employee on a job) is P2-3.
// This module does not touch any provider or existing api/ module.

import { TEAM } from '../../shared/team.js'

export const WORKFORCE_EMPLOYEES = [
  ...TEAM,
  { id: 'business-research-sales', name: 'Business Research & Sales', icon: '🔎' },
  { id: 'content-social-media', name: 'Content & Social Media', icon: '📣' },
  { id: 'software-engineer', name: 'Software Engineer', icon: '💻' },
]

export const JOB_STATUSES = ['queued', 'assigned', 'in_progress', 'delivered', 'cancelled']

const CONTENT_KEYWORDS = [
  'content', 'post', 'social', 'media', 'instagram', 'linkedin', 'facebook',
  'copy', 'caption', 'hashtag', 'blog', 'article', 'newsletter', 'marketing',
  'brand', 'advertise', 'campaign', 'seo',
]

const RESEARCH_KEYWORDS = [
  'research', 'analy', 'market', 'competitor', 'prospect', 'leads', 'lead',
  'sales', 'opportunity', 'industry', 'sizing', 'customer', 'pricing', 'survey',
]

const SOFTWARE_KEYWORDS = [
  'build', 'fix', 'code', 'develop', 'app', 'website', 'site', 'bug',
  'software', 'engineer', 'technical', 'program', 'api', 'database', 'deploy',
  'frontend', 'backend', 'feature',
]

/**
 * Whether a name matches a known workforce employee.
 * @param {string} name
 * @returns {boolean}
 */
export function isKnownEmployee(name) {
  return WORKFORCE_EMPLOYEES.some((employee) => employee.name === name)
}

/**
 * Pick an employee id/name from a brief by simple keyword matching, or null.
 * Content > Research > Software precedence so a "build a content post" brief
 * lands on Content & Social Media.
 * @param {string} brief
 * @returns {string|null} employee name, or null if ambiguous/none matched.
 */
export function pickEmployeeFromBrief(brief) {
  const text = String(brief || '').toLowerCase()
  const specialistRules = [
    [/\betsy\b/, 'Etsy Manager'], [/\bshopify\b/, 'Shopify Manager'],
    [/\bebay\b/, 'eBay Manager'], [/\byoutube\b/, 'YouTube Manager'],
    [/\bcanva\b/, 'Canva Agent'], [/\b(legal|copyright|trademark|contract)\b/, 'Legal Research & Review'],
    [/\b(fulfillment|shipment|shipping|supplier)\b/, 'Fulfillment Manager'],
    [/\b(customer support|customer service|refund|complaint)\b/, 'Customer Support'],
    [/\b(design|visual|logo)\b/, 'Design Director'], [/\b(product|catalog)\b/, 'Product Manager'],
    [/\b(marketing|campaign)\b/, 'Marketing Manager'], [/\b(store|storefront)\b/, 'Store Builder'],
    [/\b(boss|team|coordinate|business plan)\b/, 'AI Boss'],
  ]
  const matched = specialistRules.find(([pattern]) => pattern.test(text))
  if (matched) return matched[1]

  if (CONTENT_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'Content & Social Media'
  }
  if (RESEARCH_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'Business Research & Sales'
  }
  if (SOFTWARE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'Software Engineer'
  }

  return null
}
