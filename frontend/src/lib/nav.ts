import { createContext, useContext } from 'react'

/** Open state of the sidebar drawer on screens narrower than `lg`. */
export type NavCtx = { open: boolean; setOpen: (open: boolean) => void }

export const NavContext = createContext<NavCtx>({ open: false, setOpen: () => {} })

export const useNav = () => useContext(NavContext)
