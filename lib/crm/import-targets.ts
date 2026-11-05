export const IMPORT_TARGETS = {
  'company.name': 'Company name',
  'company.domain': 'Company domain / website',
  'company.industry': 'Company industry',
  'company.size': 'Company size',
  'company.city': 'Company city',
  'company.country': 'Company country',
  'company.linkedinUrl': 'Company LinkedIn',
  'company.priority': 'Company priority',
  'company.description': 'Company notes',
  'person.firstName': 'First name',
  'person.lastName': 'Last name',
  'person.fullName': 'Full name',
  'person.email': 'Email',
  'person.phone': 'Phone',
  'person.jobTitle': 'Job title',
  'person.linkedinUrl': 'Person LinkedIn',
  'deal.name': 'Deal name',
  'deal.amount': 'Deal amount',
  'deal.stage': 'Deal stage',
  'company.custom': 'Company custom field',
  'person.custom': 'Person custom field',
} as const
export type ImportTarget = keyof typeof IMPORT_TARGETS

/** Best guess of the target of a CSV column from its header. */
export function guessTarget(header: string): ImportTarget | '' {
  const h = header.toLowerCase().replace(/[^a-z]/g, '')
  const rules: [RegExp, ImportTarget][] = [
    [/^(company|companyname|organization|organisation|account|entreprise|societe)$/, 'company.name'],
    [/^(website|domain|url|site|companywebsite|companydomain)$/, 'company.domain'],
    [/^(sector|industry|secteur)$/, 'company.industry'],
    [/size|employees|headcount|effectif/, 'company.size'],
    [/^(city|ville|location)$/, 'company.city'],
    [/^(country|pays)$/, 'company.country'],
    [/^(priority|tier)$/, 'company.priority'],
    [/^notes?$/, 'company.description'],
    [/^(firstname|prenom|givenname)$/, 'person.firstName'],
    [/^(lastname|nom|surname|familyname)$/, 'person.lastName'],
    [/^(name|fullname|contactname|contact)$/, 'person.fullName'],
    [/email|mail/, 'person.email'],
    [/phone|mobile|tel/, 'person.phone'],
    [/^(title|jobtitle|position|role|poste|contactrole)$/, 'person.jobTitle'],
    [/linkedin/, 'person.linkedinUrl'],
    [/^(deal|dealname|opportunity)$/, 'deal.name'],
    [/amount|value|montant/, 'deal.amount'],
    [/^(stage|step|status)$/, 'deal.stage'],
  ]
  return rules.find(([pattern]) => pattern.test(h))?.[1] ?? ''
}
