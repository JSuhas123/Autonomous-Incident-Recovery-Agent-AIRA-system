import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CircleGauge,
  ClipboardCheck,
  FileCheck2,
  FileSearch,
  Fingerprint,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  Network,
  Plug,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  Siren,
  Users,
  Wrench,
} from 'lucide-react'

import type {
  LucideIcon,
} from 'lucide-react'

import {
  PRODUCT_PERSONAS,
  type ProductPersona,
} from './product.types'


export type ProductNavigationSection =
  | 'overview'
  | 'operations'
  | 'organization'
  | 'governance'
  | 'knowledge'
  | 'commercial'
  | 'system'


export interface ProductNavigationItem {
  id: string

  label: string

  path: string

  icon: LucideIcon

  section: ProductNavigationSection

  personas:
    ProductPersona[]

  permissions?: string[]

  requireAllPermissions?:
    boolean

  description?: string
}


export interface ProductNavigationGroup {
  id:
    ProductNavigationSection

  label: string

  items:
    ProductNavigationItem[]
}


const ADMIN =
  PRODUCT_PERSONAS.ADMINISTRATION

const OPS =
  PRODUCT_PERSONAS.OPERATIONS

const DEV =
  PRODUCT_PERSONAS.DEVELOPER

const GOV =
  PRODUCT_PERSONAS.GOVERNANCE

const EXEC =
  PRODUCT_PERSONAS.EXECUTIVE


export const PRODUCT_NAVIGATION_ITEMS:
  ProductNavigationItem[] = [
    {
      id:
        'overview',

      label:
        'Overview',

      path:
        '/overview',

      icon:
        LayoutDashboard,

      section:
        'overview',

      personas: [
        ADMIN,
        EXEC,
      ],

      description:
        'Organization reliability overview.',
    },

    {
      id:
        'operations',

      label:
        'Operations',

      path:
        '/operations',

      icon:
        Activity,

      section:
        'operations',

      personas: [
        OPS,
        ADMIN,
      ],

      description:
        'Live operational state across AIRA-managed services.',
    },

    {
      id:
        'incidents',

      label:
        'Incidents',

      path:
        '/incidents',

      icon:
        Siren,

      section:
        'operations',

      personas: [
        ADMIN,
        OPS,
        DEV,
        GOV,
      ],
    },

    {
      id:
        'investigation',

      label:
        'Investigation',

      path:
        '/investigation',

      icon:
        FileSearch,

      section:
        'operations',

      personas: [
        OPS,
        DEV,
      ],
    },

    {
      id:
        'topology',

      label:
        'Topology',

      path:
        '/topology',

      icon:
        Network,

      section:
        'operations',

      personas: [
        OPS,
        DEV,
      ],
    },

    {
      id:
        'resources',

      label:
        'Resources',

      path:
        '/resources',

      icon:
        Boxes,

      section:
        'operations',

      personas: [
        OPS,
        DEV,
        ADMIN,
      ],
    },

    {
      id:
        'recovery',

      label:
        'Recovery',

      path:
        '/recovery',

      icon:
        RotateCcw,

      section:
        'operations',

      personas: [
        OPS,
        ADMIN,
      ],
    },

    {
      id:
        'human-tasks',

      label:
        'Human Tasks',

      path:
        '/human-tasks',

      icon:
        ClipboardCheck,

      section:
        'operations',

      personas: [
        OPS,
        ADMIN,
      ],
    },

    {
      id:
        'approvals',

      label:
        'Approvals',

      path:
        '/approvals',

      icon:
        ShieldCheck,

      section:
        'operations',

      personas: [
        OPS,
        ADMIN,
        GOV,
      ],
    },

    {
      id:
        'reliability',

      label:
        'Reliability',

      path:
        '/reliability',

      icon:
        HeartPulse,

      section:
        'operations',

      personas: [
        ADMIN,
        OPS,
        DEV,
        EXEC,
      ],
    },

    {
      id:
        'services',

      label:
        'My Services',

      path:
        '/services',

      icon:
        Boxes,

      section:
        'operations',

      personas: [
        DEV,
      ],
    },

    {
      id:
        'changes',

      label:
        'Changes',

      path:
        '/changes',

      icon:
        GitBranch,

      section:
        'operations',

      personas: [
        DEV,
        OPS,
      ],
    },

    {
      id:
        'recommendations',

      label:
        'Recommendations',

      path:
        '/recommendations',

      icon:
        Wrench,

      section:
        'operations',

      personas: [
        DEV,
        OPS,
      ],
    },

    {
      id:
        'integrations',

      label:
        'Integrations',

      path:
        '/integrations',

      icon:
        Plug,

      section:
        'organization',

      personas: [
        ADMIN,
        OPS,
      ],
    },

    {
      id:
        'team',

      label:
        'Team',

      path:
        '/team',

      icon:
        Users,

      section:
        'organization',

      personas: [
        ADMIN,
      ],
    },

    {
      id:
        'organization',

      label:
        'Organization',

      path:
        '/organization',

      icon:
        Building2,

      section:
        'organization',

      personas: [
        ADMIN,
      ],
    },

    {
      id:
        'runbooks',

      label:
        'Runbooks',

      path:
        '/runbooks',

      icon:
        BookOpen,

      section:
        'knowledge',

      personas: [
        OPS,
        DEV,
        ADMIN,
      ],
    },

    {
      id:
        'playbooks',

      label:
        'Playbooks',

      path:
        '/playbooks',

      icon:
        ScrollText,

      section:
        'knowledge',

      personas: [
        OPS,
        ADMIN,
      ],
    },

    {
      id:
        'governance',

      label:
        'Governance',

      path:
        '/governance',

      icon:
        ShieldCheck,

      section:
        'governance',

      personas: [
        GOV,
        ADMIN,
      ],
    },

    {
      id:
        'policies',

      label:
        'Policies',

      path:
        '/policies',

      icon:
        LockKeyhole,

      section:
        'governance',

      personas: [
        GOV,
        ADMIN,
      ],
    },

    {
      id:
        'audit',

      label:
        'Audit',

      path:
        '/audit',

      icon:
        ScrollText,

      section:
        'governance',

      personas: [
        GOV,
        ADMIN,
      ],
    },

    {
      id:
        'trust',

      label:
        'Trust',

      path:
        '/trust',

      icon:
        Fingerprint,

      section:
        'governance',

      personas: [
        GOV,
        OPS,
        ADMIN,
      ],
    },

    {
      id:
        'certification',

      label:
        'Certification',

      path:
        '/certification',

      icon:
        FileCheck2,

      section:
        'governance',

      personas: [
        GOV,
        ADMIN,
      ],
    },

    {
      id:
        'analytics',

      label:
        'Analytics',

      path:
        '/analytics',

      icon:
        BarChart3,

      section:
        'commercial',

      personas: [
        ADMIN,
        EXEC,
      ],
    },

    {
      id:
        'usage',

      label:
        'Usage',

      path:
        '/usage',

      icon:
        CircleGauge,

      section:
        'commercial',

      personas: [
        ADMIN,
      ],
    },

    {
      id:
        'notifications',

      label:
        'Notifications',

      path:
        '/notifications',

      icon:
        Bell,

      section:
        'system',

      personas: [
        ADMIN,
        OPS,
        DEV,
        GOV,
      ],
    },

    {
      id:
        'settings',

      label:
        'Settings',

      path:
        '/settings',

      icon:
        Settings,

      section:
        'system',

      personas: [
        ADMIN,
        OPS,
        DEV,
        GOV,
      ],
    },
  ]


