type RecordButtonProps = {
  variant?: 'primary' | 'danger' | 'ghost'
  onClick: () => void
  children: string
  disabled?: boolean
}

export function RecordButton({
  variant = 'primary',
  onClick,
  children,
  disabled = false,
}: RecordButtonProps) {
  const className = ['primary-btn', variant === 'primary' ? '' : variant]
    .join(' ')
    .trim()

  return (
    <button className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
