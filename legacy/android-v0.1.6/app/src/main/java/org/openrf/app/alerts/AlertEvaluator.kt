package org.openrf.app.alerts

/** Intentionally no alerts in v0.1: cannot warn from an unvalidated database. */
interface AlertEvaluator<T> { fun evaluate(observation: T): Boolean }
