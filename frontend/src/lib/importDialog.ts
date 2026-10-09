import { createContext, useContext } from 'react'
import type { Upload } from './upload'

/** Opens the app-wide "Import a folder as a new Space" dialog from anywhere. */
export type ImportDialogCtx = { open: (dropped?: Upload[]) => void }

export const ImportDialogContext = createContext<ImportDialogCtx>({ open: () => {} })

export const useImportDialog = () => useContext(ImportDialogContext)
