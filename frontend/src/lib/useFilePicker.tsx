import { useRef } from 'react'
import { ACCEPT, fromFileList, type Upload } from './upload'

/** Hidden file picker; call `open()` from any button. */
export function useFilePicker(onFiles: (uploads: Upload[]) => void) {
  const input = useRef<HTMLInputElement>(null)
  const element = (
    <input
      ref={input}
      type="file"
      multiple
      accept={ACCEPT.join(',')}
      className="hidden"
      aria-label="Choose files to import"
      onChange={(e) => { if (e.target.files) onFiles(fromFileList(e.target.files)); e.target.value = '' }}
    />
  )
  return { open: () => input.current?.click(), element }
}
