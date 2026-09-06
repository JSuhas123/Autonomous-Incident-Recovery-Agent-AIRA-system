export const PERSONA_EXPERIENCE_MATRIX = {
  administration: {
    landingPath: '/overview',
    primaryExperience: 'OwnerAdminOverviewPage',
    intent: 'organization reliability, teams, integrations, governance, usage',
  },
  operations: {
    landingPath: '/operations',
    primaryExperience: 'OperationsOverviewPage',
    intent: 'incident command, investigation, recovery, human work, verification',
  },
  developer: {
    landingPath: '/services',
    primaryExperience: 'DeveloperOverviewPage',
    intent: 'owned services, relevant incidents, changes, recommendations',
  },
  governance: {
    landingPath: '/governance',
    primaryExperience: 'GovernanceOverviewPage',
    intent: 'policy, execution evidence, audit, trust, certification',
  },
  executive: {
    landingPath: '/overview',
    primaryExperience: 'ExecutiveOverviewPage',
    intent: 'reliability, risk, MTTR, recovery coverage, business impact',
  },
} as const