const SECTION_LABELS:
  Record<
    ProductNavigationSection,
    string
  > = {
    overview:
      'Workspace',

    operations:
      'Operations',

    organization:
      'Organization',

    governance:
      'Governance',

    knowledge:
      'Knowledge',

    commercial:
      'Insights',

    system:
      'System',
  }


export function getNavigationForPersona(
  persona:
    ProductPersona,
  permissions:
    string[] = [],
) {
  const permissionSet =
    new Set(
      permissions,
    )


  const visible =
    PRODUCT_NAVIGATION_ITEMS
      .filter(
        (item) =>
          item.personas.includes(
            persona,
          ),
      )
      .filter(
        (item) => {
          if (
            !item.permissions ||
            item.permissions.length ===
              0
          ) {
            return true
          }


          if (
            item
              .requireAllPermissions
          ) {
            return item
              .permissions
              .every(
                (permission) =>
                  permissionSet.has(
                    permission,
                  ),
              )
          }


          return item
            .permissions
            .some(
              (permission) =>
                permissionSet.has(
                  permission,
                ),
            )
        },
      )


  const sectionOrder:
    ProductNavigationSection[] = [
      'overview',
      'operations',
      'organization',
      'governance',
      'knowledge',
      'commercial',
      'system',
    ]


  return sectionOrder
    .map(
      (section) => ({
        id:
          section,

        label:
          SECTION_LABELS[
            section
          ],

        items:
          visible.filter(
            (item) =>
              item.section ===
              section,
          ),
      }),
    )
    .filter(
      (group) =>
        group.items.length >
        0,
    )
}


export function getPrimaryLandingPath(
  persona:
    ProductPersona,
) {
  switch (persona) {
    case ADMIN:
      return '/overview'

    case OPS:
      return '/operations'

    case DEV:
      return '/services'

    case GOV:
      return '/governance'

    case EXEC:
      return '/overview'

    default:
      return '/overview'
  }
}