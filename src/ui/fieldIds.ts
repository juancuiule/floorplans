import { createContext, useContext, useId } from 'react'

// Ties a Field's label to the control inside it (aria-labelledby / htmlFor).

export const FieldIds = createContext<{ labelId: string; controlId: string } | null>(null)

export function useFieldIds() {
  const fallback = useId()
  return useContext(FieldIds) ?? { labelId: `${fallback}-l`, controlId: `${fallback}-c` }
}

/** Id for a native control inside a Field, so the Field's label points at it. */
export const useFieldControlId = () => useFieldIds().controlId
