import {
  incidentCommandApi,
} from '@/api/incidentCommandApi'

import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'


function useCommandInvalidation() {
  const queryClient =
    useQueryClient()


  return async (
    incidentId: string,
  ) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          'incident-command',
          incidentId,
        ],
      }),

      queryClient.invalidateQueries({
        queryKey: [
          'incidents',
          incidentId,
        ],
      }),

      queryClient.invalidateQueries({
        queryKey: [
          'incidents',
          incidentId,
          'timeline',
        ],
      }),

      queryClient.invalidateQueries({
        queryKey: [
          'incidents',
        ],
      }),
    ])
  }
}


export function useIncidentCommand(
  incidentId: string,
) {
  return useQuery({
    queryKey: [
      'incident-command',
      incidentId,
    ],

    queryFn: ({
      signal,
    }) =>
      incidentCommandApi.get(
        incidentId,
        signal,
      ),

    enabled:
      Boolean(
        incidentId,
      ),

    /*
     * Human control state is time-sensitive.
     *
     * Polling is only for visibility.
     * PostgreSQL remains the authority.
     */
    refetchInterval:
      15_000,

    refetchOnWindowFocus:
      true,
  })
}


export function useAcknowledgeHumanTask() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      taskId,
    }: {
      incidentId: string
      taskId: string
    }) =>
      incidentCommandApi
        .acknowledge(
          incidentId,
          {
            taskId,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}


export function useRequestHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      taskId,
      reason,
    }: {
      incidentId: string
      taskId: string
      reason?: string
    }) =>
      incidentCommandApi
        .requestControl(
          incidentId,
          {
            taskId,
            reason,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}


export function useAuthorizeHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      sessionId,
    }: {
      incidentId: string
      sessionId: string
    }) =>
      incidentCommandApi
        .authorizeControl(
          incidentId,
          {
            sessionId,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}


export function useAcquireHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      sessionId,
      leaseDurationMs,
    }: {
      incidentId: string
      sessionId: string
      leaseDurationMs?: number
    }) =>
      incidentCommandApi
        .acquireControl(
          incidentId,
          {
            sessionId,

            leaseDurationMs:
              leaseDurationMs ??
              300_000,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}


export function useHeartbeatHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      leaseId,
      extensionMs,
    }: {
      incidentId: string
      leaseId: string
      extensionMs?: number
    }) =>
      incidentCommandApi
        .heartbeatControl(
          incidentId,
          {
            leaseId,

            extensionMs:
              extensionMs ??
              300_000,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}


export function useReturnHumanControl() {
  const invalidate =
    useCommandInvalidation()


  return useMutation({
    mutationFn: ({
      incidentId,
      leaseId,
      reason,
    }: {
      incidentId: string
      leaseId: string
      reason?: string
    }) =>
      incidentCommandApi
        .returnControl(
          incidentId,
          {
            leaseId,
            reason,
          },
        ),

    onSuccess: async (
      _,
      {
        incidentId,
      },
    ) => {
      await invalidate(
        incidentId,
      )
    },
  })
}