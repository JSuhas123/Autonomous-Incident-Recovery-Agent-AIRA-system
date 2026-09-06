type StreamCloser =
  () => void


let scopeController =
  new AbortController()


const streamClosers =
  new Set<
    StreamCloser
  >()


export function getProductScopeSignal() {
  return scopeController
    .signal
}


export function rotateProductScope() {
  scopeController.abort()

  scopeController =
    new AbortController()


  for (
    const close
    of streamClosers
  ) {
    try {
      close()
    } catch {
      // A failing stream cleanup must not block tenant transition.
    }
  }


  streamClosers.clear()


  return scopeController
    .signal
}


export function registerProductStream(
  closer:
    StreamCloser,
) {
  streamClosers.add(
    closer,
  )


  return () => {
    streamClosers.delete(
      closer,
    )
  }
}


export function closeAllProductStreams() {
  for (
    const close
    of streamClosers
  ) {
    try {
      close()
    } catch {
      // Isolation cleanup is best effort for individual stream handles.
    }
  }


  streamClosers.clear()
}